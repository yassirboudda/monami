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
from datetime import datetime, timezone
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
    client = clickhouse()
    if client is None:
        return out
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
