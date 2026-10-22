"""Google connector.

The seller links their own Google account once (OAuth on the MonAmi Google Cloud project), the refresh
token is stored encrypted per workspace, and Hermes reaches Gmail / Calendar through the
/v1/connectors/google/* endpoints — always as the seller, never with shared credentials.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from .settings import settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
CALENDAR = "https://www.googleapis.com/calendar/v3"

SCOPES = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]
SCOPE_LABELS = {
    "gmail": "Gmail (read buyer emails, send replies you approve)",
    "calendar": "Google Calendar (read your agenda, add pickups and deadlines)",
    "contacts": "Contacts (read-only)",
    "drive": "Drive (read-only, product photos)",
}

PROVIDERS = [
    {
        "id": "google",
        "name": "Google",
        "description": "Gmail, Calendar, Contacts and Drive. The agent reads marketplace emails and your agenda; "
        "sending an email or adding an event always goes through your approval.",
        "scopes": list(SCOPE_LABELS.values()),
    },
]


def configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def redirect_uri() -> str:
    return f"{settings.app_url}/backend/v1/connectors/google/callback"


def _secret() -> bytes:
    return (settings.connectors_secret or settings.app_session_secret or settings.desktop_signing_secret or "octohandy-dev").encode()


def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(_secret()).digest()))


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign_state(workspace: str, user_id: str, ttl: int = 600) -> str:
    payload = _b64(json.dumps({"ws": workspace, "u": user_id, "exp": int(time.time()) + ttl}, separators=(",", ":")).encode())
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:40]
    return f"{payload}.{sig}"


def verify_state(state: str) -> dict[str, Any]:
    try:
        payload, sig = state.split(".", 1)
    except ValueError as e:
        raise HTTPException(400, "Invalid state") from e
    good = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:40]
    if not hmac.compare_digest(sig, good):
        raise HTTPException(400, "Invalid state")
    data = json.loads(_unb64(payload))
    if int(data.get("exp", 0)) < time.time():
        raise HTTPException(400, "Expired state, start again")
    return data


def auth_url(workspace: str, user_id: str) -> str:
    if not configured():
        raise HTTPException(503, "Google connector is not configured yet.")
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": sign_state(workspace, user_id),
    }
    return str(httpx.URL(AUTH_URL, params=params))


def _token_request(data: dict[str, str]) -> dict[str, Any]:
    r = httpx.post(TOKEN_URL, data={**data, "client_id": settings.google_client_id, "client_secret": settings.google_client_secret}, timeout=20)
    if r.status_code >= 400:
        detail = r.json().get("error_description") or r.text if r.headers.get("content-type", "").startswith("application/json") else r.text
        raise HTTPException(502, f"Google refused the token request: {detail[:200]}")
    return r.json()


def exchange_code(code: str) -> dict[str, Any]:
    return _token_request({"code": code, "grant_type": "authorization_code", "redirect_uri": redirect_uri()})


def userinfo(access_token: str) -> dict[str, Any]:
    r = httpx.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=20)
    return r.json() if r.status_code < 400 else {}


def _row(conn, workspace: str, provider: str = "google"):
    return conn.execute("SELECT * FROM connectors WHERE workspace = ? AND provider = ?", (workspace, provider)).fetchone()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def save_tokens(conn, workspace: str, tokens: dict[str, Any], email: str | None, provider: str = "google") -> None:
    existing = _row(conn, workspace, provider)
    old = _decrypt(existing["token_enc"]) if existing else {}
    merged = {**old, **{k: v for k, v in tokens.items() if v is not None}}
    if "refresh_token" not in merged and old.get("refresh_token"):
        merged["refresh_token"] = old["refresh_token"]
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 3600)))).isoformat(timespec="seconds")
    scopes = tokens.get("scope") or (existing["scopes"] if existing else " ".join(SCOPES))
    enc = _fernet().encrypt(json.dumps(merged).encode()).decode()
    conn.execute(
        """INSERT INTO connectors (workspace, provider, account_email, scopes, token_enc, expires_at, connected_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(workspace, provider) DO UPDATE SET
             account_email = COALESCE(excluded.account_email, connectors.account_email),
             scopes = excluded.scopes, token_enc = excluded.token_enc, expires_at = excluded.expires_at,
             updated_at = excluded.updated_at""",
        (workspace, provider, email or (existing["account_email"] if existing else None), scopes, enc, expires_at, _now(), _now()),
    )


def _decrypt(token_enc: str) -> dict[str, Any]:
    try:
        return json.loads(_fernet().decrypt(token_enc.encode()))
    except (InvalidToken, ValueError):
        return {}


def status(conn, workspace: str) -> dict[str, Any]:
    out = []
    for p in PROVIDERS:
        row = _row(conn, workspace, p["id"])
        out.append({
            **p,
            "connected": bool(row),
            "email": row["account_email"] if row else None,
            "connectedAt": row["connected_at"] if row else None,
        })
    return {"configured": configured(), "providers": out}


def disconnect(conn, workspace: str, provider: str = "google") -> bool:
    row = _row(conn, workspace, provider)
    if not row:
        return False
    tokens = _decrypt(row["token_enc"])
    tok = tokens.get("refresh_token") or tokens.get("access_token")
    if tok:
        try:
            httpx.post(REVOKE_URL, params={"token": tok}, timeout=10)
        except httpx.HTTPError:
            pass
    conn.execute("DELETE FROM connectors WHERE workspace = ? AND provider = ?", (workspace, provider))
    return True


def access_token(conn, workspace: str) -> str:
    row = _row(conn, workspace)
    if not row:
        raise HTTPException(409, "Google is not connected for this workspace. Connect it in Settings → Connectors.")
    tokens = _decrypt(row["token_enc"])
    exp = row["expires_at"]
    fresh = bool(exp) and datetime.fromisoformat(exp) > datetime.now(timezone.utc) + timedelta(seconds=60)
    if fresh and tokens.get("access_token"):
        return tokens["access_token"]
    if not tokens.get("refresh_token"):
        raise HTTPException(409, "Google session expired. Reconnect Google in Settings → Connectors.")
    new = _token_request({"refresh_token": tokens["refresh_token"], "grant_type": "refresh_token"})
    save_tokens(conn, workspace, new, None)
    return new["access_token"]


def api(conn, workspace: str, method: str, url: str, params: dict | None = None, body: Any = None) -> Any:
    token = access_token(conn, workspace)
    r = httpx.request(method, url, params=params, json=body, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    if r.status_code == 401:
        raise HTTPException(409, "Google session expired. Reconnect Google in Settings → Connectors.")
    if r.status_code >= 400:
        try:
            msg = r.json().get("error", {}).get("message", r.text)
        except ValueError:
            msg = r.text
        raise HTTPException(502, f"Google API error: {str(msg)[:200]}")
    return r.json() if r.content else {}


# ---------------------------------------------------------------- Gmail helpers (plain, agent-friendly output)

def _header(msg: dict[str, Any], name: str) -> str:
    for h in msg.get("payload", {}).get("headers", []):
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _summary(msg: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": msg.get("id"),
        "threadId": msg.get("threadId"),
        "from": _header(msg, "From"),
        "to": _header(msg, "To"),
        "subject": _header(msg, "Subject"),
        "date": _header(msg, "Date"),
        "snippet": msg.get("snippet", ""),
        "unread": "UNREAD" in msg.get("labelIds", []),
    }


def gmail_search(conn, workspace: str, q: str, limit: int = 10) -> dict[str, Any]:
    res = api(conn, workspace, "GET", f"{GMAIL}/messages", {"q": q, "maxResults": max(1, min(limit, 25))})
    out = []
    for m in res.get("messages", []) or []:
        full = api(conn, workspace, "GET", f"{GMAIL}/messages/{m['id']}",
                   {"format": "metadata", "metadataHeaders": ["From", "To", "Subject", "Date"]})
        out.append(_summary(full))
    return {"query": q, "count": len(out), "messages": out}


def _body_text(part: dict[str, Any]) -> str:
    mime = part.get("mimeType", "")
    data = part.get("body", {}).get("data")
    if data and mime == "text/plain":
        return _unb64(data).decode("utf-8", "replace")
    for sub in part.get("parts", []) or []:
        text = _body_text(sub)
        if text:
            return text
    if data and mime == "text/html":
        import re
        html = _unb64(data).decode("utf-8", "replace")
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()
    return ""


def gmail_read(conn, workspace: str, message_id: str) -> dict[str, Any]:
    msg = api(conn, workspace, "GET", f"{GMAIL}/messages/{message_id}", {"format": "full"})
    out = _summary(msg)
    out["body"] = _body_text(msg.get("payload", {}))[:6000]
    return out


def gmail_send(conn, workspace: str, to: str, subject: str, body: str, reply_to_id: str | None = None) -> dict[str, Any]:
    em = EmailMessage()
    em["To"] = to
    em["Subject"] = subject
    thread_id = None
    if reply_to_id:
        orig = api(conn, workspace, "GET", f"{GMAIL}/messages/{reply_to_id}",
                   {"format": "metadata", "metadataHeaders": ["Message-ID", "References"]})
        thread_id = orig.get("threadId")
        mid = _header(orig, "Message-ID")
        if mid:
            em["In-Reply-To"] = mid
            em["References"] = f"{_header(orig, 'References')} {mid}".strip()
    em.set_content(body)
    payload: dict[str, Any] = {"raw": _b64(em.as_bytes())}
    if thread_id:
        payload["threadId"] = thread_id
    sent = api(conn, workspace, "POST", f"{GMAIL}/messages/send", body=payload)
    return {"ok": True, "id": sent.get("id"), "threadId": sent.get("threadId")}


# ---------------------------------------------------------------- Calendar helpers

def _when(obj: dict[str, Any]) -> str:
    return obj.get("dateTime") or obj.get("date") or ""


def calendar_events(conn, workspace: str, days: int = 7, q: str | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    params: dict[str, Any] = {
        "timeMin": now.isoformat(), "timeMax": (now + timedelta(days=max(1, min(days, 60)))).isoformat(),
        "singleEvents": "true", "orderBy": "startTime", "maxResults": 50,
    }
    if q:
        params["q"] = q
    res = api(conn, workspace, "GET", f"{CALENDAR}/calendars/primary/events", params)
    items = [{
        "id": e.get("id"), "title": e.get("summary", "(no title)"), "start": _when(e.get("start", {})),
        "end": _when(e.get("end", {})), "location": e.get("location", ""), "link": e.get("htmlLink", ""),
    } for e in res.get("items", [])]
    return {"days": days, "count": len(items), "events": items}


def calendar_create(conn, workspace: str, title: str, start: str, end: str | None, description: str = "", location: str = "") -> dict[str, Any]:
    all_day = len(start) == 10
    if not end:
        end = start if all_day else (datetime.fromisoformat(start) + timedelta(hours=1)).isoformat()
    key = "date" if all_day else "dateTime"
    body = {"summary": title, "description": description, "location": location, "start": {key: start}, "end": {key: end}}
    ev = api(conn, workspace, "POST", f"{CALENDAR}/calendars/primary/events", body=body)
    return {"ok": True, "id": ev.get("id"), "link": ev.get("htmlLink", ""), "start": _when(ev.get("start", {}))}
