"""Market prices for the seller's items.

Source today: Apify actors (public search / sold listings on eBay, Vinted, Leboncoin) — a stated fallback until
official marketplace APIs (eBay Browse / Marketplace Insights, Etsy Open API) are available.
Every fetched listing is published to Kafka (`octohandy.market`) and sunk into ClickHouse (`market_listings`) by
the worker, so price history accumulates over time. Results are cached in Valkey (or in-process) for 6 h.
"""
from __future__ import annotations

import json
import logging
import re
import statistics
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

import httpx

from . import events
from .settings import settings

log = logging.getLogger("octohandy.market")

CACHE_TTL = 6 * 3600
APIFY_TIMEOUT = 150


class MarketError(Exception):
    """Plain-English message safe to show to the seller."""


# marketplace -> actor + how to build its input. kind = what the price means.
ACTORS: dict[str, dict[str, Any]] = {
    "ebay": {
        "actor": "caffein.dev~ebay-sold-listings",
        "kind": "sold",
        "label": "Sold on eBay",
        "input": lambda q, n: {"keywords": [q], "count": n, "ebaySite": "ebay.fr", "daysToScrape": 60},
    },
    "vinted": {
        "actor": "epicscrapers~vinted-search-scraper",
        "kind": "asking",
        "label": "Asking on Vinted",
        "input": lambda q, n: {"keywords": [q], "country": "fr", "maxProducts": n},
    },
    "leboncoin": {
        "actor": "clearpath~leboncoin-api",
        "kind": "asking",
        "label": "Asking on Leboncoin",
        "input": lambda q, n: {"searchQuery": q, "adLimit": n, "includeSeller": False, "shippable": True},
    },
}


def configured() -> bool:
    return bool(settings.apify_token)


def normalize_query(q: str) -> str:
    return re.sub(r"\s+", " ", (q or "").strip().lower())[:120]


# ---------------------------------------------------------------- Apify

def _tokens() -> list[str]:
    return [t for t in (settings.apify_token, settings.apify_token_fallback) if t]


def _run_actor(marketplace: str, query: str, limit: int) -> list[dict[str, Any]]:
    spec = ACTORS[marketplace]
    body = spec["input"](query, limit)
    url = f"https://api.apify.com/v2/acts/{spec['actor']}/run-sync-get-dataset-items"
    last: str = "market data source not configured"
    for token in _tokens():
        try:
            r = httpx.post(url, params={"timeout": APIFY_TIMEOUT - 10, "memory": 1024, "clean": "true"},
                           headers={"Authorization": f"Bearer {token}"}, json=body, timeout=APIFY_TIMEOUT)
        except httpx.HTTPError as e:
            last = f"market data source unreachable ({e.__class__.__name__})"
            continue
        if r.status_code in (402, 403, 429) or (r.status_code >= 400 and "credit" in r.text.lower()):
            last = "market data credits exhausted"
            log.warning("apify token rejected (%s) for %s, trying next", r.status_code, marketplace)
            continue
        if r.status_code >= 400:
            last = f"market data source error ({r.status_code})"
            log.warning("apify %s %s: %s", marketplace, r.status_code, r.text[:200])
            break
        data = r.json()
        return data if isinstance(data, list) else []
    raise MarketError(f"Could not fetch market prices for {marketplace}: {last}.")


# ---------------------------------------------------------------- normalisation

def _num(value: Any) -> float | None:
    if value is None or value == "" or value == "None":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict):
        for k in ("amount", "value", "price", "numeric"):
            if k in value:
                return _num(value[k])
        return None
    s = str(value).replace("\u202f", "").replace("\xa0", "").replace(" ", "")
    m = re.search(r"-?\d+(?:[.,]\d+)?", s)
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", "."))
    except ValueError:
        return None


def _first(item: dict[str, Any], keys: tuple[str, ...], conv: Callable[[Any], Any] = lambda v: v) -> Any:
    for k in keys:
        cur: Any = item
        for part in k.split("."):
            if isinstance(cur, dict):
                cur = cur.get(part)
            elif isinstance(cur, list) and part.isdigit():
                cur = cur[int(part)] if len(cur) > int(part) else None
            else:
                cur = None
            if cur is None:
                break
        if cur not in (None, "", "None"):
            out = conv(cur)
            if out not in (None, ""):
                return out
    return None


def _date(value: Any) -> str | None:
    if value in (None, "", "None"):
        return None
    if isinstance(value, (int, float)):
        ts = float(value) / (1000 if value > 1e11 else 1)
        return datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(value))
    return m.group(1) if m else None


def _image(value: Any) -> str | None:
    if isinstance(value, dict):
        for k in ("url", "full_size_url", "thumbnailUrl", "src"):
            if isinstance(value.get(k), str):
                return value[k]
        return None
    if isinstance(value, list):
        return _image(value[0]) if value else None
    return str(value) if isinstance(value, str) and value.startswith("http") else None


