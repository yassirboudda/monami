import asyncio
import random
import struct
import zlib
from datetime import datetime, timedelta, timezone

from app.human import HumanProfile, click_point, from_trace, key_delays, move_path, pre_action_delay, typos
from app.rfb import (
    FRAMEBUFFER_PIXEL_FORMAT,
    RFB_INPUT_ENCODINGS,
    RemoteDesktop,
    key_event,
    keysym_for_character,
    keysym_for_key,
    pointer_event,
    vnc_key,
)
from app.screen import ScreenpipeFrameStaleError, find_target, latest_frame_id


def test_profile_is_stable_and_uses_screen_change_pacing():
    trace = {
        "events": [
            {"t": "2026-01-01T00:00:00Z"},
            {"t": "2026-01-01T00:00:02Z"},
            {"t": "2026-01-01T00:00:06Z"},
        ]
    }
    assert from_trace("user-1", trace) == from_trace("user-1", trace)
    assert from_trace("user-1", trace).pace == 3
    assert from_trace("user-1", trace) != from_trace("user-2", trace)


def test_profile_pace_is_clamped_and_defaults_without_two_events():
    assert from_trace("user", {"events": [{"t": "2026-01-01T00:00:00Z"}]}).pace == 2
    fast = from_trace(
        "user",
        {"events": [{"t": "2026-01-01T00:00:00Z"}, {"t": "2026-01-01T00:00:00.01Z"}]},
    )
    slow = from_trace(
        "user",
        {"events": [{"t": "2026-01-01T00:00:00Z"}, {"t": "2026-01-01T00:10:00Z"}]},
    )
    assert fast.pace == 0.6
    assert slow.pace == 8
    assert 120 <= slow.type_wpm <= fast.type_wpm <= 420


def test_click_points_stay_inside_inner_area_and_avoid_center():
    bounds = (100, 200, 300, 120)
    center = (250, 260)
    rng = random.Random(7)
    points = [click_point(bounds, rng) for _ in range(1000)]
    assert all(130 <= x <= 370 and 212 <= y <= 308 for x, y in points)
    assert all(point != center for point in points)


def test_move_path_has_endpoints_timing_and_expected_length():
    profile = HumanProfile(1, 2, 240, 0.12, 1, 0.01)
    path = move_path((10, 20), (300, 400), random.Random(13), profile)
    assert 14 <= len(path) <= 28
    assert path[0][:2] == (10, 20)
    assert path[-1][:2] == (300, 400)
    assert all(0.006 <= point[2] <= 0.022 for point in path)
    elapsed = 0.0
    times = []
    for _x, _y, delay in path:
        elapsed += delay
        times.append(elapsed)
    assert times == sorted(times)


def test_typing_delays_and_typos_preserve_final_text():
    profile = HumanProfile(2, 2, 240, 0.12, 0.1, 0.03)
    text = "Bonjour, le colis part demain !"
    delays = key_delays(text, random.Random(4), profile)
    assert len(delays) == len(text)
    assert all(delay > 0 for delay in delays)
    typed = typos(text, random.Random(5), profile)
    final = []
    for char, correct in typed:
        if not correct:
            final.append(char)
            final.pop()
        else:
            final.append(char)
    assert "".join(final) == text
    assert 0.4 * profile.pace <= pre_action_delay(random.Random(1), profile) <= 1.8 * profile.pace


def test_rfb_message_encodings_vnc_key_and_keysyms():
    assert pointer_event(1, 0x1234, 0xABCD) == bytes.fromhex("05011234abcd")
    assert key_event(0x010000E9, True) == bytes.fromhex("04010000010000e9")
    assert vnc_key("password") == bytes.fromhex("0e86ceceeef64e26")
    assert keysym_for_character("a") == (ord("a"), False)
    assert keysym_for_character("A") == (ord("a"), True)
    assert keysym_for_character("é") == (0x010000E9, False)
    assert keysym_for_key("Enter") == 0xFF0D
    assert keysym_for_character("\n") == (0xFF0D, False)


def test_rfb_requests_raw_framebuffer_after_server_init():
    class FakeSocket:
        def __init__(self):
            self.sent = []

        async def send(self, message):
            self.sent.append(message)

    desktop = RemoteDesktop("workspace", None)
    desktop.websocket = FakeSocket()
    desktop.width = 1600
    desktop.height = 900

    asyncio.run(desktop._request_framebuffer())

    assert desktop.websocket.sent == [
        b"\x00\x00\x00\x00" + FRAMEBUFFER_PIXEL_FORMAT,
        struct.pack(">BBHi", 2, 0, 1, 0),
        struct.pack(">BBHHHH", 3, 0, 0, 0, 1600, 900),
    ]


