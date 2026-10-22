"""MCP server (Streamable-HTTP JSON-RPC, 0.0.0.0:6082/mcp) exposing the desktop + Screenpipe to Hermes.

Thin layer: every tool is forwarded to the local gate (127.0.0.1:6081, X-Gate-Secret) or to the profile's
Screenpipe. Hermes runs one shared sandbox, so tools act on the profile named by OH_MCP_WORKSPACE
(default: the gate's default profile).
"""
from __future__ import annotations
import json, os, time, urllib.parse, urllib.request
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


def _http(method: str, url: str, body: Any = None, headers: dict | None = None, timeout: int = 150) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
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
        return backend(f"/v1/market/comps?{urllib.parse.urlencode({k: v for k, v in {'query': a.get('query'), 'marketplace': a.get('marketplace')}.items() if v})}")
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
