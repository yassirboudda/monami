"""OctoHandy desktop gate — runs on the GPU box behind Caddy (127.0.0.1:6081).

One Linux desktop profile per workspace (see provision-profile.sh). Every /desktop/* call carries
X-Gate-Secret (shared with the Hetzner backend) and optionally X-Workspace to pick the profile;
the noVNC websocket (/websockify?t=<token>) picks the profile from the signed token itself.
"""
from __future__ import annotations

import asyncio, base64, hashlib, hmac, json, os, pwd, re, secrets, subprocess, time, urllib.request
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Request, Response, WebSocket
from fastapi.responses import FileResponse, JSONResponse

import octohandy_browser as browser
import octohandy_sync as syncmod

SECRET = os.environ.get("DESKTOP_SIGNING_SECRET", "")
PROFILES_DIR = Path("/etc/octohandy/profiles")
PROFILES_MAP = Path("/etc/octohandy/workspaces.json")   # {workspace: slug}
DEFAULT_SLUG = os.environ.get("OH_DEFAULT_SLUG", "main")
PROVISION = "/opt/octohandy/provision-profile.sh"
RECORDINGS: dict[str, dict[str, Any]] = {}
app = FastAPI(title="OctoHandy desktop gate")


# ----------------------------------------------------------------------------- profiles
def _slugify(workspace: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "", workspace.lower().replace("user:", "u").replace("org:", "o"))[:12]
    return s or hashlib.sha1(workspace.encode()).hexdigest()[:10]


def _load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def _map() -> dict[str, str]:
    return json.loads(PROFILES_MAP.read_text()) if PROFILES_MAP.exists() else {}


def profile_for(workspace: str | None, create: bool = False) -> dict[str, Any]:
    m = _map()
    slug = m.get(workspace or "", DEFAULT_SLUG if not workspace else None)
    if slug is None:
        if not create:
            slug = DEFAULT_SLUG
        else:
            slug = _slugify(workspace)
            used = {int(_load_env(p)["OH_N"]) for p in PROFILES_DIR.glob("*.env")}
            n = next(i for i in range(1, 60) if i not in used)
            subprocess.run(["sudo", PROVISION, slug, str(n)], check=True, timeout=120)
            m[workspace] = slug
            PROFILES_MAP.write_text(json.dumps(m, indent=1))
    env_path = PROFILES_DIR / f"{slug}.env"
    if not env_path.exists():
        raise HTTPException(503, f"desktop profile {slug} not provisioned")
    env = _load_env(env_path)
    env["slug"] = slug
    env["uid"] = pwd.getpwnam(env["OH_USER"]).pw_uid
    return env


def _auth(secret: str | None) -> None:
    if not SECRET or not secret or not hmac.compare_digest(secret, SECRET):
        raise HTTPException(401, "bad gate secret")


def verify_token(token: str) -> dict[str, Any]:
    try:
        payload, sig = token.split(".", 1)
        good = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:40]
        if not hmac.compare_digest(sig, good):
            raise ValueError("sig")
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if int(data.get("exp", 0)) < time.time():
            raise ValueError("expired")
        return data
    except Exception as e:  # noqa: BLE001
        raise HTTPException(403, f"invalid desktop token ({e})") from e


def _run_as(prof: dict[str, Any], cmd: list[str], *, input: bytes | None = None, timeout: int = 30) -> subprocess.CompletedProcess:
    env = {"DISPLAY": prof["DISPLAY"], "HOME": prof["OH_HOME"], "XDG_RUNTIME_DIR": f"/run/user/{prof['uid']}", "LANG": "fr_FR.UTF-8"}
    return subprocess.run(["sudo", "-u", prof["OH_USER"], "env", *[f"{k}={v}" for k, v in env.items()], *cmd],
                          input=input, capture_output=True, timeout=timeout)


# ----------------------------------------------------------------------------- health / open / browser
@app.get("/desktop/health")
async def health():
    return {"ok": True, "profiles": sorted(p.stem for p in PROFILES_DIR.glob("*.env")), "t": time.time()}


