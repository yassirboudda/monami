"""Event stream (Aiven for Apache Kafka) + analytics store (Aiven for ClickHouse).

Every notable thing the product does — a buyer reply sent by Hermes, an approval
decided by the seller, a desktop run, a shop sync, a subscription change — is
published as one JSON event on the ``octohandy.events`` topic. A worker
(``scripts/events_to_clickhouse.py``) consumes the topic into ClickHouse, and
``/v1/analytics/summary`` reads it back for the dashboard.

Without KAFKA_* / CLICKHOUSE_* configured everything degrades to no-ops so local
dev and tests keep working.
"""
from __future__ import annotations

import json
import logging
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from .settings import settings

log = logging.getLogger("octohandy.events")

EVENT_KINDS = {
    "chat.message": "Seller asked the agent something in the chat",
    "agent.reply_sent": "Agent answered a buyer on a marketplace",
    "agent.approval_requested": "Agent asked the seller to approve an action",
    "agent.approval_decided": "Seller approved or declined an action",
    "desktop.run": "Agent executed a workflow on the remote desktop",
    "desktop.session": "Seller opened the remote desktop",
    "shop.synced": "Shop listings refreshed from the marketplace",
    "listing.published": "A listing was created from the chat",
    "billing.subscription": "Stripe subscription changed",
    "market.comps": "Seller checked the market price of an item",
}

_producer: Any = None
_producer_lock = threading.Lock()
_ch_client: Any = None
_ch_lock = threading.Lock()


def _pem(value: str) -> str | None:
    return value.replace("\\n", "\n").strip() or None


def kafka_configured() -> bool:
    return bool(settings.kafka_bootstrap_servers)


def clickhouse_configured() -> bool:
    return bool(settings.clickhouse_host)


def kafka_config() -> dict[str, Any]:
    """librdkafka config shared by the API producer and the ClickHouse worker."""
    conf: dict[str, Any] = {
        "bootstrap.servers": settings.kafka_bootstrap_servers,
        "security.protocol": "SSL",
        "client.id": "octohandy-api",
    }
    if ca := _pem(settings.kafka_ca_pem):
        conf["ssl.ca.pem"] = ca
    if settings.kafka_sasl_username:
        conf.update({
            "security.protocol": "SASL_SSL",
            "sasl.mechanism": "SCRAM-SHA-256",
            "sasl.username": settings.kafka_sasl_username,
            "sasl.password": settings.kafka_sasl_password,
        })
    elif (cert := _pem(settings.kafka_cert_pem)) and (key := _pem(settings.kafka_key_pem)):
        conf["ssl.certificate.pem"] = cert
        conf["ssl.key.pem"] = key
    return conf


def _get_producer():
    global _producer
    if _producer is not None or not kafka_configured():
        return _producer
    with _producer_lock:
        if _producer is None:
            from confluent_kafka import Producer

            _producer = Producer({
                **kafka_config(),
                "linger.ms": 50,
                "acks": "all",
                "message.timeout.ms": 10000,
            })
    return _producer


def _delivery(err, msg) -> None:
    if err is not None:
        log.warning("event not delivered to %s: %s", msg.topic(), err)


def emit(kind: str, workspace: str, payload: dict[str, Any] | None = None, *,
         marketplace: str | None = None, user_id: str | None = None,
         duration_ms: int | None = None) -> dict[str, Any]:
    """Publish one event. Never raises: the product must not fail because the stream is down."""
    event = {
        "id": uuid.uuid4().hex,
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "kind": kind,
        "workspace": workspace,
        "marketplace": marketplace or "",
        "user_id": user_id or "",
        "duration_ms": int(duration_ms or 0),
        "payload": payload or {},
    }
    _store(event)
    try:
        producer = _get_producer()
        if producer is None:
            log.debug("event (no kafka): %s %s", kind, workspace)
            return event
        producer.produce(
            settings.kafka_topic,
            key=workspace.encode(),
            value=json.dumps(event, ensure_ascii=False).encode(),
            on_delivery=_delivery,
        )
        producer.poll(0)
    except Exception as e:  # noqa: BLE001 - best effort by design
        log.warning("event %s not published: %s", kind, e)
    return event