def normalize_item(marketplace: str, item: dict[str, Any], keyword: str) -> dict[str, Any] | None:
    """One Apify row (any actor) -> our flat market listing. None when there is no usable price."""
    if not isinstance(item, dict):
        return None
    price = _first(item, ("soldPrice", "price", "priceNumeric", "total_price", "price.amount", "priceAmount", "amount"), _num)
    if price is None:
        cents = _first(item, ("price_cents", "priceCents"), _num)
        price = cents / 100 if cents else None
    if price is None or price <= 0:
        return None
    title = _first(item, ("title", "name", "subject"), lambda v: str(v).strip())
    if not title:
        return None
    url = _first(item, ("url", "link", "adUrl", "itemUrl", "href"), str) or ""
    item_id = str(_first(item, ("itemId", "id", "list_id", "adId", "ad_id"), str) or "") or (url or title)[:120]
    return {
        "id": uuid.uuid4().hex,
        "marketplace": marketplace,
        "keyword": keyword,
        "item_id": item_id,
        "title": title[:300],
        "price": round(price, 2),
        "currency": (_first(item, ("soldCurrency", "currency", "currency_code", "price.currency_code", "price.currency"), str) or "EUR")[:3].upper(),
        "kind": ACTORS[marketplace]["kind"],
        "condition": (_first(item, ("condition", "itemCondition", "status_label"), str) or "")[:60],
        "url": url[:500],
        "image_url": (_first(item, ("thumbnailUrl", "imageUrl", "image", "photo", "photos", "images", "thumbnail"), _image) or "")[:500],
        "listed_at": _first(item, ("endedAt", "soldAt", "createdAt", "publishedAt", "created_at_ts", "first_publication_date", "index_date", "date"), _date) or "",
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    }


# ---------------------------------------------------------------- stats

def _pct(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(sorted_values) - 1)
    return round(sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (k - lo), 2)


def stats(rows: list[dict[str, Any]], own_price: float | None = None) -> dict[str, Any]:
    prices = sorted(r["price"] for r in rows if r.get("price"))
    if not prices:
        return {"n": 0, "median": None, "p25": None, "p75": None, "min": None, "max": None, "deltaPct": None}
    median = round(statistics.median(prices), 2)
    out: dict[str, Any] = {
        "n": len(prices), "median": median, "p25": _pct(prices, 0.25), "p75": _pct(prices, 0.75),
        "min": prices[0], "max": prices[-1], "deltaPct": None,
    }
    if own_price and median:
        out["deltaPct"] = round((own_price - median) / median * 100)
    return out


# ---------------------------------------------------------------- cache (Valkey, else in-process)

_mem: dict[str, tuple[float, dict[str, Any]]] = {}
_mem_lock = threading.Lock()
_valkey: Any = None


def _cache():
    global _valkey
    if _valkey is None and settings.valkey_url:
        try:
            import redis

            _valkey = redis.Redis.from_url(settings.valkey_url, socket_timeout=3, decode_responses=True)
            _valkey.ping()
        except Exception as e:  # noqa: BLE001
            log.warning("valkey unavailable, in-process cache: %s", e)
            _valkey = False
    return _valkey or None


def _cache_get(key: str) -> dict[str, Any] | None:
    try:
        if (vk := _cache()) is not None:
            raw = vk.get(key)
            return json.loads(raw) if raw else None
    except Exception as e:  # noqa: BLE001
        log.debug("valkey get failed: %s", e)
    with _mem_lock:
        hit = _mem.get(key)
        return hit[1] if hit and hit[0] > time.time() else None


def _cache_set(key: str, value: dict[str, Any]) -> None:
    try:
        if (vk := _cache()) is not None:
            vk.setex(key, CACHE_TTL, json.dumps(value, ensure_ascii=False))
            return
    except Exception as e:  # noqa: BLE001
        log.debug("valkey set failed: %s", e)
    with _mem_lock:
        _mem[key] = (time.time() + CACHE_TTL, value)


# ---------------------------------------------------------------- ClickHouse