def test_rfb_input_stream_negotiates_fences_and_continuous_updates():
    class FakeSocket:
        def __init__(self):
            self.sent = []

        async def send(self, message):
            self.sent.append(message)

    desktop = RemoteDesktop("workspace", None)
    desktop.websocket = FakeSocket()
    desktop.width = 1600
    desktop.height = 900

    asyncio.run(desktop._request_input_stream())

    expected_encodings = (0, -312, -313)
    assert RFB_INPUT_ENCODINGS == expected_encodings
    assert desktop.websocket.sent == [
        b"\x00\x00\x00\x00" + FRAMEBUFFER_PIXEL_FORMAT,
        struct.pack(">BBH", 2, 0, len(expected_encodings))
        + b"".join(struct.pack(">i", encoding) for encoding in expected_encodings),
        struct.pack(">BBHHHH", 3, 0, 0, 0, 1600, 900),
    ]


def test_rfb_replies_to_server_fence_request():
    class FakeSocket:
        def __init__(self):
            self.sent = []

        async def send(self, message):
            self.sent.append(message)

    desktop = RemoteDesktop("workspace", None)
    desktop.websocket = FakeSocket()

    asyncio.run(desktop._handle_server_message(bytes.fromhex("f8000000800000010101")))

    assert desktop.websocket.sent == [bytes.fromhex("f8000000000000010101")]


def test_rfb_enables_continuous_updates_when_server_announces_support():
    class FakeSocket:
        def __init__(self):
            self.sent = []

        async def send(self, message):
            self.sent.append(message)

    desktop = RemoteDesktop("workspace", None)
    desktop.websocket = FakeSocket()
    desktop.width = 1600
    desktop.height = 900

    asyncio.run(desktop._handle_server_message(b"\x96"))

    assert desktop.websocket.sent == [struct.pack(">BBHHHH", 150, 1, 0, 0, 1600, 900)]
    assert desktop._supports_continuous_updates
    assert desktop._enabled_continuous_updates


def test_rfb_click_waits_before_press_and_holds_button(monkeypatch):
    class FakeSocket:
        def __init__(self):
            self.sent = []

        async def send(self, message):
            self.sent.append(message)

    delays = []

    async def capture_delay(delay):
        delays.append(delay)

    monkeypatch.setattr("app.rfb.asyncio.sleep", capture_delay)

    async def click():
        desktop = RemoteDesktop("workspace", None)
        desktop.websocket = FakeSocket()
        desktop.width = 100
        desktop.height = 80
        await desktop.click(24, 39, rng=random.Random(17))
        return desktop.websocket.sent

    messages = asyncio.run(click())
    assert messages == [
        pointer_event(0, 24, 39),
        pointer_event(1, 24, 39),
        pointer_event(0, 24, 39),
    ]
    assert len(delays) == 2
    assert 0.04 <= delays[0] <= 0.09
    assert 0.05 <= delays[1] <= 0.13


def test_latest_frame_id_rejects_stale_ocr_timestamp(monkeypatch):
    now = datetime.now(timezone.utc)
    row = {
        "content": {
            "frame_id": 641,
            "timestamp": (now - timedelta(seconds=21)).isoformat(),
        }
    }

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [row]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, *_args, **_kwargs):
            return FakeResponse()

    monkeypatch.setattr("app.screen.settings.screenpipe_api_url", "https://screenpipe.example")
    monkeypatch.setattr("app.screen.settings.screenpipe_api_key", "test-key")
    monkeypatch.setattr("app.screen.httpx.AsyncClient", lambda **_kwargs: FakeClient())

    async def check_stale_frame():
        try:
            await latest_frame_id()
        except ScreenpipeFrameStaleError:
            return
        raise AssertionError("stale OCR frame was accepted")

    asyncio.run(check_stale_frame())
    row["content"]["timestamp"] = (datetime.now(timezone.utc) - timedelta(seconds=19)).isoformat()
    assert asyncio.run(latest_frame_id()) == "641"