def publish(topic: str, key: str, value: dict[str, Any]) -> bool:
    """Best-effort publish of any JSON record to any topic (market data, …)."""
    try:
        producer = _get_producer()
        if producer is None:
            return False
        producer.produce(topic, key=key.encode(), value=json.dumps(value, ensure_ascii=False).encode(),
                         on_delivery=_delivery)
        producer.poll(0)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("record not published to %s: %s", topic, e)
        return False


def flush(timeout: float = 5.0) -> None:
    if _producer is not None:
        try:
            _producer.flush(timeout)
        except Exception:  # noqa: BLE001
            pass


# ---------------------------------------------------------------- ClickHouse

EVENTS_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS events (
    id          String,
    ts          DateTime64(3, 'UTC'),
    kind        LowCardinality(String),
    workspace   String,
    marketplace LowCardinality(String),
    user_id     String,
    duration_ms UInt32,
    payload     String
) ENGINE = ReplacingMergeTree
ORDER BY (workspace, kind, ts, id)
TTL toDateTime(ts) + INTERVAL 365 DAY
"""


def clickhouse():
    """Shared clickhouse-connect client (HTTPS). None when not configured."""
    global _ch_client
    if _ch_client is not None or not clickhouse_configured():
        return _ch_client
    with _ch_lock:
        if _ch_client is None:
            import clickhouse_connect

            _ch_client = clickhouse_connect.get_client(
                host=settings.clickhouse_host,
                port=settings.clickhouse_port,
                username=settings.clickhouse_user,
                password=settings.clickhouse_password,
                database=settings.clickhouse_database,
                secure=True,
                connect_timeout=5,
                send_receive_timeout=15,
            )
    return _ch_client


def ensure_clickhouse_schema(client=None) -> None:
    client = client or clickhouse()
    if client is None:
        return
    client.command(f"CREATE DATABASE IF NOT EXISTS {settings.clickhouse_database}")
    client.command(EVENTS_TABLE_DDL)


def insert_events(rows: list[dict[str, Any]], client=None) -> None:
    client = client or clickhouse()
    if client is None or not rows:
        return
    client.insert(
        "events",
        [[
            r["id"],
            datetime.fromisoformat(r["ts"].replace("Z", "+00:00")),
            r["kind"], r["workspace"], r.get("marketplace") or "", r.get("user_id") or "",
            int(r.get("duration_ms") or 0),
            json.dumps(r.get("payload") or {}, ensure_ascii=False),
        ] for r in rows],
        column_names=["id", "ts", "kind", "workspace", "marketplace", "user_id", "duration_ms", "payload"],
    )


def _store(event: dict[str, Any]) -> None:
    """Keep the event in the app database (Aiven PostgreSQL in prod) for the Analytics card, with retention."""
    try:
        from . import db  # local import: events is imported by db-free scripts too
        cutoff = (datetime.now(timezone.utc) - timedelta(days=max(1, settings.events_retention_days))).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        with db.connection() as conn:
            conn.execute(
                "INSERT INTO agent_events (id, workspace, kind, marketplace, user_id, duration_ms, payload, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (event["id"], event["workspace"], event["kind"], event["marketplace"], event["user_id"], event["duration_ms"],
                 json.dumps(event["payload"], ensure_ascii=False)[:4000], event["ts"]),
            )
            if event["id"][-1] in "01":  # purge on ~1/8 of writes
                conn.execute("DELETE FROM agent_events WHERE ts < ?", (cutoff,))
    except Exception as e:  # noqa: BLE001
        log.debug("event not stored: %s", e)


def _summary_from_db(out: dict[str, Any], workspace: str, days: int) -> dict[str, Any]:
    from . import db
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    with db.connection() as conn:
        rows = conn.execute("SELECT kind, COUNT(*) AS c FROM agent_events WHERE workspace = ? AND ts >= ? GROUP BY kind", (workspace, since)).fetchall()
        out["totals"] = {r["kind"]: int(r["c"]) for r in rows}
        rows = conn.execute("SELECT substr(ts, 1, 10) AS d, kind, COUNT(*) AS c FROM agent_events WHERE workspace = ? AND ts >= ? GROUP BY d, kind ORDER BY d", (workspace, since)).fetchall()
        by_day: dict[str, dict[str, int]] = {}
        for r in rows:
            by_day.setdefault(str(r["d"]), {})[r["kind"]] = int(r["c"])
        out["byDay"] = [{"day": d, **kinds} for d, kinds in by_day.items()]
        rows = conn.execute(
            "SELECT marketplace, "
            "SUM(CASE WHEN kind = 'agent.reply_sent' THEN 1 ELSE 0 END) AS r, "
            "SUM(CASE WHEN kind = 'agent.approval_decided' THEN 1 ELSE 0 END) AS a, "
            "SUM(CASE WHEN kind = 'desktop.run' THEN 1 ELSE 0 END) AS d "
            "FROM agent_events WHERE workspace = ? AND marketplace != '' AND ts >= ? GROUP BY marketplace ORDER BY marketplace",
            (workspace, since)).fetchall()
        out["byMarketplace"] = [{"marketplace": r["marketplace"], "repliesSent": int(r["r"] or 0), "decisions": int(r["a"] or 0), "runs": int(r["d"] or 0)} for r in rows]
        row = conn.execute("SELECT AVG(duration_ms) AS avg FROM agent_events WHERE workspace = ? AND kind = 'chat.message' AND duration_ms > 0 AND ts >= ?", (workspace, since)).fetchone()
        avg = row["avg"] if row else None
        out["avgAgentSeconds"] = round(float(avg) / 1000, 1) if avg else None
    out["configured"] = True
    out["source"] = "postgres"
    return out


def summary(workspace: str, days: int = 14) -> dict[str, Any]:
    """What the seller sees on the Analytics card. Empty structure when ClickHouse is off."""
    out: dict[str, Any] = {
        "configured": clickhouse_configured(),
        "stream": kafka_configured(),
        "days": days,
        "totals": {},
        "byDay": [],
        "byMarketplace": [],
        "avgAgentSeconds": None,
    }
    out["retentionDays"] = settings.events_retention_days
    client = clickhouse()
    if client is None:
        try:
            return _summary_from_db(out, workspace, days)
        except Exception as e:  # noqa: BLE001
            log.warning("analytics (db) failed: %s", e)
            return out
    out["source"] = "clickhouse"
    try:
        params = {"ws": workspace, "days": days}
        res = client.query(
            "SELECT kind, count() FROM events WHERE workspace = {ws:String} "
            "AND ts >= now() - INTERVAL {days:UInt32} DAY GROUP BY kind", parameters=params)
        out["totals"] = {k: int(c) for k, c in res.result_rows}
        res = client.query(
            "SELECT toDate(ts) d, kind, count() FROM events WHERE workspace = {ws:String} "
            "AND ts >= now() - INTERVAL {days:UInt32} DAY GROUP BY d, kind ORDER BY d", parameters=params)
        by_day: dict[str, dict[str, int]] = {}
        for d, kind, c in res.result_rows:
            by_day.setdefault(d.isoformat(), {})[kind] = int(c)
        out["byDay"] = [{"day": d, **kinds} for d, kinds in by_day.items()]
        res = client.query(
            "SELECT marketplace, countIf(kind = 'agent.reply_sent'), countIf(kind = 'agent.approval_decided'), "
            "countIf(kind = 'desktop.run') FROM events WHERE workspace = {ws:String} AND marketplace != '' "
            "AND ts >= now() - INTERVAL {days:UInt32} DAY GROUP BY marketplace ORDER BY marketplace", parameters=params)
        out["byMarketplace"] = [
            {"marketplace": m, "repliesSent": int(r), "decisions": int(a), "runs": int(d)}
            for m, r, a, d in res.result_rows
        ]
        res = client.query(
            "SELECT avg(duration_ms) FROM events WHERE workspace = {ws:String} AND kind = 'chat.message' "
            "AND duration_ms > 0 AND ts >= now() - INTERVAL {days:UInt32} DAY", parameters=params)
        avg = res.result_rows[0][0] if res.result_rows else None
        out["avgAgentSeconds"] = round(float(avg) / 1000, 1) if avg else None
    except Exception as e:  # noqa: BLE001
        log.warning("analytics query failed: %s", e)
        out["error"] = "analytics temporarily unavailable"
    return out


def dashboard(workspace: str, days: int = 30) -> dict[str, Any]:
    """Everything the Analytics page shows, in one call: agent activity (summary), this month's usage and plan,
    the stock against the market (from cached comps / history, never Apify) and the market searches the agent ran."""
    from . import billing, db, market
    out: dict[str, Any] = {"activity": summary(workspace, days)}
    with db.connection() as conn:
        bill = billing.status(conn, workspace)
        out["plan"] = {"id": bill["plan"], "name": next((p["name"] for p in bill["plans"] if p["id"] == bill["plan"]), bill["plan"]),
                       "complimentary": bill["complimentary"], "usage": bill["usage"], "quota": bill["quota"]}
        listings = conn.execute("SELECT id, title, price, marketplace, status, views, favorites FROM listings WHERE workspace = ?",
                                (workspace,)).fetchall()
        shops = conn.execute("SELECT marketplace, COUNT(*) AS c FROM shops WHERE workspace = ? GROUP BY marketplace", (workspace,)).fetchall()
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        searches = conn.execute(
            "SELECT marketplace, payload, ts FROM agent_events WHERE workspace = ? AND kind = 'market.comps' AND ts >= ? ORDER BY ts DESC LIMIT 400",
            (workspace, since)).fetchall()
    by_mk: dict[str, dict[str, Any]] = {}
    asking = market_value = 0.0
    priced = over = under = 0
    for row in listings:
        mk = by_mk.setdefault(row["marketplace"], {"marketplace": row["marketplace"], "listings": 0, "asking": 0.0, "views": 0, "favorites": 0, "shops": 0})
        mk["listings"] += 1
        mk["asking"] += float(row["price"] or 0)
        mk["views"] += int(row["views"] or 0)
        mk["favorites"] += int(row["favorites"] or 0)
        asking += float(row["price"] or 0)
        try:
            hit = market.cached_comps(row["title"], row["marketplace"] if row["marketplace"] in ("ebay", "vinted", "leboncoin") else "ebay",
                                      own_price=row["price"])
        except Exception:  # noqa: BLE001
            hit = None
        if hit and hit.get("median") is not None:
            priced += 1
            market_value += float(hit["median"])
            delta = hit.get("deltaPct")
            if delta is not None and delta >= 8:
                over += 1
            elif delta is not None and delta <= -8:
                under += 1
    for row in shops:
        by_mk.setdefault(row["marketplace"], {"marketplace": row["marketplace"], "listings": 0, "asking": 0.0, "views": 0, "favorites": 0, "shops": 0})["shops"] = int(row["c"])
    out["stock"] = {"listings": len(listings), "asking": round(asking, 2), "priced": priced, "marketValue": round(market_value, 2),
                    "overpriced": over, "underpriced": under,
                    "byMarketplace": sorted(({**m, "asking": round(m["asking"], 2)} for m in by_mk.values()), key=lambda m: -m["listings"])}
    seen: dict[tuple[str, str], dict[str, Any]] = {}
    for row in searches:
        try:
            payload = json.loads(row["payload"] or "{}")
        except Exception:  # noqa: BLE001
            continue
        kw = str(payload.get("keyword") or "").strip()
        if not kw or payload.get("median") is None:
            continue
        key = (row["marketplace"] or "ebay", kw)
        entry = seen.setdefault(key, {"marketplace": key[0], "keyword": kw, "points": []})
        entry["points"].append({"ts": row["ts"], "median": float(payload["median"]), "n": int(payload.get("n") or 0)})
    searches_out = []
    for e in seen.values():
        pts = sorted(e["points"], key=lambda x: x["ts"])
        first, last = pts[0]["median"], pts[-1]["median"]
        searches_out.append({"marketplace": e["marketplace"], "keyword": e["keyword"], "median": last, "n": pts[-1]["n"],
                             "lastAt": pts[-1]["ts"], "lookups": len(pts),
                             "trendPct": round((last - first) / first * 100) if first and len(pts) > 1 else None,
                             "series": [p["median"] for p in pts[-12:]]})
    searches_out.sort(key=lambda x: x["lastAt"], reverse=True)
    out["searches"] = searches_out[:12]
    return out
