"""One-shot copy of the legacy sqlite file into Aiven for PostgreSQL.

    DATABASE_URL=postgres://... python -m scripts.migrate_sqlite_to_pg /path/to/stockflow.db

Rows already present in PostgreSQL are left untouched (ON CONFLICT DO NOTHING).
"""
from __future__ import annotations

import sqlite3
import sys

from app import db

TABLES = ("profiles", "seeded", "shops", "listings", "stock", "workflows", "marketplace_sessions",
          "ext_tokens", "invite_links", "teach_sessions", "workflow_runs", "desktop_leases", "agent_messages")


def main(path: str) -> None:
    if not db.using_postgres():
        sys.exit("DATABASE_URL is not set")
    db.initialize_database()
    src = sqlite3.connect(path)
    src.row_factory = sqlite3.Row
    with db.connection() as dst:
        for table in TABLES:
            cols = [r["name"] for r in src.execute(f"PRAGMA table_info({table})")]
            rows = [tuple(r[c] for c in cols) for r in src.execute(f"SELECT * FROM {table}")]
            if not rows:
                continue
            quoted = ", ".join(f'"{c}"' for c in cols)
            marks = ", ".join("?" for _ in cols)
            dst.executemany(f"INSERT INTO {table} ({quoted}) VALUES ({marks}) ON CONFLICT DO NOTHING", rows)
            print(f"{table}: {len(rows)} rows")


if __name__ == "__main__":
    main(sys.argv[1])
