"""MCP server (Streamable-HTTP JSON-RPC, 0.0.0.0:6082/mcp) exposing the desktop + Screenpipe to Hermes.

Thin layer: every tool is forwarded to the local gate (127.0.0.1:6081, X-Gate-Secret) or to the profile's
Screenpipe. Hermes runs one shared sandbox, so tools act on the profile named by OH_MCP_WORKSPACE
(default: the gate's default profile).
"""
from __future__ import annotations
import json, os, time, urllib.error, urllib.parse, urllib.request
from typing import Any
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

GATE = "http://127.0.0.1:6081"
SECRET = os.environ["DESKTOP_SIGNING_SECRET"]
WORKSPACE = os.environ.get("OH_MCP_WORKSPACE", "")
SP_URL = os.environ.get("OH_SCREENPIPE_URL", "http://127.0.0.1:3031")
SP_KEY = os.environ.get("SCREENPIPE_API_KEY", "")
BACKEND = os.environ.get("OH_BACKEND_URL", "https://octohandy.amirelay.com/backend")
BACKEND_TOKEN = os.environ.get("OH_BACKEND_TOKEN", "")
app = FastAPI()


HINTS = {
    "/v1/connectors/google": "Google (Gmail/Agenda) is not connected for this seller. Say so plainly and suggest Settings → Connectors; do not retry.",
    "/v1/market/comps": "Give market_price a short description of the item (brand + model), e.g. 'iphone 13 128go'.",
}


class ToolFailure(Exception):
    """A clean, non-retryable failure the agent should read and explain to the seller."""


def _http(method: str, url: str, body: Any = None, headers: dict | None = None, timeout: int = 150) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            detail = json.loads(raw).get("detail") or raw.decode(errors="replace")
        except (ValueError, AttributeError):
            detail = raw[:500].decode(errors="replace")
        hint = next((h for k, h in HINTS.items() if k in url), "")
        raise ToolFailure(f"{detail} {hint}".strip()) from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise ToolFailure(f"service unreachable ({e}); try again in a minute or use the desktop tools") from None
    try:
        return json.loads(raw)
    except ValueError:
        return {"raw": raw[:2000].decode(errors="replace")}


def gate(path: str, body: dict | None = None, method: str = "POST") -> Any:
    h = {"X-Gate-Secret": SECRET}
    if WORKSPACE:
        h["X-Workspace"] = WORKSPACE
    return _http(method, f"{GATE}/desktop{path}", body if method == "POST" else None, h)


def screenpipe_search(q: str = "", limit: int = 10, app_name: str = "", minutes: int = 0) -> Any:
    params = {"limit": limit, "content_type": "ocr"}
    if q: params["q"] = q
    if app_name: params["app_name"] = app_name
    if minutes: params["start_time"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 60 * minutes))
    out = _http("GET", f"{SP_URL}/search?{urllib.parse.urlencode(params)}", headers={"Authorization": f"Bearer {SP_KEY}"}, timeout=20)
    items = []
    for it in out.get("data", []):
        c = it.get("content", {})
        items.append({"time": c.get("timestamp"), "app": c.get("app_name"), "window": c.get("window_name"), "text": (c.get("text") or "")[:1500]})
    return {"ok": True, "results": items}


def backend(path: str, body: dict | None = None, method: str = "GET") -> Any:
    return _http(method, f"{BACKEND}{path}", body if method == "POST" else None, {"Authorization": f"Bearer {BACKEND_TOKEN}"}, timeout=60)


def T(name, desc, props=None, required=None):
    return {"name": name, "description": desc, "inputSchema": {"type": "object", "properties": props or {}, "required": required or []}}


S = {"type": "string"}; I = {"type": "integer"}; B = {"type": "boolean"}
TOOLS = [
    T("screen_now", "What is on the seller's remote desktop right now (latest OCR text from Screenpipe).", {"app_name": S}),
    T("screen_search", "Search what appeared on the remote desktop screen (Screenpipe OCR history).", {"q": S, "minutes": I, "limit": I, "app_name": S}, ["q"]),
    T("desktop_tabs", "List the Chrome tabs open on the remote desktop (first = active)."),
    T("desktop_read", "Read the active page: title, url, visible text and numbered interactive elements [n].", {"tab": S}),
    T("desktop_navigate", "Open a URL in the remote desktop Chrome (reuses the active tab).", {"url": S}, ["url"]),
    T("desktop_click", "Click element [n] from desktop_read. Buttons that send/publish/pay/delete need approved=true (ask the seller first).", {"index": I, "approved": B}, ["index"]),
    T("desktop_type", "Type text into element [n] (clears it first unless append=true). press_enter submits only when approved.", {"index": I, "text": S, "append": B, "press_enter": B, "approved": B}, ["index", "text"]),
    T("desktop_scroll", "Scroll the page (direction up/down, amount in px).", {"direction": S, "amount": I}),
    T("desktop_press", "Press a key (Escape, Tab, Enter…). Enter needs approved=true on forms.", {"key": S, "approved": B}, ["key"]),
    T("desktop_back", "Browser back."),
    T("desktop_upload_files", "Attach the seller's chat photos (already copied to the desktop) to file input [n]. Lists files when index is omitted.", {"index": I, "paths": {"type": "array", "items": S}}),
    T("clipboard_set", "Put text in the desktop clipboard so the seller (or you) can paste it.", {"text": S}, ["text"]),
    T("record_screen", "Start/stop a screen recording of the desktop. action=start|stop; stop needs the id.", {"action": S, "id": S, "label": S}, ["action"]),
    T("account_info", "Is the seller logged in on this marketplace, and which listings do they have (read from their own session).", {"marketplace": S}, ["marketplace"]),
    T("list_workflows", "Seller's saved workflows (name, marketplace, steps)."),
    T("market_price", "Market comparables for an item (eBay sold, Vinted/Leboncoin asking) from the data pipeline.", {"query": S, "marketplace": S}, ["query"]),
    T("gmail_search", "Search the seller's Gmail (Google connector). q uses Gmail syntax, e.g. 'from:vinted.fr newer_than:2d'.", {"q": S, "limit": I}, ["q"]),
    T("gmail_read", "Read one email (headers + plain-text body) by id from gmail_search.", {"id": S}, ["id"]),
    T("gmail_send", "Send an email as the seller. Consequential: needs approved=true after the seller agreed to the exact text. reply_to_id keeps the thread.", {"to": S, "subject": S, "body": S, "reply_to_id": S, "approved": B}, ["to", "subject", "body"]),
    T("calendar_events", "Seller's upcoming Google Calendar events (next N days, optional text filter).", {"days": I, "q": S}),
    T("calendar_create", "Add an event to the seller's Google Calendar (pickup, shipping deadline…). Needs approved=true. start/end ISO 8601, or YYYY-MM-DD for all-day.", {"title": S, "start": S, "end": S, "description": S, "location": S, "approved": B}, ["title", "start"]),
]
BROWSER_MAP = {"desktop_tabs": "tabs", "desktop_read": "read", "desktop_navigate": "navigate", "desktop_click": "click", "desktop_type": "type",
               "desktop_scroll": "scroll", "desktop_press": "press", "desktop_back": "back", "desktop_upload_files": "upload"}