def test_framebuffer_capture_requests_raw_pixels_and_returns_png():
    class FakeSocket:
        def __init__(self, message):
            self.sent = []
            self.messages = [message]

        async def send(self, message):
            self.sent.append(message)

        async def recv(self):
            if self.messages:
                return self.messages.pop(0)
            await asyncio.Future()

    async def capture():
        raw_pixels = bytes.fromhex(
            "0000ff00"  # red
            "00ff0000"  # green
            "ff000000"  # blue
            "ffffff00"  # white
        )
        update = b"\x96" + (
            b"\x00\x00\x00\x01"
            + struct.pack(">HHHHi", 0, 0, 2, 2, 0)
            + raw_pixels
        )
        desktop = RemoteDesktop("workspace", None)
        desktop.websocket = FakeSocket(update)
        desktop.width = 2
        desktop.height = 2
        desktop._read_buffer = bytearray()
        png = await desktop.capture_framebuffer()
        return png, desktop.websocket.sent

    png, messages = asyncio.run(capture())
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    assert messages == [
        b"\x00\x00\x00\x00" + struct.pack(">BBBBHHHBBB3x", 32, 24, 0, 1, 255, 255, 255, 16, 8, 0),
        struct.pack(">BBHi", 2, 0, 1, 0),
        struct.pack(">BBHHHH", 3, 0, 0, 0, 2, 2),
        struct.pack(">BBHHHH", 150, 1, 0, 0, 2, 2),
    ]

    chunks = []
    cursor = 8
    while cursor < len(png):
        length = int.from_bytes(png[cursor : cursor + 4], "big")
        kind = png[cursor + 4 : cursor + 8]
        data = png[cursor + 8 : cursor + 8 + length]
        chunks.append((kind, data))
        cursor += length + 12
    header = next(data for kind, data in chunks if kind == b"IHDR")
    assert struct.unpack(">II", header[:8]) == (2, 2)
    image_data = zlib.decompress(b"".join(data for kind, data in chunks if kind == b"IDAT"))
    assert image_data == b"\x00\xff\x00\x00\x00\xff\x00\x00\x00\x00\xff\xff\xff\xff"


def test_find_target_merges_phrases_normalizes_accents_and_filters_confidence(monkeypatch):
    elements = [
        {"role": "word", "text": "Se", "bounds": {"left": 0.1, "top": 0.2, "width": 0.025, "height": 0.02}, "confidence": 90},
        {"role": "word", "text": "connecter", "bounds": {"left": 0.13, "top": 0.2, "width": 0.06, "height": 0.02}, "confidence": 80},
        {"role": "word", "text": "Mot", "bounds": {"left": 0.1, "top": 0.25, "width": 0.03, "height": 0.02}, "confidence": 90},
        {"role": "word", "text": "de", "bounds": {"left": 0.135, "top": 0.25, "width": 0.02, "height": 0.02}, "confidence": 90},
        {"role": "word", "text": "passe", "bounds": {"left": 0.16, "top": 0.25, "width": 0.05, "height": 0.02}, "confidence": 90},
        {"role": "word", "text": "connexion", "bounds": {"left": 0.1, "top": 0.3, "width": 0.07, "height": 0.02}, "confidence": 39},
    ]

    async def latest():
        return "frame-1"

    async def frame(_frame_id):
        return elements

    monkeypatch.setattr("app.screen.latest_frame_id", latest)
    monkeypatch.setattr("app.screen.frame_elements", frame)
    target = asyncio.run(find_target("se connecter", screen_size=(1600, 900)))
    assert target is not None
    assert target["text"] == "Se connecter"
    assert target["frame_id"] == "frame-1"
    assert target["bounds_px"] == (160, 180, 144, 18)
    assert asyncio.run(find_target("mot de passe", screen_size=(1600, 900)))["text"] == "Mot de passe"
    assert asyncio.run(find_target("connexion", screen_size=(1600, 900))) is None
    assert asyncio.run(find_target("bouton introuvable", screen_size=(1600, 900))) is None


def test_find_target_maps_real_screenpipe_bounds_to_framebuffer_pixels(monkeypatch):
    elements = [
        {
            "frame_id": 636,
            "source": "ocr",
            "role": "word",
            "text": "Learn",
            "bounds": {
                "left": 0.4675,
                "top": 0.9477777777777778,
                "width": 0.026875,
                "height": 0.013333333333333334,
            },
            "confidence": 96.41,
        },
        {
            "frame_id": 636,
            "source": "ocr",
            "role": "word",
            "text": "more",
            "bounds": {
                "left": 0.49875,
                "top": 0.9511111111111112,
                "width": 0.025,
                "height": 0.01,
            },
            "confidence": 95.7,
        },
    ]

    async def latest():
        return "636"

    async def frame(_frame_id):
        return elements

    monkeypatch.setattr("app.screen.latest_frame_id", latest)
    monkeypatch.setattr("app.screen.frame_elements", frame)
    target = asyncio.run(find_target("Learn more", screen_size=(1600, 900)))
    assert target is not None
    assert target["bounds_px"] == (748, 853, 90, 12)
    assert target["confidence"] == 95.7
