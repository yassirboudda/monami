"""Kafka → ClickHouse worker: consumes `octohandy.events` and inserts rows in batches.

Run next to the API (same env): `python -m scripts.events_to_clickhouse` from backend/.
Idempotent: ReplacingMergeTree on the event id, so at-least-once delivery is fine.
"""
from __future__ import annotations

import json
import logging
import signal
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from confluent_kafka import Consumer, KafkaException  # noqa: E402

from app import events  # noqa: E402
from app.settings import settings  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("events_to_clickhouse")

BATCH = 200
MAX_WAIT_S = 2.0


def main() -> int:
    if not events.kafka_configured() or not events.clickhouse_configured():
        log.error("KAFKA_BOOTSTRAP_SERVERS and CLICKHOUSE_HOST are required")
        return 2
    client = events.clickhouse()
    events.ensure_clickhouse_schema(client)
    consumer = Consumer({
        **events.kafka_config(),
        "client.id": "octohandy-clickhouse-sink",
        "group.id": settings.kafka_consumer_group,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })
    consumer.subscribe([settings.kafka_topic])
    running = True

    def stop(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    log.info("consuming %s → ClickHouse %s.events", settings.kafka_topic, settings.clickhouse_database)
    buf: list[dict] = []
    last_flush = time.monotonic()
    while running:
        msg = consumer.poll(0.5)
        if msg is not None:
            if msg.error():
                log.warning("kafka: %s", msg.error())
            else:
                try:
                    buf.append(json.loads(msg.value()))
                except ValueError:
                    log.warning("skipping non-JSON message at offset %s", msg.offset())
        if buf and (len(buf) >= BATCH or time.monotonic() - last_flush >= MAX_WAIT_S):
            try:
                events.insert_events(buf, client)
                consumer.commit(asynchronous=False)
                log.info("inserted %d events", len(buf))
                buf.clear()
            except (KafkaException, Exception) as e:  # noqa: BLE001
                log.error("insert failed, will retry: %s", e)
                time.sleep(2)
            last_flush = time.monotonic()
    consumer.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
