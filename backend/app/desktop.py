from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from .settings import settings


def _desktop_enabled() -> bool:
    return bool(settings.desktop_base_url and settings.desktop_signing_secret)


def _desktop_token(workspace: str, marketplace: str | None, ttl: int) -> tuple[str, int]:
    exp = int(time.time()) + ttl
    raw = json.dumps(
        {"exp": exp, "ws": workspace, "mp": marketplace or "", "n": secrets.token_hex(6)},
        separators=(",", ":"),
    ).encode()
    payload = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    sig = hmac.new(settings.desktop_signing_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()[:40]
    return f"{payload}.{sig}", exp