def call(name: str, a: dict) -> Any:
    if name == "screen_now":
        return screenpipe_search(limit=3, app_name=a.get("app_name", ""), minutes=5)
    if name == "screen_search":
        return screenpipe_search(a.get("q", ""), int(a.get("limit", 10)), a.get("app_name", ""), int(a.get("minutes", 0)))
    if name in BROWSER_MAP:
        if name == "desktop_upload_files" and "index" not in a:
            return gate("/files", method="GET")
        return gate("/browser", {"action": BROWSER_MAP[name], "args": a})
    if name == "clipboard_set":
        return gate("/clipboard", {"text": a.get("text", "")})
    if name == "record_screen":
        return gate("/record/start", {"label": a.get("label", "")}) if a.get("action") == "start" else gate("/record/stop", {"id": a.get("id", "")})
    if name == "account_info":
        out = gate("/sync", {"marketplace": a.get("marketplace", "vinted")})
        out["listings"] = out.get("listings", [])[:60]
        return out
    if name == "list_workflows":
        return backend("/v1/workflows")
    if name == "market_price":
        return backend(f"/v1/market/comps?{urllib.parse.urlencode({k: v for k, v in {'q': a.get('query') or a.get('q'), 'marketplace': a.get('marketplace')}.items() if v})}")
    if name == "gmail_search":
        return backend(f"/v1/connectors/google/gmail/search?{urllib.parse.urlencode({'q': a.get('q', ''), 'limit': int(a.get('limit', 10))})}")
    if name == "gmail_read":
        return backend(f"/v1/connectors/google/gmail/messages/{urllib.parse.quote(str(a.get('id', '')))}")
    if name == "gmail_send":
        if not a.get("approved"):
            return {"ok": False, "needs_approval": True, "error": "Sending an email is consequential: show the seller the recipient, subject and full text, then call again with approved=true once they agree."}
        return backend("/v1/connectors/google/gmail/send", {"to": a.get("to"), "subject": a.get("subject"), "body": a.get("body"), "replyToId": a.get("reply_to_id") or None}, "POST")
    if name == "calendar_events":
        return backend(f"/v1/connectors/google/calendar/events?{urllib.parse.urlencode({k: v for k, v in {'days': a.get('days', 7), 'q': a.get('q')}.items() if v})}")
    if name == "calendar_create":
        if not a.get("approved"):
            return {"ok": False, "needs_approval": True, "error": "Adding a calendar event needs the seller's approval: confirm title and time, then call again with approved=true."}
        return backend("/v1/connectors/google/calendar/events", {"title": a.get("title"), "start": a.get("start"), "end": a.get("end") or None, "description": a.get("description", ""), "location": a.get("location", "")}, "POST")
    raise ValueError(f"unknown tool {name}")


@app.post("/mcp")
async def mcp(req: Request):
    msg = await req.json()
    mid, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if method == "initialize":
        res = {"protocolVersion": params.get("protocolVersion", "2025-03-26"), "capabilities": {"tools": {}}, "serverInfo": {"name": "octohandy-desktop", "version": "2.0"}}
    elif method == "tools/list":
        res = {"tools": TOOLS}
    elif method == "tools/call":
        try:
            out = call(params.get("name", ""), params.get("arguments") or {})
            res = {"content": [{"type": "text", "text": json.dumps(out, ensure_ascii=False)[:60000]}], "isError": False}
        except (ToolFailure, ValueError) as e:
            # Expected failures (not connected, bad arguments) are returned as a normal result: Hermes trips its
            # per-server circuit breaker on isError=True and then refuses the *desktop* tools for a minute.
            res = {"content": [{"type": "text", "text": json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False)}], "isError": False}
        except Exception as e:  # noqa: BLE001
            res = {"content": [{"type": "text", "text": f"error: {e}"}], "isError": True}
    elif method in ("notifications/initialized", "ping"):
        return JSONResponse({"jsonrpc": "2.0", "id": mid, "result": {}}) if mid is not None else JSONResponse({}, status_code=202)
    else:
        return JSONResponse({"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"unknown method {method}"}})
    return JSONResponse({"jsonrpc": "2.0", "id": mid, "result": res})


@app.get("/mcp")
async def mcp_get():
    return JSONResponse({"ok": True, "tools": [t["name"] for t in TOOLS]})