MARKET_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS market_listings (
    id          String,
    marketplace LowCardinality(String),
    keyword     String,
    item_id     String,
    title       String,
    price       Float64,
    currency    LowCardinality(String),
    kind        LowCardinality(String),
    condition   String,
    url         String,
    image_url   String,
    listed_at   String,
    fetched_at  DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (marketplace, keyword, item_id)
TTL toDateTime(fetched_at) + INTERVAL 365 DAY
"""
MARKET_COLUMNS = ["id", "marketplace", "keyword", "item_id", "title", "price", "currency", "kind",
                  "condition", "url", "image_url", "listed_at", "fetched_at"]


def ensure_schema(client=None) -> None:
    client = client or events.clickhouse()
    if client is None:
        return
    client.command(MARKET_TABLE_DDL)


def insert_rows(rows: list[dict[str, Any]], client=None) -> None:
    client = client or events.clickhouse()
    if client is None or not rows:
        return
    client.insert(
        "market_listings",
        [[r[c] if c != "fetched_at" else datetime.fromisoformat(r[c].replace("Z", "+00:00")) for c in MARKET_COLUMNS]
         for r in rows],
        column_names=MARKET_COLUMNS,
    )


def history(marketplace: str, keyword: str, weeks: int = 12) -> list[dict[str, Any]]:
    """Weekly median from everything the pipeline has stored for this search."""
    client = events.clickhouse()
    if client is None:
        return []
    try:
        res = client.query(
            "SELECT toStartOfWeek(fetched_at) w, median(price), count() FROM market_listings "
            "WHERE marketplace = {mk:String} AND keyword = {kw:String} "
            "AND fetched_at >= now() - INTERVAL {weeks:UInt32} WEEK GROUP BY w ORDER BY w",
            parameters={"mk": marketplace, "kw": keyword, "weeks": weeks})
        return [{"week": w.isoformat(), "median": round(float(m), 2), "n": int(n)} for w, m, n in res.result_rows]
    except Exception as e:  # noqa: BLE001
        log.warning("market history unavailable: %s", e)
        return []


# ---------------------------------------------------------------- public API

def cached_comps(query: str, marketplace: str, *, own_price: float | None = None) -> dict[str, Any] | None:
    """Price stats for `query` without calling Apify: the 6 h cache first, else the latest week of price history
    in ClickHouse. None when we know nothing yet (the UI then offers the 'Market price' button)."""
    marketplace = (marketplace or "ebay").lower()
    keyword = normalize_query(query)
    if marketplace not in ACTORS or len(keyword) < 2:
        return None
    cached = _cache_get(f"comps:{marketplace}:{keyword}")
    if cached is not None:
        out = stats(cached["rows"], own_price)
        out.update(marketplace=marketplace, kind=ACTORS[marketplace]["kind"], source="cache")
        return out
    weeks = history(marketplace, keyword, weeks=4)
    if weeks:
        last = weeks[-1]
        median = float(last["median"])
        delta = round((own_price - median) / median * 100) if own_price and median else None
        return {"n": int(last["n"]), "median": median, "deltaPct": delta, "marketplace": marketplace,
                "kind": ACTORS[marketplace]["kind"], "source": "history", "week": last["week"]}
    return None


def comps(query: str, marketplace: str, *, own_price: float | None = None, limit: int = 30,
          workspace: str = "", user_id: str = "") -> dict[str, Any]:
    """Comparable prices for `query` on `marketplace`. Raises MarketError with a seller-readable message."""
    marketplace = (marketplace or "ebay").lower()
    if marketplace not in ACTORS:
        raise MarketError(f"No market data source for {marketplace} yet.")
    if not configured():
        raise MarketError("Market prices are not configured on this server.")
    keyword = normalize_query(query)
    if len(keyword) < 2:
        raise MarketError("Give me a few words describing the item first.")
    key = f"comps:{marketplace}:{keyword}"
    cached = _cache_get(key)
    started = time.monotonic()
    if cached is None:
        raw = _run_actor(marketplace, keyword, max(5, min(limit, 50)))
        rows = [r for r in (normalize_item(marketplace, it, keyword) for it in raw) if r]
        # de-duplicate on item_id, keep first
        seen: set[str] = set()
        rows = [r for r in rows if not (r["item_id"] in seen or seen.add(r["item_id"]))]
        for r in rows:
            events.publish(settings.kafka_market_topic, f"{marketplace}:{keyword}", r)
        cached = {
            "marketplace": marketplace, "keyword": keyword, "kind": ACTORS[marketplace]["kind"],
            "label": ACTORS[marketplace]["label"], "source": f"apify/{ACTORS[marketplace]['actor']}",
            "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "rows": sorted(rows, key=lambda r: r["price"]),
        }
        _cache_set(key, cached)
        from_cache = False
    else:
        from_cache = True
    rows = cached["rows"]
    out = {k: v for k, v in cached.items() if k != "rows"}
    out.update(stats(rows, own_price))
    out["cached"] = from_cache
    out["ownPrice"] = own_price
    out["examples"] = [
        {"title": r["title"], "price": r["price"], "currency": r["currency"], "url": r["url"],
         "imageUrl": r["image_url"], "condition": r["condition"], "date": r["listed_at"]}
        for r in rows[:12]
    ]
    out["history"] = history(marketplace, keyword)
    if workspace:
        events.emit("market.comps", workspace, {"keyword": keyword, "n": out["n"], "median": out["median"],
                                                 "cached": from_cache},
                    marketplace=marketplace, user_id=user_id,
                    duration_ms=int((time.monotonic() - started) * 1000))
    return out
