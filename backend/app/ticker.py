"""Live market ticker: per-workspace watchlists of keywords (seeded from a niche), a background poller that
re-runs the market search every TICK_INTERVAL and stores one price point per (keyword, marketplace) in the app
database (Aiven PostgreSQL in prod) + the Kafka market topic — so the Analytics page can show stock-style charts
that move on their own, and third-party agents can read the same stream through MCP (`market_stream`)."""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from . import db, events, market
from .settings import settings

log = logging.getLogger("monami.ticker")

NICHES: dict[str, dict[str, Any]] = {
    "pokemon": {"name": "Cartes Pokémon", "emoji": "🃏", "keywords": ["display pokémon 151", "dracaufeu holo", "booster évolutions"]},
    "sneakers": {"name": "Sneakers", "emoji": "👟", "keywords": ["jordan 1 mid", "new balance 550", "dunk low panda"]},
    "gpu": {"name": "GPU & PC", "emoji": "🖥️", "keywords": ["rtx 3080", "rtx 4070", "ryzen 7 5800x"]},
    "watches": {"name": "Montres", "emoji": "⌚", "keywords": ["seiko 5", "casio g-shock", "tissot prx"]},
    "phones": {"name": "Téléphones", "emoji": "📱", "keywords": ["iphone 13", "airpods pro 2", "galaxy s23"]},
    "fashion": {"name": "Mode", "emoji": "🧥", "keywords": ["veste levi's vintage", "sac longchamp pliage", "doudoune north face"]},
    "lego": {"name": "Lego", "emoji": "🧱", "keywords": ["lego star wars", "lego technic", "lego millennium falcon"]},
}
MAX_KEYWORDS_PER_CYCLE = 40

