from __future__ import annotations

import asyncio
import struct
from urllib.parse import urlencode, urlsplit

import websockets
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from .desktop import _desktop_token
from .settings import settings

CONNECT_TIMEOUT = 15.0
OPERATION_TIMEOUT = 10.0


class DesktopInputError(Exception):
    pass


def pointer_event(button_mask: int, x: int, y: int) -> bytes:
    return struct.pack(">BBHH", 6, button_mask & 0xFF, x, y)


def key_event(keysym: int, down: bool) -> bytes:
    return struct.pack(">BBHI", 4, int(down), 0, keysym)


def vnc_key(password: str) -> bytes:
    raw = password.encode("utf-8")[:8].ljust(8, b"\0")
    return bytes(int(f"{byte:08b}"[::-1], 2) for byte in raw)


def vnc_response(challenge: bytes, password: str) -> bytes:
    if len(challenge) != 16:
        raise ValueError("Le défi VNC doit contenir 16 octets")
    cipher = Cipher(algorithms.TripleDES(vnc_key(password)), modes.ECB()).encryptor()
    return cipher.update(challenge) + cipher.finalize()


_SHIFTED_KEYSYMS = {
    "!": ("1", True), "@": ("2", True), "#": ("3", True), "$": ("4", True), "%": ("5", True),
    "^": ("6", True), "&": ("7", True), "*": ("8", True), "(": ("9", True), ")": ("0", True),
    "_": ("-", True), "+": ("=", True), "{": ("[", True), "}": ("]", True), "|": ("\\", True),
    ":": (";", True), '"': ("'", True), "<": (",", True), ">": (".", True), "?": ("/", True),
    "~": ("`", True),
}
_SPECIAL_KEYSYMS = {
    "Enter": 0xFF0D,
    "Tab": 0xFF09,
    "BackSpace": 0xFF08,
    "Escape": 0xFF1B,
    "space": 0x20,
}


def keysym_for_key(key: str) -> int:
    try:
        return _SPECIAL_KEYSYMS[key]
    except KeyError as exc:
        raise ValueError(f"Touche non prise en charge : {key}") from exc


def keysym_for_character(char: str) -> tuple[int, bool]:
    if len(char) != 1:
        raise ValueError("Un seul caractère est attendu")
    special = {"\n": "Enter", "\t": "Tab", "\b": "BackSpace", "\x1b": "Escape", " ": "space"}
    if char in special:
        return keysym_for_key(special[char]), False
    if char in _SHIFTED_KEYSYMS:
        base, shift = _SHIFTED_KEYSYMS[char]
        return ord(base), shift
    if char.isascii() and 0x20 <= ord(char) <= 0x7E:
        if char.isalpha() and char.isupper():
            return ord(char.lower()), True
        return ord(char), False
    return 0x01000000 + ord(char), False


