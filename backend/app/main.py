"""Stockflow hackathon API — binds 127.0.0.1:3000 behind nginx. Do not bind :8080 (OpenShell)."""

from __future__ import annotations

import time
import uuid
import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jose import jwk, jwt
from jose.exceptions import JWTError
from pydantic import BaseModel, Field

from . import db
from .marketplaces import agent_context, get_doc, get_marketplace
from .settings import settings


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    db.initialize_database()
    yield


app = FastAPI(title="Stockflow API", version="0.1.0", lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_jwks_cache: dict[str, Any] = {"at": 0.0, "keys": []}
_organization_names: dict[str, str] = {}


def _build_chat_system_prompt() -> str:
    return (
        "Tu es Stockflow, assistant marketplace. Réponds en français, de façon concise et "
        "utile pour le stock, les prix, les messages clients et les workflows. Tu couvres les "
        "marketplaces décrites dans la référence ci-dessous. Utilise-la pour décider si une "
        "action passe par l'API ou un screenpipe_workflow, et quelles confirmations vendeur/"
        "acheteur sont nécessaires.\n\n"
        f"{agent_context()}"
    )


def _default_shops() -> list[dict[str, Any]]:
    return [
        {"id": "s1", "marketplace": "vinted", "displayName": "lola_du75", "status": "connected", "listingCount": 6},
        {"id": "s2", "marketplace": "leboncoin", "displayName": "Leboncoin", "status": "connected", "listingCount": 4},
    ]


def _default_listings() -> list[dict[str, Any]]:
    def day(n: int) -> str:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - n * 86400))

    return [
        {"id": "l1", "shopId": "s1", "marketplace": "vinted", "title": "Masque Halloween LED", "price": 12, "status": "active", "views": 48, "favorites": 6, "updatedAt": day(0), "url": "https://www.vinted.fr"},
        {"id": "l2", "shopId": "s1", "marketplace": "vinted", "title": "Veste jean vintage", "price": 35, "status": "active", "views": 120, "favorites": 18, "updatedAt": day(1), "url": "https://www.vinted.fr"},
        {"id": "l3", "shopId": "s1", "marketplace": "vinted", "title": "Sneakers blanches 40", "price": 28, "status": "reserved", "views": 90, "favorites": 11, "updatedAt": day(2), "url": "https://www.vinted.fr"},
        {"id": "l4", "shopId": "s1", "marketplace": "vinted", "title": "Sac bandoulière cuir", "price": 42, "status": "active", "views": 33, "favorites": 4, "updatedAt": day(3), "url": "https://www.vinted.fr"},
        {"id": "l5", "shopId": "s1", "marketplace": "vinted", "title": "Pull oversize beige", "price": 18, "status": "sold", "views": 210, "favorites": 27, "updatedAt": day(5), "url": "https://www.vinted.fr"},
        {"id": "l6", "shopId": "s1", "marketplace": "vinted", "title": "Montre minimaliste", "price": 55, "status": "active", "views": 67, "favorites": 9, "updatedAt": day(4), "url": "https://www.vinted.fr"},
        {"id": "l7", "shopId": "s2", "marketplace": "leboncoin", "title": "Lampe design scandinave", "price": 45, "status": "active", "views": 22, "favorites": 3, "updatedAt": day(0), "url": "https://www.leboncoin.fr"},
        {"id": "l8", "shopId": "s2", "marketplace": "leboncoin", "title": "Fauteuil velours vert", "price": 120, "status": "active", "views": 41, "favorites": 7, "updatedAt": day(2), "url": "https://www.leboncoin.fr"},
        {"id": "l9", "shopId": "s2", "marketplace": "leboncoin", "title": "Lot déco Halloween", "price": 25, "status": "reserved", "views": 15, "favorites": 2, "updatedAt": day(1), "url": "https://www.leboncoin.fr"},
        {"id": "l10", "shopId": "s2", "marketplace": "leboncoin", "title": "Console TV bois", "price": 90, "status": "active", "views": 58, "favorites": 5, "updatedAt": day(6), "url": "https://www.leboncoin.fr"},
    ]