@app.post("/desktop/profiles/ensure")
async def ensure_profile(body: dict[str, Any], x_gate_secret: str | None = Header(None)):
    _auth(x_gate_secret)
    prof = await asyncio.to_thread(profile_for, body.get("workspace"), True)
    return {"ok": True, "slug": prof["slug"], "display": prof["DISPLAY"]}


@app.post("/desktop/open")
async def open_url(body: dict[str, Any], x_gate_secret: str | None = Header(None), x_workspace: str | None = Header(None)):
    _auth(x_gate_secret)
    prof = profile_for(x_workspace)
    url = str(body.get("url", ""))
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "http(s) only")
    out = await asyncio.to_thread(browser.act, "navigate", {"url": url, "wait": 1}, prof["OH_CDP_PORT"])
    return {"ok": bool(out.get("ok")), "url": out.get("url")}


@app.post("/desktop/browser")
async def browser_action(body: dict[str, Any], x_gate_secret: str | None = Header(None), x_workspace: str | None = Header(None)):
    _auth(x_gate_secret)
    prof = profile_for(x_workspace)
    try:
        return await asyncio.to_thread(browser.act, str(body.get("action", "read")), body.get("args") or {}, prof["OH_CDP_PORT"])
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:300]}


@app.get("/desktop/clipboard")
async def clipboard_get(x_gate_secret: str | None = Header(None), x_workspace: str | None = Header(None)):
    _auth(x_gate_secret)
    prof = profile_for(x_workspace)
    r = _run_as(prof, ["xclip", "-selection", "clipboard", "-o"], timeout=5)
    return {"text": r.stdout.decode(errors="replace") if r.returncode == 0 else ""}


@app.post("/desktop/clipboard")
async def clipboard_set(body: dict[str, Any], x_gate_secret: str | None = Header(None), x_workspace: str | None = Header(None)):
    _auth(x_gate_secret)
    prof = profile_for(x_workspace)
    text = str(body.get("text", ""))[:20000]
    subprocess.Popen(["sudo", "-u", prof["OH_USER"], "env", f"DISPLAY={prof['DISPLAY']}", "xclip", "-selection", "clipboard", "-i"],
                     stdin=subprocess.PIPE).communicate(text.encode(), timeout=5)
    return {"ok": True, "text": text}


@app.get("/desktop/image")
async def image_proxy(url: str, referer: str = "", x_gate_secret: str | None = Header(None)):
    _auth(x_gate_secret)
    if not url.startswith("https://"):
        raise HTTPException(400)
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
    if referer:
        headers["Referer"] = referer
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        r = await client.get(url, headers=headers)
    return Response(content=r.content, media_type=r.headers.get("content-type", "image/jpeg"), status_code=r.status_code)


# ----------------------------------------------------------------------------- sync / files / inbox
@app.post("/desktop/sync")
async def sync(body: dict[str, Any], x_gate_secret: str | None = Header(None), x_workspace: str | None = Header(None)):
    _auth(x_gate_secret)
    prof = profile_for(x_workspace)
    try:
        return await asyncio.to_thread(syncmod.sync, str(body.get("marketplace", "vinted")), prof["OH_CDP_PORT"])
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:300]}


@app.post("/desktop/files/put")
async def files_put(body: dict[str, Any], x_gate_secret: str | None = Header(None), x_workspace: str | None = Header(None)):
    _auth(x_gate_secret)
    prof = profile_for(x_workspace)
    name = re.sub(r"[^A-Za-z0-9._-]", "_", str(body.get("name", "file")))[:80]
    raw = base64.b64decode(body.get("b64", ""))
    if not raw or len(raw) > 20_000_000:
        raise HTTPException(400, "empty or too large")
    dest = Path(prof["OH_HOME"]) / "Pictures" / "chat" / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    os.chown(dest, prof["uid"], prof["uid"])
    return {"ok": True, "path": str(dest)}


@app.get("/desktop/files")
async def files_list(x_gate_secret: str | None = Header(None), x_workspace: str | None = Header(None)):
    _auth(x_gate_secret)
    prof = profile_for(x_workspace)
    d = Path(prof["OH_HOME"]) / "Pictures" / "chat"
    files = sorted(d.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True) if d.exists() else []
    return {"files": [{"path": str(p), "size": p.stat().st_size, "mtime": p.stat().st_mtime} for p in files[:50]]}