SCHEMA = """
CREATE TABLE IF NOT EXISTS market_watch (
    id TEXT PRIMARY KEY,
    workspace TEXT NOT NULL,
    keyword TEXT NOT NULL,
    marketplace TEXT NOT NULL,
    niche TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS market_watch_uniq ON market_watch (workspace, keyword, marketplace);
CREATE TABLE IF NOT EXISTS market_ticks (
    id TEXT PRIMARY KEY,
    keyword TEXT NOT NULL,
    marketplace TEXT NOT NULL,
    ts TEXT NOT NULL,
    median REAL,
    p25 REAL,
    p75 REAL,
    min REAL,
    max REAL,
    n INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS market_ticks_kw_ts ON market_ticks (keyword, marketplace, ts);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def ensure_schema() -> None:
    with db.connection() as conn:
        for stmt in [s.strip() for s in SCHEMA.split(";") if s.strip()]:
            conn.execute(stmt)
        conn.commit()


def watchlist(conn, workspace: str) -> list[dict[str, Any]]:
    rows = conn.execute("SELECT * FROM market_watch WHERE workspace = ? ORDER BY created_at", (workspace,)).fetchall()
    return [dict(r) for r in rows]


def watch(conn, workspace: str, *, niche: str | None = None, keyword: str | None = None, marketplace: str = "ebay") -> list[dict[str, Any]]:
    """Add a niche (its preset keywords) or a single keyword to the workspace watchlist. Idempotent."""
    marketplace = (marketplace or "ebay").lower()
    if marketplace not in market.ACTORS:
        raise ValueError("Unknown marketplace")
    pairs: list[tuple[str, str]] = []
    if niche:
        if niche not in NICHES:
            raise ValueError("Unknown niche")
        pairs = [(market.normalize_query(k), niche) for k in NICHES[niche]["keywords"]]
    if keyword:
        kw = market.normalize_query(keyword)
        if len(kw) < 2:
            raise ValueError("Keyword too short")
        pairs.append((kw, niche or ""))
    if not pairs:
        raise ValueError("Give a niche or a keyword")
    added = []
    for kw, nich in pairs:
        exists = conn.execute("SELECT id FROM market_watch WHERE workspace = ? AND keyword = ? AND marketplace = ?", (workspace, kw, marketplace)).fetchone()
        if exists:
            continue
        conn.execute("INSERT INTO market_watch (id, workspace, keyword, marketplace, niche, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                     (f"w-{uuid.uuid4().hex[:10]}", workspace, kw, marketplace, nich, _now()))
        added.append((kw, marketplace))
    conn.commit()
    return watchlist(conn, workspace)


def unwatch(conn, workspace: str, watch_id: str) -> bool:
    n = conn.execute("DELETE FROM market_watch WHERE workspace = ? AND id = ?", (workspace, watch_id)).rowcount
    conn.commit()
    return bool(n)


def record_tick(keyword: str, marketplace: str, *, fresh: bool = True) -> dict[str, Any] | None:
    """One price point for (keyword, marketplace): run the market search (fresh = bypass the 6 h cache) and store it."""
    try:
        out = market.comps(keyword, marketplace, limit=20, fresh=fresh)
    except Exception as e:  # noqa: BLE001
        log.warning("tick %s/%s failed: %s", marketplace, keyword, e)
        return None
    if out.get("median") is None:
        return None
    tick = {"id": f"t-{uuid.uuid4().hex[:12]}", "keyword": keyword, "marketplace": marketplace, "ts": _now(),
            "median": float(out["median"]), "p25": out.get("p25"), "p75": out.get("p75"), "min": out.get("min"), "max": out.get("max"), "n": int(out.get("n") or 0)}
    with db.connection() as conn:
        conn.execute("INSERT INTO market_ticks (id, keyword, marketplace, ts, median, p25, p75, min, max, n) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (tick["id"], keyword, marketplace, tick["ts"], tick["median"], tick["p25"], tick["p75"], tick["min"], tick["max"], tick["n"]))
        conn.commit()
    events.publish(settings.kafka_market_topic, f"tick:{marketplace}:{keyword}", tick)
    return tick


def series(conn, keyword: str, marketplace: str, hours: int = 48, limit: int = 500) -> list[dict[str, Any]]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    rows = conn.execute("SELECT ts, median, p25, p75, min, max, n FROM market_ticks WHERE keyword = ? AND marketplace = ? AND ts >= ? ORDER BY ts DESC LIMIT ?",
                        (keyword, marketplace, since, limit)).fetchall()
    return [dict(r) for r in reversed(rows)]


def streams(conn, workspace: str, hours: int = 48) -> dict[str, Any]:
    """Every watched keyword of the workspace with its tick series — the Analytics page payload."""
    out = []
    for w in watchlist(conn, workspace):
        pts = series(conn, w["keyword"], w["marketplace"], hours)
        last = pts[-1] if pts else None
        first = pts[0] if pts else None
        out.append({**w, "points": pts, "last": last,
                    "changePct": round((last["median"] - first["median"]) / first["median"] * 100, 1) if last and first and first["median"] else None,
                    "niche": w["niche"], "nicheName": NICHES.get(w["niche"], {}).get("name", w["niche"] or "Custom")})
    return {"intervalMinutes": settings.market_tick_minutes, "hours": hours, "niches": [{"id": k, **{kk: v for kk, v in n.items()}} for k, n in NICHES.items()], "streams": out}


def pending_pairs(conn) -> list[tuple[str, str]]:
    rows = conn.execute("SELECT DISTINCT keyword, marketplace FROM market_watch").fetchall()
    return [(r["keyword"], r["marketplace"]) for r in rows][:MAX_KEYWORDS_PER_CYCLE]


async def run_forever() -> None:
    """Background poller: every market_tick_minutes, one fresh search per watched (keyword, marketplace)."""
    await asyncio.sleep(20)
    while True:
        try:
            if market.configured():
                with db.connection() as conn:
                    pairs = pending_pairs(conn)
                for kw, mk in pairs:
                    await asyncio.to_thread(record_tick, kw, mk)
                    await asyncio.sleep(2)
        except Exception as e:  # noqa: BLE001
            log.warning("ticker cycle failed: %s", e)
        await asyncio.sleep(max(5, settings.market_tick_minutes) * 60)
