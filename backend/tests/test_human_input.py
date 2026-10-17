import asyncio
import random

from app.human import HumanProfile, click_point, from_trace, key_delays, move_path, pre_action_delay, typos
from app.rfb import key_event, keysym_for_character, keysym_for_key, pointer_event, vnc_key
from app.screen import find_target


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
    assert pointer_event(1, 0x1234, 0xABCD) == bytes.fromhex("06011234abcd")
    assert key_event(0x010000E9, True) == bytes.fromhex("04010000010000e9")
    assert vnc_key("password") == bytes.fromhex("0e86ceceeef64e26")
    assert keysym_for_character("a") == (ord("a"), False)
    assert keysym_for_character("A") == (ord("a"), True)
    assert keysym_for_character("é") == (0x010000E9, False)
    assert keysym_for_key("Enter") == 0xFF0D
    assert keysym_for_character("\n") == (0xFF0D, False)


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
    target = asyncio.run(find_target("se connecter"))
    assert target is not None
    assert target["text"] == "Se connecter"
    assert target["frame_id"] == "frame-1"
    assert target["bounds_px"] == (160, 180, 144, 18)
    assert asyncio.run(find_target("mot de passe"))["text"] == "Mot de passe"
    assert asyncio.run(find_target("connexion")) is None
    assert asyncio.run(find_target("bouton introuvable")) is None
