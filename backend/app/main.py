"""OctoHandy API — binds 127.0.0.1:3000 behind nginx. Keep port 8080 reserved by the host."""

from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path
import hmac
import json
import base64
import random
import secrets
import re
import time
import uuid
from urllib.parse import urlencode
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import RedirectResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from jose import jwk, jwt
from jose.exceptions import JWTError
from pydantic import BaseModel, Field

from . import billing, connectors, db, events, market
from .desktop import _desktop_enabled, _desktop_token
from .human import HumanProfile, click_point, from_trace, key_delays, move_path, pre_action_delay, typos
from .marketplaces import agent_context, get_doc, get_marketplace
from .rfb import DesktopInputError, RemoteDesktop, keysym_for_key
from .screen import (
    SCREENPIPE_STALE_OUTCOME,
    ScreenpipeFrameStaleError,
    find_target,
    frame_elements,
    latest_frame_id,
)
from .settings import settings


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    db.initialize_database()
    yield
    events.flush()


app = FastAPI(title="OctoHandy API", version="0.1.0", lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_jwks_cache: dict[str, Any] = {"at": 0.0, "keys": []}
_organization_names: dict[str, str] = {}
_run_tasks: set[asyncio.Task[None]] = set()


def _build_chat_system_prompt() -> str:
    return (
        "You are OctoHandy, a marketplace assistant. Reply in the language the user writes in (English by default), concisely and "
        "helpful about stock, prices, buyer messages and workflows. You cover the "
        "marketplaces described in the reference below. Use it to decide whether an "
        "action goes through the API or a screenpipe_workflow, and which seller/"
        "buyer are needed.\n\n"
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

    # Mono-user app session (password login on the web app): oh.<exp>.<hmac>
    if token.startswith("oh."):
        parts = token.split(".")
        secret = settings.app_session_secret
        if len(parts) != 3 or not secret:
            raise HTTPException(401, "Invalid app token")
        _, exp, sig = parts
        good = hmac.new(secret.encode(), exp.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, good) or not exp.isdigit() or int(exp) < time.time():
            raise HTTPException(401, "Expired app token")
        uid = settings.app_user_id
        return {"user_id": uid, "workspace": f"user:{uid}", "org_id": None, "via": "app", "claims": {"email": settings.app_user_email}}

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
        shops=_default_shops() if settings.seed_demo_data else [],
        listings=_default_listings() if settings.seed_demo_data else [],
        stock=_default_stock("toi") if settings.seed_demo_data else [],
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
        raise HTTPException(status_code=503, detail="Clerk API not configured")
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
            raise HTTPException(status_code=502, detail="Could not fetch the organisation")
        if data.get("name"):
            _organization_names[org_id] = str(data["name"])
    return _organization_names.get(org_id, org_id)


async def _chat_context(user: dict[str, Any]) -> str:
    profile = _profile(user["user_id"])
    display_name = profile["displayName"] or "member without a name"
    preferences = json.dumps(profile["preferences"], ensure_ascii=False, separators=(",", ":"))
    policy = _inbox_policy(user["user_id"])
    org_id = user.get("org_id")
    workspace = "Espace perso"
    if org_id:
        try:
            org_name = await _organization_name(org_id, user.get("claims"))
        except HTTPException:
            org_name = org_id
        workspace = f"Organisation {org_name}"
    with db.connection() as conn:
        workflows = conn.execute(
            """SELECT title, intent_json, guardrails_json FROM workflows
               WHERE workspace=? AND enabled=1 ORDER BY created_at, id LIMIT 10""",
            (user["workspace"],),
        ).fetchall()
    workflow_lines = []
    for workflow in workflows:
        intent = json.loads(workflow["intent_json"] or "{}")
        guardrails = json.loads(workflow["guardrails_json"] or "[]")
        goal = str(intent.get("goal") or workflow["title"]).strip()
        rules = ", ".join(str(rule) for rule in guardrails[:3] if str(rule).strip())
        workflow_lines.append(f"- {workflow['title']} : {goal[:120]}" + (f" ; garde-fous : {rules[:120]}" if rules else ""))
    return (
        "\n\nContexte utilisateur\n"
        f"Profile: {display_name}. Preferences: {preferences}.\n"
        f"Autonomous inbox: auto-replies {'enabled' if policy['autoReply'] else 'disabled'}, "
        f"max discount without approval {policy['maxAutoDiscountPct']}% (above that, ask the seller for approval in the chat).\n"
        f"Espace : {workspace}."
        + ("\nAutomatisations actives :\n" + "\n".join(workflow_lines) if workflow_lines else "")
    )


@app.get("/health")
@app.get("/")
def health():
    return {
        "ok": True,
        "service": "octohandy-api",
        "backend": True,
        "model": settings.nebius_model,
        "hermes": bool(settings.hermes_api_key),
        "desktop": bool(settings.desktop_base_url and settings.desktop_signing_secret),
        "screenpipe": bool(settings.screenpipe_api_url and settings.screenpipe_api_key),
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


INBOX_POLICY_DEFAULTS: dict[str, Any] = {
    "autoReply": True,
    "maxAutoDiscountPct": 10,
    "tone": "friendly and professional, short replies, in the buyer's language",
    "signature": "",
}


def _inbox_policy(user_id: str) -> dict[str, Any]:
    prefs = _profile(user_id).get("preferences", {})
    raw = prefs.get("inbox") if isinstance(prefs.get("inbox"), dict) else {}
    policy = {**INBOX_POLICY_DEFAULTS, **raw}
    try:
        policy["maxAutoDiscountPct"] = max(0, min(90, int(policy["maxAutoDiscountPct"])))
    except (TypeError, ValueError):
        policy["maxAutoDiscountPct"] = INBOX_POLICY_DEFAULTS["maxAutoDiscountPct"]
    policy["autoReply"] = bool(policy.get("autoReply", True))
    return policy


class AgentMessageIn(BaseModel):
    kind: Literal["info", "approval", "sent"] = "info"
    marketplace: str | None = None
    title: str = Field(min_length=1, max_length=200)
    body: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


class AgentDecisionIn(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str = ""


def _agent_message_dict(row: Any) -> dict[str, Any]:
    d = dict(row)
    d["payload"] = json.loads(d.get("payload") or "{}")
    return d


@app.get("/v1/agent/policy")
async def get_agent_policy(user: dict[str, Any] = Depends(workspace_user)):
    policy = dict(_inbox_policy(user["user_id"]))
    with db.connection() as conn:
        policy["inboxAutopilot"] = _inbox_autopilot_state(conn, user["workspace"])
        ent = billing.entitlements(conn, user["workspace"])
    policy["plan"] = ent["plan"]
    policy["autoReply"] = bool(policy.get("autoReply")) and ent["autopilot"]
    return {"policy": policy}


@app.get("/v1/agent/messages")
async def list_agent_messages(
    status: str | None = None,
    since: str | None = None,
    limit: int = 50,
    user: dict[str, Any] = Depends(workspace_user),
):
    q = "SELECT * FROM agent_messages WHERE workspace = ?"
    args: list[Any] = [user["workspace"]]
    if status:
        q += " AND status = ?"
        args.append(status)
    if since:
        q += " AND created_at > ?"
        args.append(since)
    q += " ORDER BY created_at DESC LIMIT ?"
    args.append(max(1, min(200, limit)))
    with db.connection() as conn:
        rows = conn.execute(q, args).fetchall()
    return {"messages": [_agent_message_dict(r) for r in rows]}


@app.post("/v1/agent/messages")
async def create_agent_message(body: AgentMessageIn, user: dict[str, Any] = Depends(workspace_user)):
    mid = "am-" + uuid.uuid4().hex[:10]
    status = "pending" if body.kind == "approval" else "seen"
    with db.connection() as conn:
        conn.execute(
            "INSERT INTO agent_messages (id, workspace, kind, marketplace, title, body, payload, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (mid, user["workspace"], body.kind, body.marketplace, body.title, body.body,
             json.dumps(body.payload, ensure_ascii=False), status, _iso_now()),
        )
        row = conn.execute("SELECT * FROM agent_messages WHERE id = ?", (mid,)).fetchone()
    events.emit(
        "agent.approval_requested" if body.kind == "approval" else "agent.reply_sent",
        user["workspace"], {"messageId": mid, "title": body.title[:200]},
        marketplace=body.marketplace, user_id=user["user_id"],
    )
    return {"message": _agent_message_dict(row)}


@app.post("/v1/agent/messages/{message_id}/decide")
async def decide_agent_message(message_id: str, body: AgentDecisionIn, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        row = conn.execute(
            "SELECT * FROM agent_messages WHERE id = ? AND workspace = ?", (message_id, user["workspace"])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Message inconnu")
        if row["kind"] != "approval":
            raise HTTPException(400, "This message does not expect a decision")
        if row["status"] != "pending":
            return {"message": _agent_message_dict(row)}
        conn.execute(
            "UPDATE agent_messages SET status = ?, decision_note = ?, decided_at = ? WHERE id = ?",
            (body.decision, body.note or None, _iso_now(), message_id),
        )
        row = conn.execute("SELECT * FROM agent_messages WHERE id = ?", (message_id,)).fetchone()
    events.emit("agent.approval_decided", user["workspace"],
                {"messageId": message_id, "decision": body.decision},
                marketplace=row["marketplace"], user_id=user["user_id"])
    return {"message": _agent_message_dict(row)}


@app.get("/v1/me/profile")
async def get_profile(user: dict[str, Any] = Depends(workspace_user)):
    return {"profile": _profile(user["user_id"])}


@app.put("/v1/me/profile")
async def put_profile(body: ProfileIn, user: dict[str, Any] = Depends(workspace_user)):
    inbox = body.preferences.get("inbox") if isinstance(body.preferences, dict) else None
    with db.connection() as conn:
        if isinstance(inbox, dict) and inbox.get("autoReply"):
            billing.require_autopilot(conn, user["workspace"])
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


@app.get("/v1/billing")
async def get_billing(user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        return {"billing": billing.status(conn, user["workspace"])}


@app.post("/v1/billing/checkout")
async def billing_checkout(user: dict[str, Any] = Depends(workspace_user)):
    email = (user.get("claims") or {}).get("email")
    with db.connection() as conn:
        return {"url": billing.checkout_url(conn, user["workspace"], user["user_id"], email)}


@app.post("/v1/billing/portal")
async def billing_portal(user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        return {"url": billing.portal_url(conn, user["workspace"])}


@app.get("/v1/market/comps")
async def market_comps(q: str = "", marketplace: str = "ebay", price: float | None = None,
                       listingId: str | None = None, user: dict[str, Any] = Depends(workspace_user)):
    """Comparable prices for an item (sold on eBay, asking on Vinted/Leboncoin). Fed to Kafka → ClickHouse."""
    if listingId:
        with db.connection() as conn:
            row = conn.execute("SELECT title, price FROM listings WHERE workspace=? AND id=?",
                               (user["workspace"], listingId)).fetchone()
        if row is None:
            raise HTTPException(404, "Listing not found")
        q = q or row["title"]
        price = price if price is not None else row["price"]
    try:
        result = await asyncio.to_thread(market.comps, q, marketplace, own_price=price,
                                         workspace=user["workspace"], user_id=user["user_id"])
    except market.MarketError as e:
        raise HTTPException(503, str(e)) from e
    return {"comps": result}


@app.get("/v1/analytics/summary")
async def analytics_summary(days: int = 14, user: dict[str, Any] = Depends(workspace_user)):
    """Activity of the agent for this workspace, read from Aiven for ClickHouse (fed by the Kafka event stream)."""
    return {"analytics": await asyncio.to_thread(events.summary, user["workspace"], max(1, min(days, 90)))}


@app.post("/v1/billing/webhook")
async def billing_webhook(request: Request, stripe_signature: str | None = Header(default=None)):
    return billing.handle_webhook(await request.body(), stripe_signature)


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
        "createdBy": row["created_by"],
        "creatorName": row["creator_name"] if "creator_name" in row.keys() else None,
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
        "createdBy": row["created_by"],
        "creatorName": row["creator_name"] if "creator_name" in row.keys() else None,
    }


def _workflow_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "marketplace": row["marketplace"],
        "title": row["title"],
        "steps": json.loads(row["steps_json"]),
        "tone": row["tone"],
        "source": row["source"],
        "trigger": row["trigger"] or "",
        "intent": json.loads(row["intent_json"] or "{}"),
        "tools": json.loads(row["tools_json"] or "[]"),
        "guardrails": json.loads(row["guardrails_json"] or "[]"),
        "toneNotes": row["tone_notes"] or "",
        "confidence": row["confidence"] or "",
        "humanProfile": json.loads(row["human_profile_json"] or "{}"),
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
    query = """SELECT l.*, p.display_name AS creator_name FROM listings l
               LEFT JOIN profiles p ON p.user_id=l.created_by WHERE l.workspace=?"""
    values: list[Any] = [user["workspace"]]
    if shopId:
        query += " AND l.shop_id=?"
        values.append(shopId)
    query += " ORDER BY l.updated_at DESC, l.id"
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
            """SELECT l.*, p.display_name AS creator_name FROM listings l
               LEFT JOIN profiles p ON p.user_id=l.created_by
               WHERE l.workspace=? AND l.shop_id=? ORDER BY l.updated_at DESC, l.id""",
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
    marketplace: str
    displayName: str
    status: Literal["connected", "expired"] = "connected"
    listingCount: int = 0


class ShopPatch(BaseModel):
    displayName: str | None = None
    status: Literal["connected", "expired"] | None = None


@app.post("/v1/shops")
async def create_shop(body: ShopIn, user: dict[str, Any] = Depends(workspace_user)):
    if get_marketplace(body.marketplace) is None:
        raise HTTPException(404, "Marketplace inconnue")
    shop_id = f"s-{uuid.uuid4().hex[:8]}"
    with db.connection() as conn:
        current = conn.execute(
            "SELECT COUNT(*) AS n FROM shops WHERE workspace = ?", (user["workspace"],)
        ).fetchone()["n"]
        billing.check_shop_limit(conn, user["workspace"], current)
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


# ---------------------------------------------------------------------------
# Remote desktop (A4000): the seller logs into the marketplace in a real Chrome
# that lives next to Screenpipe and Hermes. Access = short-lived HMAC token that
# the A4000 gate verifies (Caddy forward_auth) on the noVNC websocket.

LOGIN_URLS: dict[str, str | None] = {
    "vinted": "https://www.vinted.fr/",
    "leboncoin": "https://auth.leboncoin.fr/login/",
    "ebay": "https://signin.ebay.fr/",
    "etsy": "https://www.etsy.com/fr/signin",
    "depop": "https://www.depop.com/login/",
    "vestiaire": "https://fr.vestiairecollective.com/login/",
    "wallapop": "https://fr.wallapop.com/login",
    "amazon": "https://sellercentral.amazon.fr/",
    "facebook_marketplace": "https://www.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2Fmarketplace%2F",
}


def _marketplace_start_url(marketplace: str | None) -> str | None:
    if not marketplace:
        return None
    if marketplace in LOGIN_URLS:
        return LOGIN_URLS[marketplace]
    doc = get_marketplace(marketplace) or {}
    for key in ("login_url", "url", "website"):
        if isinstance(doc.get(key), str) and doc[key].startswith("http"):
            return doc[key]
    return f"https://www.{marketplace}.fr/"


async def _desktop_open(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(
                f"{settings.desktop_base_url.rstrip('/')}/desktop/open",
                headers={"X-Gate-Secret": settings.desktop_signing_secret},
                json={"url": url},
            )
            return response.status_code == 200
    except httpx.HTTPError:
        return False


def _acquire_desktop_lease(user: dict[str, Any], marketplace: str | None, ttl: int) -> None:
    _lease_id, remaining = db.acquire_desktop_lease(
        user["workspace"], user["user_id"], marketplace, ttl
    )
    if remaining is not None:
        minutes = max(1, (remaining + 59) // 60)
        raise HTTPException(
            409,
            f"The desktop is already in use by another team, try again in {minutes} minute(s).",
        )


class DesktopSessionIn(BaseModel):
    marketplace: str | None = None
    purpose: Literal["connect", "teach", "browse"] = "connect"


@app.get("/v1/desktop")
async def desktop_status(user: dict[str, Any] = Depends(workspace_user)):
    return {
        "enabled": _desktop_enabled(),
        "host": settings.desktop_base_url or None,
        "marketplaces": sorted(LOGIN_URLS),
    }


@app.post("/v1/desktop/sessions")
async def create_desktop_session(body: DesktopSessionIn, user: dict[str, Any] = Depends(workspace_user)):
    if not _desktop_enabled():
        raise HTTPException(503, "Remote desktop not configured (DESKTOP_BASE_URL / DESKTOP_SIGNING_SECRET)")
    if body.marketplace and get_marketplace(body.marketplace) is None and body.marketplace not in LOGIN_URLS:
        raise HTTPException(404, "Marketplace inconnue")
    _acquire_desktop_lease(user, body.marketplace, settings.desktop_session_ttl)
    try:
        await _gate_json("/desktop/profiles/ensure"[8:], {"workspace": user["workspace"]}, timeout=150)
    except (httpx.HTTPError, ValueError):
        pass  # gate without multi-profile support: falls back to its default profile
    token, exp = _desktop_token(user["workspace"], body.marketplace, settings.desktop_session_ttl)
    params = {
        "autoconnect": "1",
        "resize": "scale",
        "reconnect": "1",
        "reconnect_delay": "1500",
        "show_dot": "1",
        "t": token,
        "path": f"websockify?t={token}",
    }
    if settings.desktop_vnc_password:
        params["password"] = settings.desktop_vnc_password
    url = f"{settings.desktop_base_url.rstrip('/')}/vnc.html?{urlencode(params)}"
    start_url = _marketplace_start_url(body.marketplace) if body.purpose == "connect" else None
    opened = await _desktop_open(start_url) if start_url else False
    events.emit("desktop.session", user["workspace"], {"purpose": body.purpose},
                marketplace=body.marketplace, user_id=user["user_id"])
    return {
        "url": url,
        "expiresAt": datetime.fromtimestamp(exp, tz=timezone.utc).isoformat(),
        "marketplace": body.marketplace,
        "purpose": body.purpose,
        "startUrl": start_url,
        "opened": opened,
    }


@app.post("/v1/desktop/release")
async def release_desktop(user: dict[str, Any] = Depends(workspace_user)):
    db.release_desktop_lease(user["workspace"])
    return {"ok": True}


class DesktopConnectedIn(BaseModel):
    marketplace: str
    displayName: str | None = None


@app.post("/v1/desktop/connected")
async def desktop_connected(body: DesktopConnectedIn, user: dict[str, Any] = Depends(workspace_user)):
    doc = get_marketplace(body.marketplace)
    if doc is None and body.marketplace not in LOGIN_URLS:
        raise HTTPException(404, "Marketplace inconnue")
    name = body.displayName or f"{(doc or {}).get('name') or body.marketplace.capitalize()} · bureau distant"
    with db.connection() as conn:
        row = conn.execute(
            "SELECT * FROM shops WHERE workspace=? AND marketplace=? ORDER BY created_at LIMIT 1",
            (user["workspace"], body.marketplace),
        ).fetchone()
        if row is None:
            shop_id = f"s-{uuid.uuid4().hex[:8]}"
            conn.execute(
                """INSERT INTO shops (id, workspace, created_by, marketplace, display_name, status, listing_count)
                   VALUES (?, ?, ?, ?, ?, 'connected', 0)""",
                (shop_id, user["workspace"], user["user_id"], body.marketplace, name),
            )
        else:
            shop_id = row["id"]
            conn.execute(
                "UPDATE shops SET status='connected', display_name=COALESCE(?, display_name), updated_at=? WHERE workspace=? AND id=?",
                (body.displayName, _iso_now(), user["workspace"], shop_id),
            )
        row = conn.execute(
            """SELECT s.*, COUNT(l.id) AS listing_count FROM shops s LEFT JOIN listings l
               ON l.workspace=s.workspace AND l.shop_id=s.id
               WHERE s.workspace=? AND s.id=? GROUP BY s.workspace, s.id""",
            (user["workspace"], shop_id),
        ).fetchone()
    return {"shop": _shop_dict(row)}


# ---------------------------------------------------------------------------
# Teach by doing: the seller performs the task once on the remote desktop, we
# pull that time window from Screenpipe (same machine as Chrome) and Hermes
# compiles the trace into a workflow card built from a fixed tool catalog.

TEACH_TOOLS: list[str] = [
    "list_unread_messages", "read_thread", "send_message", "list_favorites", "list_offers",
    "send_offer", "get_listing", "update_price", "republish_listing", "list_notifications",
    "wait_for_event", "notify_seller",
]

_WORKFLOW_TONES = {"vinted": "teal", "leboncoin": "amber"}


def _teach_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "marketplace": row["marketplace"],
        "status": row["status"],
        "startedAt": row["started_at"],
        "endedAt": row["ended_at"],
        "trace": json.loads(row["trace_json"]) if row["trace_json"] else None,
        "draft": json.loads(row["draft_json"]) if row["draft_json"] else None,
        "workflowId": row["workflow_id"],
        "error": row["error"],
        "createdAt": row["created_at"],
    }


def _teach_row(conn: Any, workspace: str, teach_id: str) -> Any:
    row = conn.execute(
        "SELECT * FROM teach_sessions WHERE workspace=? AND id=?", (workspace, teach_id)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Session d'apprentissage introuvable")
    return row


def _screenpipe_enabled() -> bool:
    return bool(settings.screenpipe_api_url and settings.screenpipe_api_key)


_SITE_RE = re.compile(r"(?<![@\w.-])((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:fr|com|net|org|io|co|eu|de|es|it|be|uk|app))\b", re.I)
_SITE_LABELS = {"vinted": "Vinted", "leboncoin": "Leboncoin", "ebay": "eBay", "etsy": "Etsy", "depop": "Depop", "vestiairecollective": "Vestiaire Collective",
                "wallapop": "Wallapop", "facebook": "Facebook", "google": "Google", "accounts": "Google", "octohandy": "OctoHandy"}


def _guess_site(text: str) -> str:
    for m in _SITE_RE.finditer(text or ""):
        host = m.group(1).lower().removeprefix("www.")
        if host.endswith((".sslip.io", "localhost")):
            continue
        key = host.split(".")[0]
        if key in ("auth", "fr", "en", "m") and host.count(".") >= 2:
            key = host.split(".")[1]
        return _SITE_LABELS.get(key, host)
    return ""


_OCR_NOISE = {"sam", "dim", "lun", "mar", "mer", "jeu", "ven", "janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc",
              "octohandy", "_octohandy", "os", "new", "tab", "google-chrome", "chrome", "applications", "vy"}


def _clean_ocr(text: str, limit: int = 420) -> str:
    """OCR brut → phrases lisibles : on jette les miettes (icônes, barre de titre, tokens pleins de symboles)."""
    out: list[str] = []
    for raw in re.split(r"[|\n]+", text or ""):
        words = [w for w in raw.split() if re.search(r"[A-Za-zÀ-ÿ]{2,}", w) and len(re.sub(r"[A-Za-zÀ-ÿ0-9€%'’,.-]", "", w)) <= 1
                 and w.strip(",.").lower() not in _OCR_NOISE and not (w.isupper() and len(w) <= 3)]
        if len(words) < 3:
            continue
        phrase = " ".join(words)
        if re.search(r"(New Tab|Google Chrome|octohandy -|sam\. \d|dim\. \d|lun\. \d|mar\. \d|mer\. \d|jeu\. \d|ven\. \d)", phrase):
            continue
        out.append(phrase)
    joined = " · ".join(out)
    return joined[:limit].rstrip(" ·")


async def _desktop_active_tab() -> dict[str, str] | None:
    """Onglet actif du Chrome du bureau (titre + URL) via le gate, pour nommer ce qui est à l'écran."""
    if not _desktop_enabled():
        return None
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            response = await client.post(
                f"{settings.desktop_base_url.rstrip('/')}/desktop/browser",
                headers={"X-Gate-Secret": settings.desktop_signing_secret}, json={"action": "tabs"},
            )
        tabs = response.json().get("tabs") or []
        return tabs[0] if tabs else None
    except (httpx.HTTPError, ValueError):
        return None


def _screen_label(site: str, tab: dict[str, str] | None) -> str:
    if tab and tab.get("url", "").startswith("http"):
        host = re.sub(r"^https?://(www\.)?", "", tab["url"]).split("/")[0]
        name = _SITE_LABELS.get(host.split(".")[0], host)
        title = (tab.get("title") or "").strip()
        return f"Chrome · {name}" + (f" — {title[:70]}" if title and title.lower() != name.lower() else "")
    return f"Chrome · {site}" if site else "Bureau OctoHandy"


async def _screenpipe_events(start_iso: str, end_iso: str) -> dict[str, Any]:
    """Fetch the Screenpipe window and compress it into a compact, de-duplicated trace."""
    items: list[dict[str, Any]] = []
    headers = {"Authorization": f"Bearer {settings.screenpipe_api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        for offset in range(0, 600, 200):
            response = await client.get(
                f"{settings.screenpipe_api_url.rstrip('/')}/search",
                headers=headers,
                params={
                    "content_type": "all", "start_time": start_iso, "end_time": end_iso,
                    "limit": 200, "offset": offset,
                },
            )
            response.raise_for_status()
            page = response.json().get("data", [])
            items.extend(page)
            if len(page) < 200:
                break
    items.sort(key=lambda item: str((item.get("content") or {}).get("timestamp", "")))
    events: list[dict[str, Any]] = []
    seen_lines: set[str] = set()
    apps: dict[str, int] = {}
    total_chars = 0
    for item in items:
        content = item.get("content") or {}
        kind = str(item.get("type", "")).lower()
        app = str(content.get("app_name") or "")
        window = str(content.get("window_name") or content.get("title") or "")
        text = str(content.get("text") or content.get("transcription") or "")
        apps[app or "?"] = apps.get(app or "?", 0) + 1
        lines: list[str] = []
        for raw in text.splitlines():
            line = " ".join(raw.split())
            if len(line) < 3 or line in seen_lines:
                continue
            seen_lines.add(line)
            lines.append(line)
        snippet = _clean_ocr(" | ".join(lines), 600)
        window = window or _guess_site(text) or (events[-1]["window"] if events else "")
        if not snippet and (not events or events[-1]["window"] == window):
            continue
        if events and events[-1]["window"] == window and events[-1]["kind"] == kind and len(events[-1]["text"]) < 900:
            events[-1]["text"] = (events[-1]["text"] + " | " + snippet).strip(" |")[:1200]
        else:
            events.append({
                "t": str(content.get("timestamp") or ""), "kind": kind, "app": app,
                "window": window, "text": snippet,
            })
        total_chars += len(snippet)
        if total_chars > 14000:
            break
    return {
        "frames": len(items), "events": events[:80], "apps": apps,
        "windows": list(dict.fromkeys(event["window"] for event in events if event["window"]))[:20],
    }


_SCREEN_SUMMARY_CACHE: dict[str, dict[str, str]] = {}
_SCREEN_SUMMARY_SYSTEM = """You explain to a non-technical seller what is happening on the screen of their OctoHandy desktop.
On te donne des extraits OCR bruts (texte reconnu sur des captures d'écran, souvent abîmé) de pages web, dans l'ordre.
For EACH excerpt answer with: "label" (3 to 6 English words: site + what it is, e.g. "Leboncoin — login page",
"Vinted — search results", "Google — two-step verification") and "summary" (ONE simple sentence in English, max 25 words,
qui dit ce qu'on voit et ce qui se passe, sans jargon, sans citer le texte abîmé ; cite un e-mail/pseudo/article/prix s'il est lisible).
Réponds UNIQUEMENT en JSON : {"items": [{"i": 0, "label": "...", "summary": "..."}, ...]}"""


async def _describe_screen_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach `label`/`summary` (plain French) to screen events; one Nebius call for the misses, cached by content."""
    todo: list[tuple[int, str]] = []
    for idx, event in enumerate(events):
        key = hashlib.sha1(f"{event.get('window')}|{event.get('text', '')[:600]}".encode()).hexdigest()
        event["key"] = key
        cached = _SCREEN_SUMMARY_CACHE.get(key)
        if cached:
            event.update(cached)
        elif event.get("text"):
            todo.append((idx, key))
    if todo and settings.nebius_api_key:
        payload = "\n\n".join(f"[{n}] ({events[i].get('window') or 'site inconnu'}) {events[i]['text'][:500]}" for n, (i, _) in enumerate(todo))
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                response = await client.post(
                    f"{settings.nebius_base_url.rstrip('/')}/chat/completions",
                    headers={"Authorization": f"Bearer {settings.nebius_api_key}"},
                    json={"model": settings.nebius_model, "temperature": 0.1, "response_format": {"type": "json_object"},
                          "messages": [{"role": "system", "content": _SCREEN_SUMMARY_SYSTEM}, {"role": "user", "content": payload}]},
                )
            parsed = _parse_json_block(response.json()["choices"][0]["message"]["content"]) if response.status_code < 400 else None
            for item in (parsed or {}).get("items", []):
                n = int(item.get("i", -1))
                if 0 <= n < len(todo):
                    i, key = todo[n]
                    desc = {"label": str(item.get("label") or "")[:80], "summary": str(item.get("summary") or "")[:220]}
                    if desc["summary"]:
                        _SCREEN_SUMMARY_CACHE[key] = desc
                        events[i].update(desc)
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            pass
        if len(_SCREEN_SUMMARY_CACHE) > 600:
            for key in list(_SCREEN_SUMMARY_CACHE)[:200]:
                _SCREEN_SUMMARY_CACHE.pop(key, None)
    for event in events:
        event.setdefault("label", f"Chrome · {event['window']}" if event.get("window") else "Bureau OctoHandy")
        event.setdefault("summary", "")
        event.pop("key", None)
    return events


def _parse_json_block(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("\n") + 1:] if "\n" in text else text
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        data = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _fallback_draft(marketplace: str, trace: dict[str, Any]) -> dict[str, Any]:
    windows = [w for w in trace.get("windows", []) if w][:4] or ["Action performed on the marketplace"]
    return {
        "title": f"Workflow {marketplace.capitalize()} appris le {datetime.now(timezone.utc).strftime('%d/%m %H:%M')}",
        "trigger": "",
        "steps": [f"Screen: {w[:90]}" for w in windows],
        "tools": [], "guardrails": ["Toujours demander validation avant d'envoyer un message"],
        "tone_notes": "", "confidence": "low",
        "intent": {
            "goal": "",
            "actor": "seller",
            "entities": {},
            "success_criteria": "",
            "constraints": [],
        },
    }


async def _llm_json(system: str, user_text: str, session_key: str) -> tuple[dict[str, Any] | None, str]:
    """Hermes first (same OpenAI-compatible gateway as /v1/chat), then Nebius DeepSeek directly."""
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user_text}]
    if settings.hermes_api_key:
        try:
            async with httpx.AsyncClient(timeout=settings.hermes_timeout) as client:
                response = await client.post(
                    f"{settings.hermes_api_url.rstrip('/')}/chat/completions",
                    headers={"Authorization": f"Bearer {settings.hermes_api_key}", "X-Hermes-Session-Key": session_key},
                    json={"model": settings.hermes_model, "messages": messages, "stream": False},
                )
            if response.status_code < 400:
                parsed = _parse_json_block(response.json()["choices"][0]["message"]["content"])
                if parsed:
                    return parsed, "hermes"
        except (httpx.HTTPError, KeyError, ValueError):
            pass
    if settings.nebius_api_key:
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                response = await client.post(
                    f"{settings.nebius_base_url.rstrip('/')}/chat/completions",
                    headers={"Authorization": f"Bearer {settings.nebius_api_key}"},
                    json={"model": settings.nebius_model, "messages": messages, "temperature": 0.2,
                          "response_format": {"type": "json_object"}},
                )
            if response.status_code < 400:
                parsed = _parse_json_block(response.json()["choices"][0]["message"]["content"])
                if parsed:
                    return parsed, "nebius"
        except (httpx.HTTPError, KeyError, ValueError):
            pass
    return None, "none"


_TEACH_SYSTEM = """Tu es le compilateur de workflows d'OctoHandy, un assistant pour vendeurs sur les marketplaces
(Vinted, Leboncoin, eBay…). On te donne la trace Screenpipe (texte OCR des écrans, titres de fenêtres, ordre
chronologique) d'un vendeur qui vient de faire UNE FOIS, à la main, la tâche qu'il veut automatiser.
Déduis le workflow réutilisable et réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de texte avant ou après) :
{
 "title": "short English title (max 60 chars), e.g. 'Favourite → price offer'",
 "trigger": "the event that starts the workflow, one English sentence",
 "steps": ["3 to 6 short steps in English, imperative, e.g. 'Buyer favourites an item'"],
 "tools": [{"tool": "<un outil du catalogue>", "args": {"...": "..."}}],
 "intent": {
   "goal": "ce que le vendeur veut obtenir, en une phrase",
   "actor": "seller|buyer",
   "entities": {"marketplace": "...", "article": "...", "prix_plancher": "...", "delai": "..."},
   "success_criteria": "how to tell the goal is reached (English)",
   "constraints": ["limits and conditions to respect (English)"]
 },
 "guardrails": ["inferred safety rules in English (floor price, never answer off-topic, human approval…)"],
 "tone_notes": "how the seller writes (formality, emojis, phrases), inferred from the typed messages — described in English",
 "confidence": "high|medium|low"
}
Catalogue d'outils autorisés (n'en invente pas d'autre) : %s.
Ignore les bandeaux cookies, publicités, onglets sans rapport. Si la trace est trop pauvre, mets confidence "low"
et propose quand même le workflow le plus plausible pour cette marketplace.""" % ", ".join(TEACH_TOOLS)


async def _compile_teach(marketplace: str, trace: dict[str, Any], user_id: str) -> tuple[dict[str, Any], str]:
    started = trace.get("events", [{}])[0].get("t", "") if trace.get("events") else ""
    lines = [f"Marketplace: {marketplace}", f"Screenpipe frames: {trace.get('frames')}", f"Start: {started}", "Trace:"]
    for event in trace.get("events", []):
        lines.append(f"- [{event['t'][11:19]}] {event['app']} / {event['window'][:80]} :: {event['text'][:500]}")
    draft, via = await _llm_json(_TEACH_SYSTEM, "\n".join(lines)[:16000], f"octohandy-teach-{user_id}")
    if not draft or not isinstance(draft.get("steps"), list) or not draft.get("title"):
        return _fallback_draft(marketplace, trace), "fallback"
    draft["steps"] = [str(step)[:160] for step in draft["steps"]][:8]
    draft["tools"] = [tool for tool in draft.get("tools", []) if isinstance(tool, dict) and tool.get("tool") in TEACH_TOOLS]
    intent = draft.get("intent") if isinstance(draft.get("intent"), dict) else {}
    entities = intent.get("entities") if isinstance(intent.get("entities"), dict) else {}
    draft["intent"] = {
        "goal": str(intent.get("goal") or "")[:500],
        "actor": intent.get("actor") if intent.get("actor") in ("seller", "buyer") else "seller",
        "entities": {
            str(key)[:80]: str(value)[:300]
            for key, value in list(entities.items())[:30]
            if isinstance(value, (str, int, float, bool))
        },
        "success_criteria": str(intent.get("success_criteria") or "")[:500],
        "constraints": [str(item)[:300] for item in intent.get("constraints", []) if str(item).strip()][:20]
        if isinstance(intent.get("constraints"), list) else [],
    }
    draft["guardrails"] = [str(rule)[:300] for rule in draft.get("guardrails", []) if str(rule).strip()][:20]
    draft["trigger"] = str(draft.get("trigger") or "")[:300]
    draft["tone_notes"] = str(draft.get("tone_notes") or "")[:500]
    draft["confidence"] = draft.get("confidence") if draft.get("confidence") in ("high", "medium", "low") else "low"
    return draft, via


class TeachStartIn(BaseModel):
    marketplace: str


class TeachSaveIn(BaseModel):
    title: str | None = None
    steps: list[str] | None = None
    enabled: bool = False


@app.get("/v1/teach")
async def list_teach(user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT * FROM teach_sessions WHERE workspace=? ORDER BY created_at DESC LIMIT 20",
            (user["workspace"],),
        ).fetchall()
    return {"enabled": _desktop_enabled() and _screenpipe_enabled(), "sessions": [_teach_dict(row) for row in rows]}


@app.post("/v1/teach/start")
async def teach_start(body: TeachStartIn, user: dict[str, Any] = Depends(workspace_user)):
    if not (_desktop_enabled() and _screenpipe_enabled()):
        raise HTTPException(503, "Teaching unavailable: remote desktop or Screenpipe not configured")
    if get_marketplace(body.marketplace) is None and body.marketplace not in LOGIN_URLS:
        raise HTTPException(404, "Marketplace inconnue")
    session_ttl = max(settings.desktop_session_ttl, 1800)
    _acquire_desktop_lease(user, body.marketplace, session_ttl)
    teach_id = f"t-{uuid.uuid4().hex[:8]}"
    now = _iso_now()
    with db.connection() as conn:
        conn.execute(
            "UPDATE teach_sessions SET status='abandoned', updated_at=? WHERE workspace=? AND status='recording'",
            (now, user["workspace"]),
        )
        conn.execute(
            """INSERT INTO teach_sessions (id, workspace, created_by, marketplace, status, started_at)
               VALUES (?, ?, ?, ?, 'recording', ?)""",
            (teach_id, user["workspace"], user["user_id"], body.marketplace, now),
        )
        row = _teach_row(conn, user["workspace"], teach_id)
    token, exp = _desktop_token(user["workspace"], body.marketplace, session_ttl)
    params = {
        "autoconnect": "1", "resize": "scale", "reconnect": "1", "reconnect_delay": "1500",
        "show_dot": "1", "t": token, "path": f"websockify?t={token}",
    }
    if settings.desktop_vnc_password:
        params["password"] = settings.desktop_vnc_password
    start_url = _marketplace_start_url(body.marketplace)
    opened = await _desktop_open(start_url) if start_url else False
    return {
        "session": _teach_dict(row),
        "desktop": {
            "url": f"{settings.desktop_base_url.rstrip('/')}/vnc.html?{urlencode(params)}",
            "expiresAt": datetime.fromtimestamp(exp, tz=timezone.utc).isoformat(),
            "opened": opened,
        },
    }


@app.post("/v1/teach/{teach_id}/stop")
async def teach_stop(teach_id: str, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        row = _teach_row(conn, user["workspace"], teach_id)
        if row["status"] != "recording":
            raise HTTPException(409, "Cette session n'est plus en cours d'enregistrement")
        ended = _iso_now()
        conn.execute(
            "UPDATE teach_sessions SET status='compiling', ended_at=?, updated_at=? WHERE workspace=? AND id=?",
            (ended, ended, user["workspace"], teach_id),
        )
    error = None
    trace: dict[str, Any] = {"frames": 0, "events": [], "apps": {}, "windows": []}
    try:
        # Screenpipe indexes with a few seconds of delay: give it a short grace period.
        await asyncio.sleep(4)
        trace = await _screenpipe_events(row["started_at"], ended)
    except (httpx.HTTPError, ValueError) as e:
        error = f"Screenpipe indisponible ({type(e).__name__})"
    try:
        draft, via = await _compile_teach(row["marketplace"], trace, user["user_id"])
    finally:
        db.release_desktop_lease(user["workspace"])
    draft["via"] = via
    with db.connection() as conn:
        conn.execute(
            """UPDATE teach_sessions SET status='draft', trace_json=?, draft_json=?, error=?, updated_at=?
               WHERE workspace=? AND id=?""",
            (json.dumps({**trace, "events": trace["events"][:40]}, ensure_ascii=False), json.dumps(draft, ensure_ascii=False),
             error, _iso_now(), user["workspace"], teach_id),
        )
        row = _teach_row(conn, user["workspace"], teach_id)
    return {"session": _teach_dict(row)}


@app.post("/v1/teach/{teach_id}/save")
async def teach_save(teach_id: str, body: TeachSaveIn, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        row = _teach_row(conn, user["workspace"], teach_id)
        draft = json.loads(row["draft_json"] or "{}")
        trace = json.loads(row["trace_json"] or "{}")
        title = (body.title or draft.get("title") or "Workflow appris").strip()[:80]
        steps = [step.strip() for step in (body.steps or draft.get("steps") or []) if step and step.strip()][:8]
        if not steps:
            raise HTTPException(422, "The workflow needs at least one step")
        workflow_id = row["workflow_id"] or f"w-{uuid.uuid4().hex[:8]}"
        tone = _WORKFLOW_TONES.get(row["marketplace"], "blue")
        intent = draft.get("intent") if isinstance(draft.get("intent"), dict) else {}
        tools = draft.get("tools") if isinstance(draft.get("tools"), list) else []
        guardrails = draft.get("guardrails") if isinstance(draft.get("guardrails"), list) else []
        profile = asdict(from_trace(user["user_id"], trace))
        metadata = (
            str(draft.get("trigger") or ""),
            json.dumps(intent, ensure_ascii=False),
            json.dumps(tools, ensure_ascii=False),
            json.dumps(guardrails, ensure_ascii=False),
            str(draft.get("tone_notes") or ""),
            str(draft.get("confidence") or "low"),
            json.dumps(profile, ensure_ascii=False),
        )
        if row["workflow_id"]:
            conn.execute(
                """UPDATE workflows SET title=?, steps_json=?, enabled=?, "trigger"=?, intent_json=?,
                   tools_json=?, guardrails_json=?, tone_notes=?, confidence=?, human_profile_json=?,
                   updated_at=? WHERE workspace=? AND id=?""",
                (title, json.dumps(steps, ensure_ascii=False), int(body.enabled), *metadata,
                 _iso_now(), user["workspace"], workflow_id),
            )
        else:
            conn.execute(
                """INSERT INTO workflows
                   (id, workspace, created_by, marketplace, title, steps_json, tone, source, enabled,
                    "trigger", intent_json, tools_json, guardrails_json, tone_notes, confidence, human_profile_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'teach', ?, ?, ?, ?, ?, ?, ?, ?)""",
                (workflow_id, user["workspace"], user["user_id"], row["marketplace"], title,
                 json.dumps(steps, ensure_ascii=False), tone, int(body.enabled), *metadata),
            )
        conn.execute(
            "UPDATE teach_sessions SET status='saved', workflow_id=?, updated_at=? WHERE workspace=? AND id=?",
            (workflow_id, _iso_now(), user["workspace"], teach_id),
        )
        workflow = conn.execute(
            "SELECT * FROM workflows WHERE workspace=? AND id=?", (user["workspace"], workflow_id)
        ).fetchone()
        row = _teach_row(conn, user["workspace"], teach_id)
    return {"workflow": _workflow_dict(workflow), "session": _teach_dict(row)}


@app.delete("/v1/teach/{teach_id}")
async def teach_discard(teach_id: str, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        _teach_row(conn, user["workspace"], teach_id)
        conn.execute(
            "UPDATE teach_sessions SET status='discarded', updated_at=? WHERE workspace=? AND id=?",
            (_iso_now(), user["workspace"], teach_id),
        )
    db.release_desktop_lease(user["workspace"])
    return {"ok": True}


# ---------------------------------------------------------------------------
# Workflow runs: Hermes turns a workflow card + the live desktop context
# (Screenpipe, last minutes) into a concrete action plan; the seller approves;
# the backend executes in "assisted" mode on the A4000 desktop (opens the right
# marketplace page in Chrome, puts the drafted message in the clipboard, logs
# every step). Fully autonomous clicking is deliberately out of scope for the PoC.

INBOX_URLS: dict[str, str] = {
    "vinted": "https://www.vinted.fr/inbox",
    "leboncoin": "https://www.leboncoin.fr/messages",
    "ebay": "https://mesg.ebay.fr/mesgweb/ViewMessages/0",
    "etsy": "https://www.etsy.com/fr/messages",
    "depop": "https://www.depop.com/messages/",
    "vestiaire": "https://fr.vestiairecollective.com/my-account/messages/",
    "wallapop": "https://fr.wallapop.com/app/chat",
    "facebook_marketplace": "https://www.facebook.com/messages/",
}
LISTINGS_URLS: dict[str, str] = {
    "vinted": "https://www.vinted.fr/member/general/items",
    "leboncoin": "https://www.leboncoin.fr/compte/part/mes-annonces",
    "ebay": "https://www.ebay.fr/sh/lst/active",
    "etsy": "https://www.etsy.com/your/shops/me/tools/listings",
    "depop": "https://www.depop.com/products/",
    "vestiaire": "https://fr.vestiairecollective.com/my-account/my-items/",
    "wallapop": "https://fr.wallapop.com/app/catalog/published",
    "facebook_marketplace": "https://www.facebook.com/marketplace/you/selling",
}
_MESSAGE_TOOLS = {"list_unread_messages", "read_thread", "send_message", "send_offer", "list_offers", "list_favorites", "list_notifications"}
_LISTING_TOOLS = {"get_listing", "update_price", "republish_listing"}


def _run_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "workflowId": row["workflow_id"],
        "status": row["status"],
        "mode": row["mode"],
        "context": json.loads(row["context_json"]) if row["context_json"] else None,
        "plan": json.loads(row["plan_json"]) if row["plan_json"] else None,
        "log": json.loads(row["log_json"]) if row["log_json"] else [],
        "error": row["error"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _run_row(conn: Any, workspace: str, run_id: str) -> Any:
    row = conn.execute("SELECT * FROM workflow_runs WHERE workspace=? AND id=?", (workspace, run_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Run not found")
    return row


async def _desktop_clipboard(text: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(
                f"{settings.desktop_base_url.rstrip('/')}/desktop/clipboard",
                headers={"X-Gate-Secret": settings.desktop_signing_secret},
                json={"text": text},
            )
            return response.status_code == 200
    except httpx.HTTPError:
        return False


_RUN_SYSTEM = """Tu es l'agent Hermes d'OctoHandy, qui exécute des workflows pour un vendeur sur une marketplace.
On te donne : l'objectif du workflow, ses critères de réussite, ses contraintes, garde-fous, ton du vendeur et outils autorisés,
puis le contexte live de son bureau (texte OCR Screenpipe des dernières minutes : ce qui est à l'écran dans Chrome).
Prépare le plan d'exécution
concret pour CETTE occurrence. Réponds UNIQUEMENT avec un objet JSON :
{
 "summary": "une phrase : ce que tu vas faire maintenant",
 "situation": "what you understand from the screen (unread messages, favourites, listings…), in English, or 'insufficient context'",
 "actions": [
   {"tool": "<outil du catalogue>", "args": {"...": "..."}, "preview": "exact text of the message/offer if the action sends one, in the seller's tone and the buyer's language", "needs_approval": true, "target_text": "exact visible label to click", "input_text": "text to type after the click, else empty string", "submit": false}
 ],
 "risks": ["ce qui pourrait mal se passer"],
 "ask_user": "question for the seller (English) if information is missing, else empty string"
}
Catalogue d'outils : %s. Max 5 actions. Indique target_text uniquement si le libellé est visible dans l'OCR.
Toute action qui envoie un message, une offre ou modifie un prix a needs_approval=true. Respecte les garde-fous
(floor price, etc.). Messages to buyers are written in the buyer's language, short, without inventing details about the item; everything addressed to the seller is in English.""" % ", ".join(TEACH_TOOLS)


def _fallback_plan(workflow: dict[str, Any]) -> dict[str, Any]:
    return {
        "summary": f"Open {workflow['marketplace']} and walk through “{workflow['title']}” with you",
        "situation": "contexte insuffisant (agent indisponible)",
        "actions": [{"tool": "list_unread_messages", "args": {"marketplace": workflow["marketplace"]}, "preview": "", "needs_approval": False}],
        "risks": ["Fallback plan: the agent could not analyse the screen"],
        "ask_user": "",
    }


@app.get("/v1/workflows/runs")
async def list_runs(workflow_id: str | None = None, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        if workflow_id:
            rows = conn.execute(
                "SELECT * FROM workflow_runs WHERE workspace=? AND workflow_id=? ORDER BY created_at DESC LIMIT 20",
                (user["workspace"], workflow_id),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM workflow_runs WHERE workspace=? ORDER BY created_at DESC LIMIT 20", (user["workspace"],)
            ).fetchall()
    return {"runs": [_run_dict(row) for row in rows]}


@app.post("/v1/workflows/{workflow_id}/run")
async def run_workflow(workflow_id: str, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        row = conn.execute(
            "SELECT * FROM workflows WHERE workspace=? AND id=?", (user["workspace"], workflow_id)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Workflow not found")
        workflow = _workflow_dict(row)
        run_id = f"r-{uuid.uuid4().hex[:8]}"
        conn.execute(
            "INSERT INTO workflow_runs (id, workspace, created_by, workflow_id, status) VALUES (?, ?, ?, ?, 'planning')",
            (run_id, user["workspace"], user["user_id"], workflow_id),
        )
    if workflow.get("source") == INBOX_AUTOPILOT_SOURCE:
        # "Check inbox now": an immediate Screenpipe-first pass of the A4000 inbox monitor for this marketplace
        detail, ok = "Desktop not configured", False
        if _desktop_enabled():
            try:
                out = await _gate_json("/inbox/run", {"marketplace": workflow["marketplace"]}, timeout=30, workspace=user["workspace"])
                ok = bool(out.get("ok"))
                detail = (f"Inbox check started on the desktop for {workflow['marketplace']}: Screenpipe reads the Messages tab, "
                          "Hermes replies to new buyer messages (approval cards in the chat above the discount limit)."
                          if ok else str(out.get("error") or out.get("detail") or "failed"))
            except Exception as e:
                detail = f"Desktop unreachable ({type(e).__name__})"
        entry = {"tool": "list_unread_messages", "result": "assisted" if ok else "error", "t": _iso_now(), "detail": detail}
        with db.connection() as conn:
            conn.execute(
                "UPDATE workflow_runs SET status=?, log_json=?, error=?, updated_at=? WHERE workspace=? AND id=?",
                ("executed" if ok else "failed", json.dumps([entry], ensure_ascii=False), None if ok else detail, _iso_now(),
                 user["workspace"], run_id),
            )
            run = _run_row(conn, user["workspace"], run_id)
        return {"run": _run_dict(run), "workflow": workflow}
    context: dict[str, Any] = {"frames": 0, "events": [], "windows": []}
    error = None
    if _screenpipe_enabled() and db.desktop_lease_held(user["workspace"]):
        try:
            end = datetime.now(timezone.utc)
            context = await _screenpipe_events(
                (end - timedelta(minutes=3)).strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")
            )
        except (httpx.HTTPError, ValueError) as e:
            error = f"Screenpipe indisponible ({type(e).__name__})"
    lines = [
        f"Workflow « {workflow['title']} » ({workflow['marketplace']})",
        "Steps: " + " / ".join(workflow["steps"]),
    ]
    intent = workflow.get("intent") or {}
    allowed_tools = [item.get("tool") for item in workflow.get("tools", []) if isinstance(item, dict) and item.get("tool")]
    lines.extend([
        f"Goal: {intent.get('goal') or 'not specified'}",
        f"Success criteria: {intent.get('success_criteria') or 'not specified'}",
        "Constraints: " + (" / ".join(intent.get("constraints", [])) or "none specified"),
        "Guardrails: " + (" / ".join(workflow.get("guardrails") or []) or "none specified"),
        f"Seller tone: {workflow.get('toneNotes') or 'not specified'}",
        "Allowed tools for this workflow: " + (", ".join(allowed_tools) or "no tool declared"),
        "",
        f"Live desktop context ({context.get('frames', 0)} Screenpipe frames, last 3 minutes):",
    ])
    for event in context.get("events", [])[:30]:
        lines.append(f"- [{event['t'][11:19]}] {event['window'][:80]} :: {event['text'][:400]}")
    plan, via = await _llm_json(_RUN_SYSTEM, "\n".join(lines)[:14000], f"octohandy-run-{user['user_id']}")
    if not plan or not isinstance(plan.get("actions"), list):
        plan, via = _fallback_plan(workflow), "fallback"
    plan["actions"] = [
        {
            "tool": action.get("tool"), "args": action.get("args") or {},
            "preview": str(action.get("preview") or "")[:1500],
            "needs_approval": bool(action.get("needs_approval", True))
            or action.get("tool") in {"send_message", "send_offer", "update_price"},
            "target_text": str(action.get("target_text") or "")[:240],
            "input_text": str(action.get("input_text") or "")[:1500],
            "submit": bool(action.get("submit", False)),
        }
        for action in plan["actions"] if isinstance(action, dict) and action.get("tool") in TEACH_TOOLS
    ][:5]
    plan["via"] = via
    plan.setdefault("risks", [])
    plan.setdefault("ask_user", "")
    plan.setdefault("situation", "")
    with db.connection() as conn:
        conn.execute(
            """UPDATE workflow_runs SET status='awaiting_approval', context_json=?, plan_json=?, error=?, updated_at=?
               WHERE workspace=? AND id=?""",
            (json.dumps({"frames": context.get("frames", 0), "windows": context.get("windows", [])[:10]}, ensure_ascii=False),
             json.dumps(plan, ensure_ascii=False), error, _iso_now(), user["workspace"], run_id),
        )
        run = _run_row(conn, user["workspace"], run_id)
    return {"run": _run_dict(run), "workflow": workflow}


class RunDecisionIn(BaseModel):
    approved_indexes: list[int] | None = None
    mode: Literal["assisted", "auto_click"] = "assisted"


async def _screen_excerpt() -> str:
    try:
        frame_id = await latest_frame_id()
    except ScreenpipeFrameStaleError:
        return "Screenpipe screen not up to date"
    if frame_id is None:
        return ""
    elements = await frame_elements(frame_id)
    texts = list(dict.fromkeys(str(item.get("text") or "").strip() for item in elements if item.get("text")))
    return " · ".join(texts)[:320]


def _workflow_human_profile(row: Any, user_id: str) -> HumanProfile:
    fallback = from_trace(user_id, {"events": []})
    try:
        stored = json.loads(row["human_profile_json"] or "{}")
        return HumanProfile(
            seed=int(stored.get("seed", fallback.seed)),
            pace=float(stored.get("pace", fallback.pace)),
            type_wpm=float(stored.get("type_wpm", fallback.type_wpm)),
            jitter=float(stored.get("jitter", fallback.jitter)),
            overshoot_chance=float(stored.get("overshoot_chance", fallback.overshoot_chance)),
            typo_chance=min(0.03, max(0.0, float(stored.get("typo_chance", fallback.typo_chance)))),
        )
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback


async def _type_human_text(
    desktop: RemoteDesktop,
    text: str,
    rng: random.Random,
    profile: HumanProfile,
) -> None:
    delays = key_delays(text, rng, profile)
    index = 0
    for char, correct in typos(text, rng, profile):
        if not correct:
            await desktop.type_text(char)
            await asyncio.sleep(rng.uniform(0.06, 0.14))
            backspace = keysym_for_key("BackSpace")
            await desktop.key(backspace, True)
            await desktop.key(backspace, False)
            continue
        await desktop.type_text(char)
        await asyncio.sleep(delays[index])
        index += 1


def _persist_run_progress(workspace: str, run_id: str, log: list[dict[str, Any]]) -> None:
    with db.connection() as conn:
        conn.execute(
            "UPDATE workflow_runs SET log_json=?, updated_at=? WHERE workspace=? AND id=?",
            (json.dumps(log, ensure_ascii=False), _iso_now(), workspace, run_id),
        )


def _finish_workflow_run(
    workspace: str,
    run_id: str,
    status: str,
    log: list[dict[str, Any]],
    error: str | None = None,
) -> None:
    with db.connection() as conn:
        conn.execute(
            "UPDATE workflow_runs SET status=?, log_json=?, error=?, updated_at=? WHERE workspace=? AND id=?",
            (status, json.dumps(log, ensure_ascii=False), error, _iso_now(), workspace, run_id),
        )


def _execution_error(exc: BaseException) -> str:
    detail = str(exc).strip() or type(exc).__name__
    return f"Run failed: {detail[:400]}"


async def _execute_run_actions(
    run_id: str,
    workspace: str,
    user: dict[str, Any],
    workflow: dict[str, Any] | None,
    plan: dict[str, Any],
    approved_indexes: list[int] | None,
    mode: Literal["assisted", "auto_click"],
    log: list[dict[str, Any]],
) -> None:
    marketplace = workflow["marketplace"] if workflow else "vinted"
    opened_pages: set[str] = set()
    desktop: RemoteDesktop | None = None
    desktop_attempted = False
    desktop_error: str | None = None
    profile = _workflow_human_profile(workflow, user["user_id"]) if workflow else from_trace(user["user_id"], {"events": []})
    rng = random.Random(f"{profile.seed}:{run_id}")

    def record(entry: dict[str, Any]) -> None:
        log.append(entry)
        if mode == "auto_click":
            _persist_run_progress(workspace, run_id, log)

    try:
        for index, action in enumerate(plan.get("actions", [])):
            tool = action["tool"]
            if approved_indexes is not None and index not in approved_indexes:
                record({"t": _iso_now(), "tool": tool, "result": "skipped", "detail": "not approved"})
                continue
            if mode == "auto_click":
                try:
                    _acquire_desktop_lease(user, marketplace, settings.desktop_session_ttl)
                except HTTPException as exc:
                    record({
                        "t": _iso_now(), "tool": tool, "result": "failed",
                        "detail": str(exc.detail),
                    })
                    break
            if not db.desktop_lease_held(workspace):
                record({
                    "t": _iso_now(), "tool": tool, "result": "failed",
                    "detail": "desktop reservation expired; no action performed",
                })
                if mode == "auto_click":
                    break
                continue
            page = (
                INBOX_URLS.get(marketplace) if tool in _MESSAGE_TOOLS
                else LISTINGS_URLS.get(marketplace) if tool in _LISTING_TOOLS
                else None
            )
            if mode == "auto_click" and page is None:
                page = _marketplace_start_url(marketplace)
            details: list[str] = []
            page_ok = True
            if page and page not in opened_pages and _desktop_enabled():
                opened_pages.add(page)
                page_ok = await _desktop_open(page)
                details.append(f"page ouverte dans le Chrome du bureau : {page}" if page_ok else "ouverture de page impossible")

            if mode == "assisted":
                ok = page_ok
                if action.get("preview") and _desktop_enabled():
                    copied = await _desktop_clipboard(action["preview"])
                    details.append("message ready in the desktop clipboard" if copied else "clipboard unavailable")
                    ok = ok and copied
                if tool == "notify_seller":
                    details.append("notification shown in the log")
                if tool == "wait_for_event":
                    details.append("automatic trigger to configure")
                record({
                    "t": _iso_now(), "tool": tool, "args": action.get("args", {}),
                    "preview": action.get("preview", ""), "result": "assisted" if ok else "partial",
                    "detail": " · ".join(details) or "aucune action sur le bureau",
                })
                continue

            target_text = str(action.get("target_text") or "").strip()
            entry: dict[str, Any] = {
                "t": _iso_now(), "tool": tool, "args": action.get("args", {}),
                "preview": action.get("preview", ""), "searched": target_text,
                "matched": None, "confidence": None, "coordinates": None, "evidence": "",
            }
            if not page_ok:
                entry.update(result="failed", outcome="ouverture de page impossible", detail="ouverture de page impossible")
                record(entry)
                continue
            if not target_text:
                entry.update(result="failed", outcome="target not specified in the plan", detail="target not specified in the plan")
                record(entry)
                continue
            if not desktop_attempted:
                desktop_attempted = True
                try:
                    desktop = RemoteDesktop(workspace, marketplace, settings.desktop_session_ttl)
                    await desktop.connect()
                except DesktopInputError as exc:
                    desktop_error = str(exc)
                    desktop = None
            if desktop is None:
                outcome = desktop_error or "connexion RFB indisponible"
                entry.update(result="failed", outcome=outcome, detail=outcome)
                record(entry)
                continue

            await asyncio.sleep(pre_action_delay(rng, profile))
            try:
                target = await find_target(target_text, screen_size=(desktop.width, desktop.height))
            except ScreenpipeFrameStaleError:
                entry.update(result="failed", outcome=SCREENPIPE_STALE_OUTCOME, detail=SCREENPIPE_STALE_OUTCOME)
                record(entry)
                continue
            if target is None:
                entry.update(
                    result="failed", outcome="target not found on screen",
                    detail="target not found on screen",
                )
                record(entry)
                continue
            entry["matched"] = target["text"]
            entry["confidence"] = target["confidence"]
            point = click_point(target["bounds_px"], rng)
            entry["coordinates"] = {"x": point[0], "y": point[1]}
            clicked = False
            try:
                path = move_path((desktop._x, desktop._y), point, rng, profile)
                for x, y, delay in path:
                    await asyncio.sleep(delay)
                    await desktop.move(round(x), round(y))
                await desktop.click(*point, rng=rng)
                clicked = True
                if action.get("input_text"):
                    await _type_human_text(desktop, action["input_text"], rng, profile)
                if action.get("submit"):
                    enter = keysym_for_key("Enter")
                    await desktop.key(enter, True)
                    await desktop.key(enter, False)
                await asyncio.sleep(rng.uniform(1.5, 3.0))
                entry["evidence"] = await _screen_excerpt()
                entry.update(result="clicked", outcome="click executed", detail=" · ".join(details) or "click executed")
            except DesktopInputError as exc:
                entry.update(result="partial" if clicked else "failed", outcome=str(exc), detail=str(exc))
                if clicked:
                    await asyncio.sleep(rng.uniform(1.5, 3.0))
                    entry["evidence"] = await _screen_excerpt()
            record(entry)
    finally:
        if desktop is not None:
            await desktop.close()


async def _run_auto_click_background(
    run_id: str,
    workspace: str,
    user: dict[str, Any],
    workflow: dict[str, Any] | None,
    plan: dict[str, Any],
    approved_indexes: list[int] | None,
) -> None:
    log: list[dict[str, Any]] = []
    try:
        await _execute_run_actions(
            run_id, workspace, user, workflow, plan, approved_indexes, "auto_click", log
        )
        _finish_workflow_run(workspace, run_id, "executed", log)
    except asyncio.CancelledError:
        error = "Run interrupted before completion."
        log.append({"t": _iso_now(), "tool": "execution", "result": "failed", "detail": error})
        _finish_workflow_run(workspace, run_id, "failed", log, error)
    except Exception as exc:
        error = _execution_error(exc)
        log.append({"t": _iso_now(), "tool": "execution", "result": "failed", "detail": error})
        _finish_workflow_run(workspace, run_id, "failed", log, error)


@app.post("/v1/workflows/runs/{run_id}/approve")
async def approve_run(run_id: str, body: RunDecisionIn, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        run = _run_row(conn, user["workspace"], run_id)
        if run["status"] != "awaiting_approval":
            raise HTTPException(409, "This run no longer awaits approval")
        workflow_row = conn.execute(
            "SELECT * FROM workflows WHERE workspace=? AND id=?", (user["workspace"], run["workflow_id"])
        ).fetchone()
        workflow = dict(workflow_row) if workflow_row else None
        plan = json.loads(run["plan_json"] or "{}")
        actions = plan.get("actions", [])
        approved = [action for index, action in enumerate(actions) if body.approved_indexes is None or index in body.approved_indexes]
        if body.mode == "auto_click" and approved and not db.desktop_lease_held(user["workspace"]):
            raise HTTPException(409, "Reserve the remote desktop before launching the clicks.")
        conn.execute(
            "UPDATE workflow_runs SET status='executing', mode=?, updated_at=? WHERE workspace=? AND id=?",
            (body.mode, _iso_now(), user["workspace"], run_id),
        )
    log: list[dict[str, Any]] = []
    if body.mode == "auto_click":
        try:
            task = asyncio.create_task(
                _run_auto_click_background(
                    run_id, user["workspace"], user, workflow, plan,
                    list(body.approved_indexes) if body.approved_indexes is not None else None,
                )
            )
            _run_tasks.add(task)
            task.add_done_callback(_run_tasks.discard)
        except Exception as exc:
            error = _execution_error(exc)
            log.append({"t": _iso_now(), "tool": "execution", "result": "failed", "detail": error})
            _finish_workflow_run(user["workspace"], run_id, "failed", log, error)
    else:
        try:
            await _execute_run_actions(
                run_id, user["workspace"], user, workflow, plan,
                list(body.approved_indexes) if body.approved_indexes is not None else None,
                "assisted", log,
            )
            _finish_workflow_run(user["workspace"], run_id, "executed", log)
        except Exception as exc:
            error = _execution_error(exc)
            log.append({"t": _iso_now(), "tool": "execution", "result": "failed", "detail": error})
            _finish_workflow_run(user["workspace"], run_id, "failed", log, error)
    with db.connection() as conn:
        run = _run_row(conn, user["workspace"], run_id)
    return {"run": _run_dict(run)}


@app.post("/v1/workflows/runs/{run_id}/reject")
async def reject_run(run_id: str, user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        _run_row(conn, user["workspace"], run_id)
        conn.execute("UPDATE workflow_runs SET status='rejected', updated_at=? WHERE workspace=? AND id=?",
                     (_iso_now(), user["workspace"], run_id))
        run = _run_row(conn, user["workspace"], run_id)
    return {"run": _run_dict(run)}


# ---------------------------------------------------------------------------
# Desktop status (A4000 health seen from the backend) + "eyes" for the chat.

async def _screen_context(workspace: str | None = None, minutes: int = 2) -> str:
    """What is on the remote desktop screen right now (Screenpipe OCR), for Hermes."""
    if not workspace or not db.desktop_lease_held(workspace) or not _screenpipe_enabled():
        return ""
    try:
        end = datetime.now(timezone.utc)
        trace = await _screenpipe_events(
            (end - timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")
        )
    except (httpx.HTTPError, ValueError):
        return ""
    events = trace.get("events", [])
    if not events:
        return ""
    lines = [f"- [{e['t'][11:19]}] {e['window'][:80]} :: {e['text'][:350]}" for e in events[-8:]]
    return (
        "\n\nOctoHandy desktop screen (remote Chrome, Screenpipe OCR of the last 2 minutes, oldest to "
        "newest). Use it when the user talks about what they see, their messages, favourites or listings:\n"
        + "\n".join(lines)
    )


@app.get("/v1/desktop/status")
async def desktop_status_live(user: dict[str, Any] = Depends(workspace_user)):
    base = settings.desktop_base_url.rstrip("/")
    result: dict[str, Any] = {
        "enabled": _desktop_enabled(), "host": settings.desktop_base_url or None,
        "gate": False, "screenpipe": None, "hermes": False, "screen": None, "checkedAt": _iso_now(),
    }
    if not _desktop_enabled():
        return result

    async def gate(client: httpx.AsyncClient) -> None:
        try:
            response = await client.get(f"{base}/desktop/health")
            result["gate"] = response.status_code == 200
        except httpx.HTTPError:
            pass

    async def screenpipe(client: httpx.AsyncClient) -> None:
        if not _screenpipe_enabled():
            return
        headers = {"Authorization": f"Bearer {settings.screenpipe_api_key}"}
        try:
            health = await client.get(f"{settings.screenpipe_api_url.rstrip('/')}/health", headers=headers)
            status = str(health.json().get("status") or "unknown")
            result["screenpipe"] = {"status": status, "ok": health.status_code == 200 and status == "healthy"}
            if True:
                latest = await client.get(
                    f"{settings.screenpipe_api_url.rstrip('/')}/search", headers=headers,
                    params={"content_type": "ocr", "limit": 1},
                )
                data = latest.json().get("data") or []
                if data:
                    content = data[0].get("content") or {}
                    raw = " ".join(str(content.get("text") or "").split())
                    tab = await _desktop_active_tab()
                    result["screen"] = {
                        "window": _screen_label(_guess_site(raw), tab),
                        "url": (tab or {}).get("url"),
                        "at": content.get("timestamp"),
                        "excerpt": _clean_ocr(raw, 240),
                        "raw": raw[:600],
                    }
        except (httpx.HTTPError, ValueError):
            result["screenpipe"] = result["screenpipe"] or {"status": "unreachable", "ok": False}

    async def hermes(client: httpx.AsyncClient) -> None:
        if not settings.hermes_api_key:
            return
        try:
            response = await client.get(
                f"{settings.hermes_api_url.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {settings.hermes_api_key}"},
            )
            result["hermes"] = response.status_code == 200
        except httpx.HTTPError:
            pass

    async with httpx.AsyncClient(timeout=8) as client:
        await asyncio.gather(gate(client), screenpipe(client), hermes(client))
    result["model"] = settings.nebius_model
    return result


@app.get("/v1/desktop/screen")
async def desktop_screen(minutes: int = 2, user: dict[str, Any] = Depends(workspace_user)):
    """Proof that Screenpipe sees the remote desktop: the compressed trace of the last N minutes."""
    if not _screenpipe_enabled():
        raise HTTPException(503, "Screenpipe not configured")
    minutes = max(1, min(minutes, 30))
    end = datetime.now(timezone.utc)
    try:
        trace = await _screenpipe_events(
            (end - timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")
        )
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(502, f"Screenpipe injoignable ({type(e).__name__})")
    events = await _describe_screen_events(trace["events"][-12:])
    return {"minutes": minutes, "frames": trace["frames"], "windows": trace["windows"], "events": events, "checkedAt": _iso_now()}


class ClipboardIn(BaseModel):
    text: str


@app.get("/v1/desktop/clipboard")
async def desktop_clipboard_get(user: dict[str, Any] = Depends(workspace_user)):
    """Presse-papiers du bureau distant → PC (noVNC ne le synchronise pas)."""
    if not _desktop_enabled():
        raise HTTPException(503, "Desktop not configured")
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                f"{settings.desktop_base_url.rstrip('/')}/desktop/clipboard",
                headers={"X-Gate-Secret": settings.desktop_signing_secret},
            )
        return {"text": response.json().get("text", "")}
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(502, f"Bureau indisponible ({type(e).__name__})")


@app.post("/v1/desktop/clipboard")
async def desktop_clipboard_set(body: ClipboardIn, user: dict[str, Any] = Depends(workspace_user)):
    """PC → presse-papiers du bureau distant (Ctrl+V dans le Chrome du bureau)."""
    if not _desktop_enabled():
        raise HTTPException(503, "Desktop not configured")
    if not await _desktop_clipboard(body.text[:20000]):
        raise HTTPException(502, "Bureau indisponible")
    return {"ok": True}


class LoginIn(BaseModel):
    password: str


@app.post("/v1/auth/login")
async def auth_login(body: LoginIn):
    """Mono-user access: password checked here (Hetzner .env), returns the signed app token the web app stores as cookie."""
    want = settings.app_access_password.strip()
    if not want or not settings.app_session_secret:
        raise HTTPException(503, "Access not configured on the server (APP_ACCESS_PASSWORD / APP_SESSION_SECRET)")
    got = body.password.strip()
    if not hmac.compare_digest(got.encode(), want.encode()):
        raise HTTPException(401, "Mot de passe incorrect")
    exp = str(int(time.time()) + 30 * 24 * 3600)
    sig = hmac.new(settings.app_session_secret.encode(), exp.encode(), hashlib.sha256).hexdigest()
    return {"token": f"oh.{exp}.{sig}", "expiresAt": int(exp), "email": settings.app_user_email}


@app.get("/v1/auth/me")
async def auth_me(user: dict[str, Any] = Depends(require_user)):
    return {"userId": user["user_id"], "email": (user.get("claims") or {}).get("email") or settings.app_user_email, "via": user.get("via")}


# ---------------------------------------------------------------------------
# Real shops: sync accounts + listings from the logged-in desktop Chrome (A4000 gate /sync),
# download listing images through the desktop proxy and serve them from here (like Comie).
# ---------------------------------------------------------------------------
SYNC_MARKETPLACES = ("vinted", "ebay", "leboncoin", "etsy")
MOCK_SHOP_IDS = ("s1", "s2")


def _media_path(workspace: str, listing_id: str) -> Path:
    key = hashlib.sha1(f"{settings.desktop_signing_secret}|{workspace}|{listing_id}".encode()).hexdigest()[:24]
    return Path(settings.media_dir) / f"{key}.jpg"


async def _gate_json(path: str, body: dict[str, Any], timeout: float = 150, workspace: str = "") -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(f"{settings.desktop_base_url.rstrip('/')}/desktop{path}",
                                     headers={"X-Gate-Secret": settings.desktop_signing_secret, **({"X-Workspace": workspace} if workspace else {})}, json=body)
    response.raise_for_status()
    return response.json()


async def _store_listing_image(workspace: str, listing: dict[str, Any]) -> str | None:
    src = listing.get("imageUrl")
    if not src or not str(src).startswith("https://"):
        return None
    dest = _media_path(workspace, listing["id"])
    if not dest.exists():
        try:
            async with httpx.AsyncClient(timeout=40) as client:
                response = await client.get(f"{settings.desktop_base_url.rstrip('/')}/desktop/image",
                                            headers={"X-Gate-Secret": settings.desktop_signing_secret},
                                            params={"url": src, "referer": listing.get("url") or ""})
            if response.status_code != 200 or len(response.content) < 200:
                return None
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(response.content)
        except httpx.HTTPError:
            return None
    return f"/v1/media/{dest.stem}.jpg"


class ShopsSyncIn(BaseModel):
    marketplaces: list[str] | None = None


INBOX_AUTOPILOT_SOURCE = "inbox-autopilot"
INBOX_AUTOPILOT_LABEL = {"vinted": "Vinted", "ebay": "eBay", "leboncoin": "Leboncoin", "etsy": "Etsy"}


def _ensure_inbox_autopilot(conn, workspace: str, user_id: str, marketplace: str) -> None:
    """One default-enabled "Inbox autopilot" workflow per connected marketplace. Its Enable/Disable switch is what
    the A4000 inbox monitor obeys (see /v1/agent/policy → inboxAutopilot)."""
    if marketplace not in SYNC_MARKETPLACES:
        return
    row = conn.execute("SELECT id FROM workflows WHERE workspace=? AND marketplace=? AND source=? LIMIT 1",
                       (workspace, marketplace, INBOX_AUTOPILOT_SOURCE)).fetchone()
    if row is not None:
        return
    label = INBOX_AUTOPILOT_LABEL.get(marketplace, marketplace.capitalize())
    steps = [
        f"A {label} notification e-mail arrives (or every 2 minutes) → the agent checks the {label} Messages tab, kept open on the desktop",
        "Screenpipe reads the inbox from the screen first; Hermes is only woken up when a new buyer message appears (0 tokens otherwise)",
        "The agent reads the conversation and writes a reply in the buyer's language (price, size, shipping, availability)",
        "Discount requests up to the limit set in Settings are accepted and sent; above the limit an approval card is posted in the chat",
        "The reply is typed and sent from the desktop; a \"Reply sent\" card appears in the chat",
    ]
    conn.execute(
        """INSERT INTO workflows (id, workspace, created_by, marketplace, title, steps_json, tone, source, enabled, "trigger",
                                  intent_json, guardrails_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)""",
        (f"w-{uuid.uuid4().hex[:8]}", workspace, user_id, marketplace, f"Inbox autopilot {label}: auto-reply to buyers",
         json.dumps(steps, ensure_ascii=False), "teal", INBOX_AUTOPILOT_SOURCE,
         f"{label} notification e-mail (Gmail) or every 2 minutes, via Screenpipe",
         json.dumps({"goal": f"Answer every {label} buyer within minutes, 24/7, without the seller",
                     "success_criteria": "Each new buyer message gets a reply or an approval request in the chat"}, ensure_ascii=False),
         json.dumps(["Never sends a payment, deletion or price change", "Discounts above the Settings limit need the seller's approval",
                     "Disputes, refunds and out-of-scope requests are escalated to the chat"], ensure_ascii=False)),
    )


def _inbox_autopilot_state(conn, workspace: str) -> dict[str, bool]:
    rows = conn.execute("SELECT marketplace, enabled FROM workflows WHERE workspace=? AND source=?",
                        (workspace, INBOX_AUTOPILOT_SOURCE)).fetchall()
    return {r["marketplace"]: bool(r["enabled"]) for r in rows}


async def _sync_shops_after_agent(user: dict[str, Any]) -> None:
    """After an agent action on the desktop, re-read the connected marketplaces so new listings show up in Shops."""
    try:
        await asyncio.sleep(5)
        await shops_sync(ShopsSyncIn(), user)
    except Exception:
        pass


@app.post("/v1/shops/sync")
async def shops_sync(body: ShopsSyncIn, user: dict[str, Any] = Depends(workspace_user)):
    """Replace the demo data with the seller's real accounts/listings read from the remote desktop Chrome."""
    if not _desktop_enabled():
        raise HTTPException(503, "Desktop not configured")
    wanted = [m for m in (body.marketplaces or SYNC_MARKETPLACES) if m in SYNC_MARKETPLACES]
    report: list[dict[str, Any]] = []
    for marketplace in wanted:
        try:
            data = await _gate_json("/sync", {"marketplace": marketplace}, workspace=user["workspace"])
        except (httpx.HTTPError, ValueError) as e:
            report.append({"marketplace": marketplace, "ok": False, "error": f"bureau injoignable ({type(e).__name__})"})
            continue
        if not data.get("ok"):
            report.append({"marketplace": marketplace, "ok": False, "error": data.get("error") or "failed"})
            continue
        account = data.get("account") or {}
        listings = data.get("listings") or []
        with db.connection() as conn:
            row = conn.execute("SELECT * FROM shops WHERE workspace=? AND marketplace=? AND id NOT IN (?, ?) ORDER BY created_at LIMIT 1",
                               (user["workspace"], marketplace, *MOCK_SHOP_IDS)).fetchone()
            status = "connected" if data.get("loggedIn") else "expired"
            name = account.get("username") or (row["display_name"] if row else marketplace.capitalize())
            if row is None:
                shop_id = f"s-{uuid.uuid4().hex[:8]}"
                conn.execute("""INSERT INTO shops (id, workspace, created_by, marketplace, display_name, status, listing_count)
                                VALUES (?, ?, ?, ?, ?, ?, ?)""", (shop_id, user["workspace"], user["user_id"], marketplace, name, status, len(listings)))
            else:
                shop_id = row["id"]
                conn.execute("UPDATE shops SET display_name=?, status=?, listing_count=?, updated_at=? WHERE workspace=? AND id=?",
                             (name, status, len(listings), _iso_now(), user["workspace"], shop_id))
            if data.get("loggedIn"):
                _ensure_inbox_autopilot(conn, user["workspace"], user["user_id"], marketplace)
                # real data replaces the demo shops/listings for this workspace
                conn.execute("DELETE FROM listings WHERE workspace=? AND shop_id IN (?, ?)", (user["workspace"], *MOCK_SHOP_IDS))
                conn.execute("DELETE FROM shops WHERE workspace=? AND id IN (?, ?)", (user["workspace"], *MOCK_SHOP_IDS))
                conn.execute("DELETE FROM listings WHERE workspace=? AND shop_id=?", (user["workspace"], shop_id))
        images = 0
        if data.get("loggedIn"):
            for listing in listings[:120]:
                stored = await _store_listing_image(user["workspace"], listing)
                if stored:
                    images += 1
                with db.connection() as conn:
                    conn.execute("""INSERT INTO listings (id, workspace, created_by, shop_id, marketplace, title, price, status, image_url, url, views, favorites, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    ON CONFLICT(workspace, id) DO UPDATE SET shop_id=excluded.shop_id, marketplace=excluded.marketplace,
                                      title=excluded.title, price=excluded.price, status=excluded.status, image_url=excluded.image_url,
                                      url=excluded.url, views=excluded.views, favorites=excluded.favorites, updated_at=excluded.updated_at""",
                                 (listing["id"], user["workspace"], user["user_id"], shop_id, marketplace, str(listing.get("title") or "")[:200],
                                  float(listing.get("price") or 0), listing.get("status") or "active", stored or listing.get("imageUrl"),
                                  listing.get("url"), listing.get("views"), listing.get("favorites"), _iso_now()))
        report.append({"marketplace": marketplace, "ok": True, "loggedIn": bool(data.get("loggedIn")), "username": account.get("username"),
                       "listings": len(listings) if data.get("loggedIn") else 0, "images": images})
        events.emit("shop.synced", user["workspace"],
                    {"loggedIn": bool(data.get("loggedIn")), "listings": len(listings) if data.get("loggedIn") else 0},
                    marketplace=marketplace, user_id=user["user_id"])
    return {"report": report, "syncedAt": _iso_now()}


@app.get("/v1/media/{name}")
async def media_file(name: str):
    if not re.fullmatch(r"[0-9a-f]{24}\.jpg", name):
        raise HTTPException(404)
    path = Path(settings.media_dir) / name
    if not path.exists():
        raise HTTPException(404)
    return Response(content=path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/v1/stock")
async def list_stock(user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        rows = conn.execute(
            """SELECT s.*, p.display_name AS creator_name FROM stock s
               LEFT JOIN profiles p ON p.user_id=s.created_by
               WHERE s.workspace=? ORDER BY s.created_at, s.id""",
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
            """SELECT s.*, p.display_name AS creator_name FROM stock s
               LEFT JOIN profiles p ON p.user_id=s.created_by WHERE s.workspace=? AND s.id=?""",
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
            """SELECT s.*, p.display_name AS creator_name FROM stock s
               LEFT JOIN profiles p ON p.user_id=s.created_by WHERE s.workspace=? AND s.id=?""",
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
            """SELECT s.*, p.display_name AS creator_name FROM stock s
               LEFT JOIN profiles p ON p.user_id=s.created_by WHERE s.workspace=? AND s.id=?""",
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
        for shop in conn.execute("SELECT DISTINCT marketplace FROM shops WHERE workspace=? AND status='connected'",
                                 (user["workspace"],)).fetchall():
            _ensure_inbox_autopilot(conn, user["workspace"], user["user_id"], shop["marketplace"])
        rows = conn.execute(
            "SELECT * FROM workflows WHERE workspace=? ORDER BY created_at, id",
            (user["workspace"],),
        ).fetchall()
    return {"workflows": [_workflow_dict(row) for row in rows]}


class WorkflowCreateIn(BaseModel):
    title: str
    marketplace: str
    steps: list[str]
    tone: str | None = None
    source: str = "hermes-chat"
    enabled: bool = False


@app.post("/v1/workflows")
async def create_workflow(body: WorkflowCreateIn, user: dict[str, Any] = Depends(workspace_user)):
    steps = [step.strip() for step in body.steps if step and step.strip()][:12]
    if not steps:
        raise HTTPException(422, "The workflow needs at least one step")
    marketplace = body.marketplace.strip().lower()[:40] or "multi"
    workflow_id = f"w-{uuid.uuid4().hex[:8]}"
    with db.connection() as conn:
        conn.execute(
            """INSERT INTO workflows (id, workspace, created_by, marketplace, title, steps_json, tone, source, enabled)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (workflow_id, user["workspace"], user["user_id"], marketplace, body.title.strip()[:80] or "Workflow",
             json.dumps(steps, ensure_ascii=False), (body.tone or _WORKFLOW_TONES.get(marketplace, "blue"))[:40],
             body.source[:40], int(body.enabled)),
        )
        row = conn.execute("SELECT * FROM workflows WHERE workspace=? AND id=?", (user["workspace"], workflow_id)).fetchone()
    return {"workflow": _workflow_dict(row)}


class RunLogIn(BaseModel):
    workflowId: str
    status: Literal["done", "partial", "failed"]
    summary: str = ""
    recordingId: str | None = None
    stepsDone: list[str] = Field(default_factory=list)


@app.post("/v1/workflows/runs/log")
async def log_run(body: RunLogIn, user: dict[str, Any] = Depends(workspace_user)):
    """Journal d'une exécution faite par l'agent Hermes sur le bureau (vidéo incluse)."""
    if db.desktop_lease_held_by_other(user["workspace"]) is not None:
        raise HTTPException(409, "The desktop is in use by another team.")
    recording = body.recordingId if body.recordingId and RECORDING_ID.fullmatch(body.recordingId) else None
    log = [{"t": _iso_now(), "step": step[:300], "ok": True} for step in body.stepsDone[:20]]
    log.append({"t": _iso_now(), "step": body.summary[:2000], "ok": body.status != "failed", "kind": "summary"})
    if recording:
        log.append({"t": _iso_now(), "step": "Run video", "ok": True, "kind": "recording",
                    "recordingId": recording, "url": f"/v1/desktop/recordings/{recording}.mp4"})
    run_id = f"r-{uuid.uuid4().hex[:8]}"
    with db.connection() as conn:
        conn.execute(
            """INSERT INTO workflow_runs (id, workspace, created_by, workflow_id, status, mode, log_json, updated_at)
               VALUES (?, ?, ?, ?, ?, 'hermes-chat', ?, ?)""",
            (run_id, user["workspace"], user["user_id"], body.workflowId, body.status,
             json.dumps(log, ensure_ascii=False), _iso_now()),
        )
        run = _run_row(conn, user["workspace"], run_id)
    events.emit("desktop.run", user["workspace"],
                {"runId": run_id, "workflowId": body.workflowId, "status": body.status,
                 "steps": len(body.stepsDone), "recording": bool(recording)},
                user_id=user["user_id"])
    return {"run": _run_dict(run)}


RECORDING_ID = re.compile(r"[0-9a-f]{16}")


@app.get("/v1/desktop/recordings/{recording_id}.mp4")
async def desktop_recording(recording_id: str):
    """Vidéo d'une exécution sur le bureau A4000. L'id est un secret aléatoire de 64 bits (lien type pièce jointe)."""
    if not RECORDING_ID.fullmatch(recording_id) or not _desktop_enabled():
        raise HTTPException(404, "Video not found")
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                f"{settings.desktop_base_url.rstrip('/')}/desktop/recordings/{recording_id}.mp4",
                headers={"X-Gate-Secret": settings.desktop_signing_secret},
            )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Bureau indisponible ({type(e).__name__})") from e
    if response.status_code != 200:
        raise HTTPException(404, "Video not found")
    return Response(content=response.content, media_type="video/mp4",
                    headers={"Cache-Control": "private, max-age=86400", "Accept-Ranges": "none"})


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
    if user.get("via") == "app":
        # Mono-user access: the invite points at the shared workspace; the invitee signs in with the access password.
        org_id = user["workspace"]
        created_at = datetime.now(timezone.utc)
        token = secrets.token_urlsafe(24)
        with db.connection() as conn:
            conn.execute(
                """INSERT INTO invite_links (token, org_id, created_by, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (token, org_id, user["user_id"], created_at.isoformat(), (created_at + timedelta(days=7)).isoformat()),
            )
        return {"token": token, "path": f"/join/{token}", "expiresAt": (created_at + timedelta(days=7)).isoformat()}
    if not org_id:
        raise HTTPException(status_code=400, detail="Select an organisation")
    try:
        clerk_status, clerk_user = await _clerk_api("GET", f"/users/{user['user_id']}")
    except (HTTPException, httpx.HTTPError) as exc:
        raise HTTPException(status_code=502, detail="Could not verify OctoHandy access") from exc
    if clerk_status >= 400:
        raise HTTPException(status_code=502, detail="Could not verify OctoHandy access")
    public_metadata = clerk_user.get("public_metadata")
    if not isinstance(public_metadata, dict) or public_metadata.get("stockflow_access") is not True:
        allowed_emails = {
            email.strip().lower()
            for email in settings.poc_allowed_emails.split(",")
            if email.strip()
        }
        email_addresses = clerk_user.get("email_addresses")
        email_allowed = isinstance(email_addresses, list) and any(
            isinstance(address, dict)
            and isinstance(address.get("email_address"), str)
            and address["email_address"].strip().lower() in allowed_emails
            for address in email_addresses
        )
        if not email_allowed:
            raise HTTPException(status_code=403, detail="OctoHandy access required to invite")
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
        raise HTTPException(status_code=410, detail="This invitation link has expired")
    return dict(row)


@app.get("/v1/invites/{token}")
async def invite_info(token: str, _user: dict[str, Any] = Depends(workspace_user)):
    invite = _invite(token)
    if str(invite["org_id"]).startswith("user:"):
        return {"orgId": invite["org_id"], "orgName": f"{settings.app_user_email}'s OctoHandy team", "expiresAt": invite["expires_at"], "shared": True}
    org_name = await _organization_name(invite["org_id"])
    return {"orgId": invite["org_id"], "orgName": org_name, "expiresAt": invite["expires_at"]}


def _clerk_error_codes(payload: dict[str, Any]) -> set[str]:
    errors = payload.get("errors", [])
    if not isinstance(errors, list):
        return set()
    return {str(error.get("code")) for error in errors if isinstance(error, dict) and error.get("code")}


@app.post("/v1/invites/{token}/accept")
async def accept_invite(token: str, user: dict[str, Any] = Depends(workspace_user)):
    invite = _invite(token)
    if str(invite["org_id"]).startswith("user:"):
        if invite["org_id"] != user["workspace"]:
            raise HTTPException(status_code=403, detail="This invitation does not match your workspace")
        return {"ok": True, "orgId": invite["org_id"], "joined": True}
    if user.get("via") != "clerk":
        raise HTTPException(status_code=401, detail="Connexion Clerk requise")
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
        raise HTTPException(status_code=502, detail="Could not update OctoHandy access")
    return {"orgId": org_id}


class ChatIn(BaseModel):
    message: str = Field(min_length=1)
    images: list[str] = Field(default_factory=list)


async def _push_chat_images_to_desktop(workspace: str, images: list[str]) -> list[str]:
    """Chat attachments (data URLs or https) are stored under media_dir and copied to the A4000 so the
    agent can attach them to a listing with desktop_upload_files. Returns the desktop file paths."""
    if not _desktop_enabled():
        return []
    paths: list[str] = []
    for idx, src in enumerate(images):
        raw: bytes | None = None
        mime = "image/jpeg"
        try:
            if src.startswith("data:image/"):
                header, _, b64 = src.partition(",")
                mime = header[5:].split(";")[0] or mime
                raw = base64.b64decode(b64)
            elif src.startswith("https://"):
                async with httpx.AsyncClient(timeout=30) as client:
                    r = await client.get(src)
                    if r.status_code == 200:
                        raw, mime = r.content, r.headers.get("content-type", mime).split(";")[0]
        except Exception:
            raw = None
        if not raw or len(raw) < 100 or len(raw) > 15_000_000:
            continue
        ext = {"image/png": "png", "image/webp": "webp", "image/gif": "gif"}.get(mime, "jpg")
        name = f"chat-{hashlib.sha1(raw).hexdigest()[:12]}.{ext}"
        try:
            dest = Path(settings.media_dir) / "chat"
            dest.mkdir(parents=True, exist_ok=True)
            (dest / name).write_bytes(raw)
        except Exception:
            pass
        try:
            out = await _gate_json("/files/put", {"name": name, "b64": base64.b64encode(raw).decode()}, timeout=60, workspace=workspace)
            if out.get("ok") and out.get("path"):
                paths.append(out["path"])
        except Exception:
            continue
    return paths


async def _chat_response(body: ChatIn, user: dict[str, Any], system: str) -> dict[str, Any]:
    """Chat via Hermes, then Nebius Token Factory (DeepSeek), or a mock response."""
    hermes_user_content: Any = body.message
    hermes_text = body.message
    if body.images:
        desktop_paths = await _push_chat_images_to_desktop(user["workspace"], body.images[:8])
        if desktop_paths:
            hermes_text = (
                body.message
                + "\n\n[Photos attached by the seller — already copied onto the desktop as files: "
                + ", ".join(desktop_paths)
                + ". To put them in a listing use desktop_upload_files(paths=[...]) on the photo input "
                  "(never try to download them or use the file picker dialog).]"
            )
    if body.images:
        hermes_user_content = [
            {"type": "text", "text": hermes_text},
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
        # Devin-style proof: the desktop is recorded for the whole request; the video is attached to the
        # answer when the agent actually spent time on the desktop (short text-only answers drop it).
        recording_id: str | None = None
        if _desktop_enabled():
            try:
                started = await _gate_json("/record/start", {"label": body.message[:120]}, timeout=10, workspace=user["workspace"])
                recording_id = started.get("id") if started.get("ok") else None
            except Exception:
                recording_id = None
        try:
            async with httpx.AsyncClient(timeout=settings.hermes_timeout) as client:
                response = await client.post(
                    f"{settings.hermes_api_url.rstrip('/')}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.hermes_api_key}",
                        "X-Hermes-Session-Key": _chat_session_key(user["user_id"]),
                    },
                    json={
                        "model": settings.hermes_model,
                        "messages": hermes_messages,
                        "stream": False,
                    },
                )
            if recording_id and response.status_code >= 400:
                try:
                    await _gate_json("/record/stop", {"id": recording_id}, timeout=20)
                except Exception:
                    pass
            if response.status_code >= 400:
                hermes_error = f"Hermes returned HTTP {response.status_code}"
            else:
                choice = response.json()["choices"][0]
                finish_reason = choice.get("finish_reason")
                if finish_reason in ("error", "cancelled"):
                    hermes_error = f"Hermes finish_reason: {finish_reason}"
                else:
                    content = choice["message"]["content"]
                    if recording_id:
                        try:
                            stopped = await _gate_json("/record/stop", {"id": recording_id}, timeout=20)
                            recording_id = None
                            if stopped.get("ok") and float(stopped.get("durationSec") or 0) >= 20:
                                if ".mp4" not in content:
                                    content += f"\n\nhttps://octohandy.amirelay.com/backend/v1/desktop/recordings/{stopped['id']}.mp4"
                                # the agent worked on the desktop (e.g. published a listing): refresh the shops in the background
                                asyncio.create_task(_sync_shops_after_agent(user))
                        except Exception:
                            pass
                    return {
                        "role": "assistant",
                        "content": content,
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
            "content": f"Got your message: “{body.message[:200]}”. The agent is not configured on this server.",
            "model": "mock",
        }
        if hermes_error:
            result["hermesError"] = hermes_error
        return result

    nebius_user_content: Any = body.message
    if body.images:
        nebius_user_content = [
            {"type": "text", "text": body.message},
            *[{"type": "text", "text": f"[attached image: {u[:80]}]"} for u in body.images[:4]],
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


def _chat_session_key(user_id: str) -> str:
    """Hermes conversation key; bumping chatEpoch (reset button) starts a fresh conversation on the agent side."""
    epoch = int((_profile(user_id).get("preferences") or {}).get("chatEpoch") or 0)
    return f"stockflow-{user_id}" + (f"-{epoch}" if epoch else "")


@app.post("/v1/chat/reset")
async def chat_reset(user: dict[str, Any] = Depends(workspace_user)):
    profile = _profile(user["user_id"])
    prefs = dict(profile.get("preferences") or {})
    prefs["chatEpoch"] = int(prefs.get("chatEpoch") or 0) + 1
    with db.connection() as conn:
        conn.execute("UPDATE profiles SET preferences = ?, updated_at = ? WHERE user_id = ?",
                     (json.dumps(prefs, ensure_ascii=False, separators=(",", ":")), _iso_now(), user["user_id"]))
    return {"ok": True, "chatEpoch": prefs["chatEpoch"]}


@app.post("/v1/chat")
async def chat(body: ChatIn, user: dict[str, Any] = Depends(workspace_user)):
    workspace = user["workspace"]
    lease_id = None
    busy_seconds = None
    if not db.desktop_lease_held(workspace):
        lease_id, busy_seconds = db.acquire_desktop_lease(
            workspace,
            user["user_id"],
            None,
            int(settings.hermes_timeout + 60),
        )
    try:
        system = _build_chat_system_prompt() + await _chat_context(user) + await _screen_context(workspace)
        if busy_seconds is not None:
            minutes = max(1, (busy_seconds + 59) // 60)
            system += (
                "\n\nThe OctoHandy desktop is currently in use by another team: "
                "do not start any action or workflow on the desktop, do not create a run. "
                f"Tell the user the desktop is busy and they can retry in about {minutes} minute(s)."
            )
        started = time.monotonic()
        result = await _chat_response(body, user, system)
        events.emit("chat.message", workspace,
                    {"chars": len(body.message or ""), "attachments": len(getattr(body, "attachments", None) or [])},
                    user_id=user["user_id"], duration_ms=int((time.monotonic() - started) * 1000))
        return result
    finally:
        if lease_id:
            db.release_desktop_lease(workspace, lease_id)


# ---------------------------------------------------------------- Connectors (Google: Gmail / Calendar for the agent)

class GmailSendIn(BaseModel):
    to: str
    subject: str
    body: str
    replyToId: str | None = None


class CalendarEventIn(BaseModel):
    title: str
    start: str  # ISO date-time, or YYYY-MM-DD for an all-day event
    end: str | None = None
    description: str = ""
    location: str = ""


def _connector_call(fn, workspace: str, *args):
    def run():
        with db.connection() as conn:
            return fn(conn, workspace, *args)
    return asyncio.to_thread(run)


@app.get("/v1/connectors")
async def list_connectors(user: dict[str, Any] = Depends(workspace_user)):
    with db.connection() as conn:
        return {"connectors": connectors.status(conn, user["workspace"])}


@app.post("/v1/connectors/google/start")
async def connector_google_start(user: dict[str, Any] = Depends(workspace_user)):
    return {"url": connectors.auth_url(user["workspace"], user["user_id"])}


@app.get("/v1/connectors/google/callback")
async def connector_google_callback(code: str = "", state: str = "", error: str = ""):
    target = f"{settings.app_url}/dashboard/settings"
    if error or not code:
        return RedirectResponse(f"{target}?google=error&reason={error or 'no_code'}", status_code=302)
    try:
        data = connectors.verify_state(state)
        tokens = await asyncio.to_thread(connectors.exchange_code, code)
        info = await asyncio.to_thread(connectors.userinfo, tokens.get("access_token", ""))
        with db.connection() as conn:
            connectors.save_tokens(conn, data["ws"], tokens, info.get("email"))  # same thread as the connection
        events.emit("connector.connected", data["ws"], {"provider": "google", "email": info.get("email")}, user_id=data.get("u"))
    except HTTPException as e:
        return RedirectResponse(f"{target}?google=error&reason={urlencode({'': e.detail})[1:]}", status_code=302)
    return RedirectResponse(f"{target}?google=connected", status_code=302)


@app.delete("/v1/connectors/google")
async def connector_google_disconnect(user: dict[str, Any] = Depends(workspace_user)):
    removed = await _connector_call(connectors.disconnect, user["workspace"])
    if removed:
        events.emit("connector.disconnected", user["workspace"], {"provider": "google"}, user_id=user["user_id"])
    return {"ok": True, "removed": removed}


@app.get("/v1/connectors/google/gmail/search")
async def connector_gmail_search(q: str = "", limit: int = 10, user: dict[str, Any] = Depends(workspace_user)):
    return await _connector_call(connectors.gmail_search, user["workspace"], q, limit)


@app.get("/v1/connectors/google/gmail/messages/{message_id}")
async def connector_gmail_read(message_id: str, user: dict[str, Any] = Depends(workspace_user)):
    return await _connector_call(connectors.gmail_read, user["workspace"], message_id)


@app.post("/v1/connectors/google/gmail/send")
async def connector_gmail_send(body: GmailSendIn, user: dict[str, Any] = Depends(workspace_user)):
    out = await _connector_call(connectors.gmail_send, user["workspace"], body.to, body.subject, body.body, body.replyToId)
    events.emit("connector.gmail_sent", user["workspace"], {"to": body.to, "subject": body.subject}, user_id=user["user_id"])
    return out


@app.get("/v1/connectors/google/calendar/events")
async def connector_calendar_events(days: int = 7, q: str | None = None, user: dict[str, Any] = Depends(workspace_user)):
    return await _connector_call(connectors.calendar_events, user["workspace"], days, q)


@app.post("/v1/connectors/google/calendar/events")
async def connector_calendar_create(body: CalendarEventIn, user: dict[str, Any] = Depends(workspace_user)):
    out = await _connector_call(connectors.calendar_create, user["workspace"], body.title, body.start, body.end, body.description, body.location)
    events.emit("connector.calendar_event_created", user["workspace"], {"title": body.title, "start": body.start}, user_id=user["user_id"])
    return out