def _default_stock(owner: str) -> list[dict[str, Any]]:
    return [
        {"id": "i1", "title": "Masque Halloween", "qty": 3, "price": 12, "marketplace": "vinted", "ownerLabel": owner},
        {"id": "i2", "title": "Veste jean vintage", "qty": 1, "price": 35, "marketplace": "vinted", "ownerLabel": owner},
        {"id": "i3", "title": "Lampe design", "qty": 2, "price": 45, "marketplace": "leboncoin", "ownerLabel": owner},
    ]


async def _jwks() -> list[dict[str, Any]]:
    now = time.time()
    if _jwks_cache["keys"] and now - _jwks_cache["at"] < 3600:
        return _jwks_cache["keys"]
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(settings.clerk_jwks_url)
        r.raise_for_status()
        keys = r.json().get("keys", [])
    _jwks_cache["at"] = now
    _jwks_cache["keys"] = keys
    return keys


async def require_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()

    # Extension long-lived token (sfx_…)
    if token.startswith("sfx_"):
        with db.connection() as conn:
            row = conn.execute("SELECT * FROM ext_tokens WHERE token = ?", (token,)).fetchone()
        meta = dict(row) if row else None
        if not meta:
            raise HTTPException(401, "Unknown extension token")
        workspace = meta["workspace"]
        return {
            "user_id": meta["user_id"],
            "workspace": workspace,
            "org_id": workspace[4:] if workspace.startswith("org:") else None,
            "via": "extension",
            "claims": {},
        }

    try:
        header = jwt.get_unverified_header(token)
        keys = await _jwks()
        jwk_dict = next((k for k in keys if k.get("kid") == header.get("kid")), None)
        if not jwk_dict:
            raise HTTPException(401, "Unknown signing key")
        key = jwk.construct(jwk_dict)
        claims = jwt.decode(
            token,
            key.to_pem().decode("utf-8") if hasattr(key, "to_pem") else key,
            algorithms=[header.get("alg", "RS256")],
            options={"verify_aud": False},
        )
    except HTTPException:
        raise
    except JWTError as e:
        raise HTTPException(401, f"Invalid token: {e}") from e
    except Exception as e:
        raise HTTPException(401, f"Invalid token: {e}") from e
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(401, "No subject")
    org_claim = claims.get("o") or {}
    org_id = org_claim.get("id") or claims.get("org_id")
    return {
        "user_id": sub,
        "workspace": f"org:{org_id}" if org_id else f"user:{sub}",
        "org_id": org_id,
        "via": "clerk",
        "claims": claims,
    }


