from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .settings import settings


DEFAULT_WORKFLOWS = (
    {
        "id": "vinted-fav-offer",
        "marketplace": "vinted",
        "title": "Favoris → offre discount",
        "steps": [
            "Client met un article en favoris",
            "Détection via messagerie / notif (backend plus tard)",
            "Envoi d'un message avec proposition de prix (discount)",
        ],
        "tone": "teal",
    },
    {
        "id": "vinted-bump",
        "marketplace": "vinted",
        "title": "Annonce dormante → baisse auto",
        "steps": ["Annonce sans vue depuis N jours", "Calcul d'une baisse X%", "Mise à jour prix + message optionnel"],
        "tone": "teal",
    },
    {
        "id": "lbc-first-msg",
        "marketplace": "leboncoin",
        "title": "Premier message → réponse type",
        "steps": ["Nouveau message acheteur", "Classement intent (dispo / prix / RDV)", "Réponse template + plancher vendeur"],
        "tone": "amber",
    },
    {
        "id": "multi-restock",
        "marketplace": "multi",
        "title": "Stock équipe → republish",
        "steps": ["Article ajouté au stock partagé", "Choix marketplace", "Création / republication de l'annonce"],
        "tone": "blue",
    },
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS shops (
    id TEXT NOT NULL,
    workspace TEXT NOT NULL,
    created_by TEXT NOT NULL,
    marketplace TEXT NOT NULL,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'connected',
    listing_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (workspace, id)
);
CREATE TABLE IF NOT EXISTS listings (
    id TEXT NOT NULL,
    workspace TEXT NOT NULL,
    created_by TEXT NOT NULL,
    shop_id TEXT NOT NULL,
    marketplace TEXT NOT NULL,
    title TEXT NOT NULL,
    price REAL NOT NULL,
    status TEXT NOT NULL,
    image_url TEXT,
    url TEXT,
    views INTEGER,
    favorites INTEGER,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (workspace, id)
);
CREATE TABLE IF NOT EXISTS stock (
    id TEXT NOT NULL,
    workspace TEXT NOT NULL,
    created_by TEXT NOT NULL,
    title TEXT NOT NULL,
    sku TEXT,
    qty INTEGER NOT NULL,
    price REAL,
    marketplace TEXT,
    owner_label TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (workspace, id)
);
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT NOT NULL,
    workspace TEXT NOT NULL,
    created_by TEXT NOT NULL,
    marketplace TEXT NOT NULL,
    title TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    tone TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'screenpipe',
    enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (workspace, id)
);
CREATE TABLE IF NOT EXISTS marketplace_sessions (
    workspace TEXT NOT NULL,
    created_by TEXT NOT NULL,
    marketplace TEXT NOT NULL,
    display_name TEXT NOT NULL,
    credentials_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (workspace, marketplace)
);
CREATE TABLE IF NOT EXISTS ext_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace TEXT NOT NULL,
    created_by TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invite_links (
    token TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    preferences TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS seeded (
    workspace TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_shops_workspace ON shops(workspace);
CREATE INDEX IF NOT EXISTS idx_listings_workspace_shop ON listings(workspace, shop_id);
CREATE INDEX IF NOT EXISTS idx_stock_workspace ON stock(workspace);
CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON workflows(workspace);
"""


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    path = Path(settings.database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize_database() -> None:
    with connection() as conn:
        conn.executescript(_SCHEMA)


def seed_workspace(
    workspace: str,
    created_by: str,
    *,
    personal: bool,
    shops: list[dict[str, Any]],
    listings: list[dict[str, Any]],
    stock: list[dict[str, Any]],
) -> None:
    with connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT 1 FROM seeded WHERE workspace = ?", (workspace,)).fetchone():
            return
        if personal:
            conn.executemany(
                """INSERT INTO shops
                   (id, workspace, created_by, marketplace, display_name, status, listing_count)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        shop["id"], workspace, created_by, shop["marketplace"], shop["displayName"],
                        shop["status"], shop.get("listingCount", 0),
                    )
                    for shop in shops
                ],
            )
            conn.executemany(
                """INSERT INTO listings
                   (id, workspace, created_by, shop_id, marketplace, title, price, status,
                    image_url, url, views, favorites, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        item["id"], workspace, created_by, item["shopId"], item["marketplace"],
                        item["title"], item["price"], item["status"], item.get("imageUrl"),
                        item.get("url"), item.get("views"), item.get("favorites"), item["updatedAt"],
                    )
                    for item in listings
                ],
            )
            conn.executemany(
                """INSERT INTO stock
                   (id, workspace, created_by, title, sku, qty, price, marketplace, owner_label)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        item["id"], workspace, created_by, item["title"], item.get("sku"),
                        item["qty"], item.get("price"), item.get("marketplace"), item.get("ownerLabel", "toi"),
                    )
                    for item in stock
                ],
            )
        conn.executemany(
            """INSERT INTO workflows
               (id, workspace, created_by, marketplace, title, steps_json, tone, source, enabled)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'screenpipe', 0)""",
            [
                (
                    flow["id"], workspace, created_by, flow["marketplace"], flow["title"],
                    json.dumps(flow["steps"], ensure_ascii=False), flow["tone"],
                )
                for flow in DEFAULT_WORKFLOWS
            ],
        )
        conn.execute(
            "INSERT INTO seeded (workspace, created_by) VALUES (?, ?)",
            (workspace, created_by),
        )