@app.post("/desktop/inbox/run")
async def inbox_run(body: dict[str, Any], x_gate_secret: str | None = Header(None), x_workspace: str | None = Header(None)):
    _auth(x_gate_secret)
    prof = profile_for(x_workspace)
    mp = str(body.get("marketplace", "vinted"))
    if not Path("/opt/octohandy/inbox_monitor.py").exists():
        return {"ok": False, "error": "inbox monitor not installed yet on this desktop"}
    subprocess.Popen(["/opt/octohandy/venv/bin/python", "/opt/octohandy/inbox_monitor.py", "--profile", prof["slug"], "--marketplace", mp, "--force"],
                     env={**os.environ, "OH_PROFILE_ENV": str(PROFILES_DIR / f"{prof['slug']}.env")})
    return {"ok": True, "marketplace": mp, "profile": prof["slug"]}


# ----------------------------------------------------------------------------- recordings (ffmpeg x11grab)
@app.post("/desktop/record/start")
async def record_start(body: dict[str, Any], x_gate_secret: str | None = Header(None), x_workspace: str | None = Header(None)):
    _auth(x_gate_secret)
    prof = profile_for(x_workspace)
    rid = secrets.token_hex(8)
    out = Path(prof["OH_HOME"]) / "recordings" / f"{rid}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "x11grab", "-framerate", "8", "-video_size", "1600x900",
                             "-i", f"{prof['DISPLAY']}.0", "-vf", "scale=1280:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
                             "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
                            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    RECORDINGS[rid] = {"proc": proc, "path": out, "start": time.time(), "label": str(body.get("label", ""))[:120], "slug": prof["slug"]}
    return {"ok": True, "id": rid}


@app.post("/desktop/record/stop")
async def record_stop(body: dict[str, Any], x_gate_secret: str | None = Header(None)):
    _auth(x_gate_secret)
    rid = str(body.get("id", ""))
    rec = RECORDINGS.pop(rid, None)
    if not rec:
        return {"ok": False, "error": "unknown recording"}
    proc: subprocess.Popen = rec["proc"]
    try:
        proc.communicate(b"q", timeout=15)
    except subprocess.TimeoutExpired:
        proc.kill()
    dur = round(time.time() - rec["start"], 1)
    return {"ok": rec["path"].exists(), "id": rid, "durationSec": dur, "label": rec["label"]}


@app.get("/desktop/recordings/{rid}.mp4")
async def recording(rid: str, x_gate_secret: str | None = Header(None)):
    _auth(x_gate_secret)
    if not re.fullmatch(r"[0-9a-f]{16}", rid):
        raise HTTPException(404)
    for home in Path("/home").glob("oh-*"):
        p = home / "recordings" / f"{rid}.mp4"
        if p.exists():
            return FileResponse(p, media_type="video/mp4")
    raise HTTPException(404)


# ----------------------------------------------------------------------------- noVNC websocket relay (token -> profile's Xvnc)
@app.websocket("/websockify")
async def websockify(ws: WebSocket, t: str = ""):
    try:
        data = verify_token(t)
        prof = profile_for(data.get("ws") or None)
    except HTTPException:
        await ws.close(code=4403)
        return
    await ws.accept(subprotocol="binary" if "binary" in ws.headers.get("sec-websocket-protocol", "") else None)
    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", int(prof["OH_VNC_PORT"]))
    except OSError:
        await ws.close(code=4503)
        return

    async def to_vnc():
        try:
            while True:
                writer.write(await ws.receive_bytes())
                await writer.drain()
        except Exception:  # noqa: BLE001
            writer.close()

    async def to_ws():
        try:
            while True:
                chunk = await reader.read(65536)
                if not chunk:
                    break
                await ws.send_bytes(chunk)
        except Exception:  # noqa: BLE001
            pass
        finally:
            try:
                await ws.close()
            except Exception:  # noqa: BLE001
                pass

    await asyncio.gather(to_vnc(), to_ws(), return_exceptions=True)


@app.get("/desktop/sessions/check")
async def session_check(t: str):
    data = verify_token(t)
    return {"ok": True, "workspace": data.get("ws"), "profile": profile_for(data.get("ws") or None)["slug"]}