async def workspace_user(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    db.seed_workspace(
        user["workspace"],
        user["user_id"],
        personal=user.get("org_id") is None,
        shops=_default_shops(),
        listings=_default_listings(),
        stock=_default_stock("toi"),
    )
    return user


def _profile(user_id: str) -> dict[str, Any]:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    if row is None:
        return {"displayName": "", "preferences": {}}
    return {
        "displayName": row["display_name"],
        "preferences": json.loads(row["preferences"]),
    }


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def _clerk_api(
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    if not settings.clerk_secret_key:
        raise HTTPException(status_code=503, detail="Clerk API non configurée")
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.request(
            method,
            f"{settings.clerk_api_url.rstrip('/')}{path}",
            headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
            json=body,
        )
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    return response.status_code, payload if isinstance(payload, dict) else {}


async def _organization_name(org_id: str, claims: dict[str, Any] | None = None) -> str:
    org_claim = (claims or {}).get("o") or {}
    claim_name = org_claim.get("name") or (claims or {}).get("org_name")
    if claim_name:
        _organization_names[org_id] = str(claim_name)
    if org_id not in _organization_names:
        code, data = await _clerk_api("GET", f"/organizations/{org_id}")
        if code >= 400:
            raise HTTPException(status_code=502, detail="Impossible de récupérer l'organisation")
        if data.get("name"):
            _organization_names[org_id] = str(data["name"])
    return _organization_names.get(org_id, org_id)


async def _chat_context(user: dict[str, Any]) -> str:
    profile = _profile(user["user_id"])
    display_name = profile["displayName"] or "membre sans nom renseigné"
    preferences = json.dumps(profile["preferences"], ensure_ascii=False, separators=(",", ":"))
    org_id = user.get("org_id")
    workspace = "Espace perso"
    if org_id:
        try:
            org_name = await _organization_name(org_id, user.get("claims"))
        except HTTPException:
            org_name = org_id
        workspace = f"Organisation {org_name}"
    return (
        "\n\nContexte utilisateur\n"
        f"Profil : {display_name}. Préférences : {preferences}.\n"
        f"Espace : {workspace}. Plusieurs membres peuvent partager cet espace ; "
        f"tu échanges actuellement avec ce membre précis (identifiant {user['user_id']})."
    )


@app.get("/health")
@app.get("/")
def health():
    return {
        "ok": True,
        "service": "stockflow-api",
        "backend": True,
        "model": settings.nebius_model,
        "hermes": bool(settings.hermes_api_key),
        "hermesUrl": settings.hermes_api_url,
        "hint": "API live on 127.0.0.1:3000 via nginx :80/:8080",
    }


@app.get("/v1/marketplaces")
def list_marketplaces():
    return get_doc()


@app.get("/v1/marketplaces/{marketplace_id}")
def marketplace(marketplace_id: str):
    result = get_marketplace(marketplace_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Marketplace not found")
    return result


@app.get("/v1/me")
async def me(user: dict[str, Any] = Depends(workspace_user)):
    return {
        "userId": user["user_id"],
        "workspace": user["workspace"],
        "orgId": user.get("org_id"),
        "profile": _profile(user["user_id"]),
    }


class ProfileIn(BaseModel):
    displayName: str = ""
    preferences: dict[str, Any] = Field(default_factory=dict)


@app.get("/v1/me/profile")
async def get_profile(user: dict[str, Any] = Depends(workspace_user)):
    return {"profile": _profile(user["user_id"])}


@app.put("/v1/me/profile")
async def put_profile(body: ProfileIn, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        conn.execute(
            """INSERT INTO profiles (user_id, display_name, preferences, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,
                 preferences=excluded.preferences, updated_at=excluded.updated_at""",
            (
                user["user_id"],
                body.displayName,
                json.dumps(body.preferences, ensure_ascii=False),
                _iso_now(),
            ),
        )
    return {"profile": _profile(user["user_id"])}


def _shop_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "marketplace": row["marketplace"],
        "displayName": row["display_name"],
        "status": row["status"],
        "listingCount": row["listing_count"],
    }


def _listing_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "shopId": row["shop_id"],
        "marketplace": row["marketplace"],
        "title": row["title"],
        "price": row["price"],
        "status": row["status"],
        "imageUrl": row["image_url"],
        "url": row["url"],
        "views": row["views"],
        "favorites": row["favorites"],
        "updatedAt": row["updated_at"],
    }


def _stock_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "sku": row["sku"],
        "qty": row["qty"],
        "price": row["price"],
        "marketplace": row["marketplace"],
        "ownerLabel": row["owner_label"],
    }


def _workflow_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "marketplace": row["marketplace"],
        "title": row["title"],
        "steps": json.loads(row["steps_json"]),
        "tone": row["tone"],
        "source": row["source"],
        "enabled": bool(row["enabled"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


@app.get("/v1/shops")
async def list_shops(user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        rows = conn.execute(
            """SELECT s.*, COUNT(l.id) AS listing_count
               FROM shops s LEFT JOIN listings l
                 ON l.workspace=s.workspace AND l.shop_id=s.id
               WHERE s.workspace=? GROUP BY s.workspace, s.id ORDER BY s.created_at, s.id""",
            (user["workspace"],),
        ).fetchall()
    return {"shops": [_shop_dict(row) for row in rows]}


@app.get("/v1/listings")
async def list_listings(shopId: str | None = None, user: dict[str, Any] = Depends(workspace_user)):
    query = "SELECT * FROM listings WHERE workspace=?"
    values: list[Any] = [user["workspace"]]
    if shopId:
        query += " AND shop_id=?"
        values.append(shopId)
    query += " ORDER BY updated_at DESC, id"
    with db.connection() as conn:
        rows = conn.execute(query, values).fetchall()
    return {"listings": [_listing_dict(row) for row in rows]}


@app.get("/v1/shops/{shop_id}/listings")
async def shop_listings(shop_id: str, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        shop = conn.execute(
            "SELECT 1 FROM shops WHERE workspace=? AND id=?",
            (user["workspace"], shop_id),
        ).fetchone()
        if shop is None:
            raise HTTPException(404, "Shop not found")
        rows = conn.execute(
            "SELECT * FROM listings WHERE workspace=? AND shop_id=? ORDER BY updated_at DESC, id",
            (user["workspace"], shop_id),
        ).fetchall()
    return {"listings": [_listing_dict(row) for row in rows]}


class ExtPairIn(BaseModel):
    name: str = "Chrome"


@app.post("/v1/extension/pair")
async def extension_pair(body: ExtPairIn, user: dict[str, Any] = Depends(workspace_user)):
    if user.get("via") == "extension":
        raise HTTPException(400, "Already an extension token")
    token = f"sfx_{uuid.uuid4().hex}"
    created_at = _iso_now()
    with db.connection() as conn:
        conn.execute(
            """INSERT INTO ext_tokens (token, user_id, workspace, created_by, name, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (token, user["user_id"], user["workspace"], user["user_id"], body.name, created_at),
        )
    return {"token": token}


@app.get("/v1/extension/me")
async def extension_me(user: dict[str, Any] = Depends(workspace_user)):
    return {
        "userId": user["user_id"],
        "via": user.get("via", "clerk"),
        "workspace": user["workspace"],
        "orgId": user.get("org_id"),
    }


class ExtSessionIn(BaseModel):
    marketplace: Literal["vinted", "leboncoin"]
    displayName: str
    cookies: str
    cookieNames: list[str] = Field(default_factory=list)
    bearer: str | None = None
    csrf: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


@app.post("/v1/extension/session")
async def extension_session(body: ExtSessionIn, user: dict[str, Any] = Depends(workspace_user)):
    if not body.cookies.strip():
        raise HTTPException(400, "cookies empty")
    workspace = user["workspace"]
    now = _iso_now()
    credentials = {
        "cookies": body.cookies,
        "cookieNames": body.cookieNames,
        "bearer": body.bearer,
        "csrf": body.csrf,
        "meta": {**body.meta, "receivedAt": now},
    }
    with db.connection() as conn:
        shop_row = conn.execute(
            "SELECT * FROM shops WHERE workspace=? AND marketplace=? ORDER BY created_at LIMIT 1",
            (workspace, body.marketplace),
        ).fetchone()
        if shop_row:
            shop_id = shop_row["id"]
            display_name = body.displayName or shop_row["display_name"]
            conn.execute(
                "UPDATE shops SET display_name=?, status='connected', updated_at=? WHERE workspace=? AND id=?",
                (display_name, now, workspace, shop_id),
            )
        else:
            shop_id = f"s-{uuid.uuid4().hex[:8]}"
            display_name = body.displayName
            conn.execute(
                """INSERT INTO shops (id, workspace, created_by, marketplace, display_name, status)
                   VALUES (?, ?, ?, ?, ?, 'connected')""",
                (shop_id, workspace, user["user_id"], body.marketplace, display_name),
            )
        conn.execute(
            """INSERT INTO marketplace_sessions
               (workspace, created_by, marketplace, display_name, credentials_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(workspace, marketplace) DO UPDATE SET
                 created_by=excluded.created_by, display_name=excluded.display_name,
                 credentials_json=excluded.credentials_json, updated_at=excluded.updated_at""",
            (
                workspace, user["user_id"], body.marketplace, display_name,
                json.dumps(credentials, ensure_ascii=False), now, now,
            ),
        )
        row = conn.execute(
            """SELECT s.*, COUNT(l.id) AS listing_count FROM shops s
               LEFT JOIN listings l ON l.workspace=s.workspace AND l.shop_id=s.id
               WHERE s.workspace=? AND s.id=? GROUP BY s.workspace, s.id""",
            (workspace, shop_id),
        ).fetchone()
    shop = _shop_dict(row)
    shop["hasCredentials"] = True
    return {"ok": True, "shop": shop}


class ShopIn(BaseModel):
    marketplace: Literal["vinted", "leboncoin"]
    displayName: str
    status: Literal["connected", "expired"] = "connected"
    listingCount: int = 0


class ShopPatch(BaseModel):
    displayName: str | None = None
    status: Literal["connected", "expired"] | None = None


@app.post("/v1/shops")
async def create_shop(body: ShopIn, user: dict[str, Any] = Depends(workspace_user)):
    shop_id = f"s-{uuid.uuid4().hex[:8]}"
    with db.connection() as conn:
        conn.execute(
            """INSERT INTO shops (id, workspace, created_by, marketplace, display_name, status, listing_count)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                shop_id, user["workspace"], user["user_id"], body.marketplace,
                body.displayName, body.status, body.listingCount,
            ),
        )
        row = conn.execute(
            "SELECT *, listing_count AS listing_count FROM shops WHERE workspace=? AND id=?",
            (user["workspace"], shop_id),
        ).fetchone()
    return {"shop": _shop_dict(row)}


@app.patch("/v1/shops/{shop_id}")
async def update_shop(shop_id: str, body: ShopPatch, user: dict[str, Any] = Depends(workspace_user)):
    changes = body.model_dump(exclude_unset=True)
    with db.connection() as conn:
        row = conn.execute(
            "SELECT * FROM shops WHERE workspace=? AND id=?",
            (user["workspace"], shop_id),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Shop not found")
        if changes:
            fields = []
            values: list[Any] = []
            for key, column in (("displayName", "display_name"), ("status", "status")):
                if key in changes and changes[key] is not None:
                    fields.append(f"{column}=?")
                    values.append(changes[key])
            if fields:
                values.extend([_iso_now(), user["workspace"], shop_id])
                conn.execute(
                    f"UPDATE shops SET {', '.join(fields)}, updated_at=? WHERE workspace=? AND id=?",
                    values,
                )
        row = conn.execute(
            """SELECT s.*, COUNT(l.id) AS listing_count FROM shops s LEFT JOIN listings l
               ON l.workspace=s.workspace AND l.shop_id=s.id
               WHERE s.workspace=? AND s.id=? GROUP BY s.workspace, s.id""",
            (user["workspace"], shop_id),
        ).fetchone()
    return {"shop": _shop_dict(row)}


@app.delete("/v1/shops/{shop_id}")
async def delete_shop(shop_id: str, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM shops WHERE workspace=? AND id=?",
            (user["workspace"], shop_id),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Shop not found")
        conn.execute("DELETE FROM listings WHERE workspace=? AND shop_id=?", (user["workspace"], shop_id))
        conn.execute("DELETE FROM shops WHERE workspace=? AND id=?", (user["workspace"], shop_id))
    return {"ok": True}


@app.get("/v1/stock")
async def list_stock(user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT * FROM stock WHERE workspace=? ORDER BY created_at, id",
            (user["workspace"],),
        ).fetchall()
    return {"items": [_stock_dict(row) for row in rows]}


class StockIn(BaseModel):
    title: str
    qty: int = Field(default=1, ge=0)
    price: float | None = None
    marketplace: str | None = None
    ownerLabel: str = "toi"
    sku: str | None = None


class StockPatch(BaseModel):
    title: str | None = None
    qty: int | None = Field(default=None, ge=0)
    price: float | None = None
    marketplace: str | None = None
    ownerLabel: str | None = None
    sku: str | None = None


@app.post("/v1/stock")
async def add_stock(body: StockIn, user: dict[str, Any] = Depends(workspace_user)):
    item_id = f"i-{uuid.uuid4().hex[:8]}"
    with db.connection() as conn:
        conn.execute(
            """INSERT INTO stock (id, workspace, created_by, title, sku, qty, price, marketplace, owner_label)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                item_id, user["workspace"], user["user_id"], body.title, body.sku,
                body.qty, body.price, body.marketplace, body.ownerLabel,
            ),
        )
        row = conn.execute(
            "SELECT * FROM stock WHERE workspace=? AND id=?",
            (user["workspace"], item_id),
        ).fetchone()
    return {"item": _stock_dict(row)}


@app.patch("/v1/stock/{item_id}")
async def update_stock(item_id: str, body: StockPatch, user: dict[str, Any] = Depends(workspace_user)):
    changes = body.model_dump(exclude_unset=True)
    columns = {
        "title": "title",
        "qty": "qty",
        "price": "price",
        "marketplace": "marketplace",
        "ownerLabel": "owner_label",
        "sku": "sku",
    }
    with db.connection() as conn:
        row = conn.execute(
            "SELECT * FROM stock WHERE workspace=? AND id=?",
            (user["workspace"], item_id),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Stock item not found")
        if changes:
            fields = [f"{columns[key]}=?" for key in changes]
            values = list(changes.values())
            values.extend([_iso_now(), user["workspace"], item_id])
            conn.execute(
                f"UPDATE stock SET {', '.join(fields)}, updated_at=? WHERE workspace=? AND id=?",
                values,
            )
        row = conn.execute(
            "SELECT * FROM stock WHERE workspace=? AND id=?",
            (user["workspace"], item_id),
        ).fetchone()
    return {"item": _stock_dict(row)}


@app.delete("/v1/stock/{item_id}")
async def delete_stock(item_id: str, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        result = conn.execute(
            "DELETE FROM stock WHERE workspace=? AND id=?",
            (user["workspace"], item_id),
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Stock item not found")
    return {"ok": True}


@app.get("/v1/workflows")
async def workflows(user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT * FROM workflows WHERE workspace=? ORDER BY created_at, id",
            (user["workspace"],),
        ).fetchall()
    return {"workflows": [_workflow_dict(row) for row in rows]}


class WorkflowPatch(BaseModel):
    enabled: bool


@app.patch("/v1/workflows/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    body: WorkflowPatch,
    user: dict[str, Any] = Depends(workspace_user),
):
    with db.connection() as conn:
        result = conn.execute(
            """UPDATE workflows SET enabled=?, updated_at=?
               WHERE workspace=? AND id=?""",
            (int(body.enabled), _iso_now(), user["workspace"], workflow_id),
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Workflow not found")
        row = conn.execute(
            "SELECT * FROM workflows WHERE workspace=? AND id=?",
            (user["workspace"], workflow_id),
        ).fetchone()
    return {"workflow": _workflow_dict(row)}


@app.post("/v1/org/invite-links")
async def create_invite_link(user: dict[str, Any] = Depends(workspace_user)):
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="Sélectionne une organisation")
    created_at = datetime.now(timezone.utc)
    expires_at = created_at + timedelta(days=7)
    token = f"inv_{uuid.uuid4().hex}"
    with db.connection() as conn:
        conn.execute(
            """INSERT INTO invite_links (token, org_id, created_by, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?)""",
            (
                token, org_id, user["user_id"],
                created_at.isoformat().replace("+00:00", "Z"),
                expires_at.isoformat().replace("+00:00", "Z"),
            ),
        )
    return {"token": token, "path": f"/join/{token}", "expiresAt": expires_at.isoformat().replace("+00:00", "Z")}


def _invite(token: str) -> dict[str, Any]:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM invite_links WHERE token=?", (token,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Lien d'invitation introuvable")
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Ce lien d'invitation a expiré")
    return dict(row)


@app.get("/v1/invites/{token}")
async def invite_info(token: str, _user: dict[str, Any] = Depends(workspace_user)):
    invite = _invite(token)
    org_name = await _organization_name(invite["org_id"])
    return {"orgId": invite["org_id"], "orgName": org_name, "expiresAt": invite["expires_at"]}


def _clerk_error_codes(payload: dict[str, Any]) -> set[str]:
    errors = payload.get("errors", [])
    if not isinstance(errors, list):
        return set()
    return {str(error.get("code")) for error in errors if isinstance(error, dict) and error.get("code")}


@app.post("/v1/invites/{token}/accept")
async def accept_invite(token: str, user: dict[str, Any] = Depends(workspace_user)):
    if user.get("via") != "clerk":
        raise HTTPException(status_code=401, detail="Connexion Clerk requise")
    invite = _invite(token)
    org_id = invite["org_id"]
    membership_status, membership_data = await _clerk_api(
        "POST",
        f"/organizations/{org_id}/memberships",
        {"user_id": user["user_id"], "role": "org:admin"},
    )
    if membership_status >= 400 and "already_a_member_in_organization" not in _clerk_error_codes(membership_data):
        raise HTTPException(status_code=502, detail="Impossible de rejoindre l'organisation")
    metadata_status, _metadata_data = await _clerk_api(
        "PATCH",
        f"/users/{user['user_id']}/metadata",
        {"public_metadata": {"stockflow_access": True}},
    )
    if metadata_status >= 400:
        raise HTTPException(status_code=502, detail="Impossible de mettre à jour l'accès Stockflow")
    return {"orgId": org_id}


class ChatIn(BaseModel):
    message: str = Field(min_length=1)
    images: list[str] = Field(default_factory=list)


@app.post("/v1/chat")
async def chat(body: ChatIn, user: dict[str, Any] = Depends(workspace_user)):
    """Chat via Hermes, then Nebius Token Factory (DeepSeek), or a mock response."""
    system = _build_chat_system_prompt() + await _chat_context(user)
    hermes_user_content: Any = body.message
    if body.images:
        hermes_user_content = [
            {"type": "text", "text": body.message},
            *[
                {"type": "image_url", "image_url": {"url": image_url}}
                for image_url in body.images[:4]
            ],
        ]
    hermes_messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": hermes_user_content},
    ]
    hermes_error = None

    if settings.hermes_api_key:
        try:
            async with httpx.AsyncClient(timeout=settings.hermes_timeout) as client:
                response = await client.post(
                    f"{settings.hermes_api_url.rstrip('/')}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.hermes_api_key}",
                        "X-Hermes-Session-Key": f"stockflow-{user['user_id']}",
                    },
                    json={
                        "model": settings.hermes_model,
                        "messages": hermes_messages,
                        "stream": False,
                    },
                )
            if response.status_code >= 400:
                hermes_error = f"Hermes returned HTTP {response.status_code}"
            else:
                choice = response.json()["choices"][0]
                finish_reason = choice.get("finish_reason")
                if finish_reason in ("error", "cancelled"):
                    hermes_error = f"Hermes finish_reason: {finish_reason}"
                else:
                    return {
                        "role": "assistant",
                        "content": choice["message"]["content"],
                        "model": settings.hermes_model,
                        "via": "hermes",
                    }
        except httpx.RequestError as e:
            hermes_error = f"Hermes connection failed ({type(e).__name__})"
        except Exception as e:
            hermes_error = f"Hermes response invalid ({type(e).__name__})"
        if hermes_error:
            hermes_error = hermes_error[:200]

    if not settings.nebius_api_key:
        result = {
            "role": "assistant",
            "content": f"(mock) Reçu: {body.message[:200]} — configure NEBIUS_API_KEY pour le vrai modèle.",
            "model": "mock",
        }
        if hermes_error:
            result["hermesError"] = hermes_error
        return result

    nebius_user_content: Any = body.message
    if body.images:
        nebius_user_content = [
            {"type": "text", "text": body.message},
            *[{"type": "text", "text": f"[image attachée: {u[:80]}]"} for u in body.images[:4]],
        ]

    payload = {
        "model": settings.nebius_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": nebius_user_content},
        ],
        "temperature": 0.4,
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{settings.nebius_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.nebius_api_key}"},
                json=payload,
            )
            if r.status_code >= 400:
                raise HTTPException(502, f"Nebius error {r.status_code}: {r.text[:300]}")
            data = r.json()
            content = data["choices"][0]["message"]["content"]
            result = {
                "role": "assistant",
                "content": content,
                "model": settings.nebius_model,
                "via": "nebius",
            }
            if hermes_error:
                result["hermesError"] = hermes_error
            return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Chat failed: {e}") from e