class RemoteDesktop:
    def __init__(self, workspace: str, marketplace: str | None, ttl: int | None = None):
        self.workspace = workspace
        self.marketplace = marketplace
        self.ttl = ttl or settings.desktop_session_ttl
        self.websocket = None
        self.width = 0
        self.height = 0
        self._x = 0
        self._y = 0
        self._drain_task: asyncio.Task[None] | None = None
        self._closed = False

    async def __aenter__(self) -> RemoteDesktop:
        await self.connect()
        return self

    async def __aexit__(self, _exc_type, _exc, _tb) -> None:
        await self.close()

    async def connect(self) -> None:
        if self.websocket is not None:
            return
        if not settings.desktop_base_url or not settings.desktop_vnc_password:
            raise DesktopInputError("Le bureau distant n'est pas configuré")
        try:
            token, _exp = _desktop_token(self.workspace, self.marketplace, self.ttl)
            host = urlsplit(settings.desktop_base_url).netloc
            if not host:
                raise DesktopInputError("Adresse du bureau distant invalide")
            url = f"wss://{host}/websockify?{urlencode({'t': token})}"
            self.websocket = await asyncio.wait_for(
                websockets.connect(url, subprotocols=["binary"], open_timeout=CONNECT_TIMEOUT, close_timeout=OPERATION_TIMEOUT),
                timeout=CONNECT_TIMEOUT,
            )
            await asyncio.wait_for(self._handshake(), timeout=CONNECT_TIMEOUT)
            self._drain_task = asyncio.create_task(self._drain_messages())
        except DesktopInputError:
            await self.close()
            raise
        except Exception as exc:
            await self.close()
            raise DesktopInputError(f"Connexion RFB impossible ({type(exc).__name__})") from exc

    async def _handshake(self) -> None:
        self._read_buffer = bytearray()
        server_version = await self._read_protocol_bytes(12)
        if not server_version.startswith(b"RFB "):
            raise DesktopInputError("Version RFB invalide")
        await self.websocket.send(b"RFB 003.008\n")
        security_count = (await self._read_protocol_bytes(1))[0]
        if security_count == 0:
            reason_length = int.from_bytes(await self._read_protocol_bytes(4), "big")
            reason = (await self._read_protocol_bytes(reason_length)).decode("utf-8", "replace")
            raise DesktopInputError(f"Le bureau a refusé la connexion : {reason[:160]}")
        security_types = await self._read_protocol_bytes(security_count)
        if 2 not in security_types:
            raise DesktopInputError("Le bureau ne propose pas l'authentification VNC attendue")
        await self.websocket.send(b"\x02")
        challenge = await self._read_protocol_bytes(16)
        await self.websocket.send(vnc_response(challenge, settings.desktop_vnc_password))
        status = int.from_bytes(await self._read_protocol_bytes(4), "big")
        if status != 0:
            raise DesktopInputError("L'authentification du bureau a échoué")
        await self.websocket.send(b"\x01")
        dimensions = await self._read_protocol_bytes(4)
        self.width = int.from_bytes(dimensions[:2], "big")
        self.height = int.from_bytes(dimensions[2:], "big")
        if not self.width or not self.height:
            raise DesktopInputError("Dimensions du bureau invalides")
        pixel_format = await self._read_protocol_bytes(16)
        self._bytes_per_pixel = max(1, pixel_format[0] // 8)
        name_length = int.from_bytes(await self._read_protocol_bytes(4), "big")
        await self._read_protocol_bytes(name_length)

    async def _read_protocol_bytes(self, size: int) -> bytes:
        buffer = getattr(self, "_read_buffer", bytearray())
        while len(buffer) < size:
            if self.websocket is None:
                raise DesktopInputError("Connexion RFB fermée")
            message = await asyncio.wait_for(self.websocket.recv(), timeout=OPERATION_TIMEOUT)
            if not isinstance(message, (bytes, bytearray)):
                raise DesktopInputError("Réponse RFB invalide")
            buffer.extend(message)
        result = bytes(buffer[:size])
        self._read_buffer = bytearray(buffer[size:])
        return result

    async def _drain_messages(self) -> None:
        try:
            while self.websocket is not None:
                await self.websocket.recv()
        except asyncio.CancelledError:
            raise
        except Exception:
            self._closed = True

    async def _send(self, message: bytes) -> None:
        if self.websocket is None or self._closed:
            raise DesktopInputError("Connexion RFB fermée")
        try:
            await asyncio.wait_for(self.websocket.send(message), timeout=OPERATION_TIMEOUT)
        except Exception as exc:
            self._closed = True
            raise DesktopInputError(f"Envoi RFB impossible ({type(exc).__name__})") from exc

    def _clamp(self, x: int, y: int) -> tuple[int, int]:
        if self.width <= 0 or self.height <= 0:
            raise DesktopInputError("Écran distant indisponible")
        return min(self.width - 1, max(0, int(x))), min(self.height - 1, max(0, int(y)))

    async def move(self, x: int, y: int) -> None:
        self._x, self._y = self._clamp(x, y)
        await self._send(pointer_event(0, self._x, self._y))

    async def button_down(self, mask: int) -> None:
        await self._send(pointer_event(mask, self._x, self._y))

    async def button_up(self, mask: int = 0) -> None:
        await self._send(pointer_event(mask, self._x, self._y))

    async def click(self, x: int, y: int, button: int = 1) -> None:
        await self.move(x, y)
        await self.button_down(button)
        await self.button_up(0)

    async def key(self, keysym: int, down: bool) -> None:
        await self._send(key_event(keysym, down))

    async def type_text(self, text: str) -> None:
        for char in text:
            keysym, shift = keysym_for_character(char)
            if shift:
                await self.key(0xFFE1, True)
            await self.key(keysym, True)
            await self.key(keysym, False)
            if shift:
                await self.key(0xFFE1, False)

    async def close(self) -> None:
        if self._drain_task is not None:
            self._drain_task.cancel()
            try:
                await self._drain_task
            except asyncio.CancelledError:
                pass
            self._drain_task = None
        if self.websocket is not None:
            websocket, self.websocket = self.websocket, None
            try:
                await asyncio.wait_for(websocket.close(), timeout=OPERATION_TIMEOUT)
            except Exception:
                pass
