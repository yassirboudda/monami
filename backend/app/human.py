from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass
from datetime import datetime
from statistics import median
from typing import Any


@dataclass(frozen=True)
class HumanProfile:
    seed: int
    pace: float
    type_wpm: float
    jitter: float
    overshoot_chance: float
    typo_chance: float


def _timestamp(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def from_trace(user_id: str, trace: dict[str, Any]) -> HumanProfile:
    seed = int.from_bytes(hashlib.blake2b(user_id.encode(), digest_size=8).digest(), "big")
    timestamps = [
        stamp
        for event in trace.get("events", [])
        if isinstance(event, dict)
        if (stamp := _timestamp(event.get("t"))) is not None
    ]
    gaps = [max(0.0, later - earlier) for earlier, later in zip(timestamps, timestamps[1:])]
    pace = min(8.0, max(0.6, median(gaps))) if len(timestamps) >= 2 else 2.0
    type_wpm = min(420.0, max(120.0, 420.0 - (pace - 0.6) * (300.0 / 7.4)))
    rng = random.Random(seed)
    # Screenpipe has no click or keystroke data; this profile uses screen-change pacing only.
    return HumanProfile(
        seed=seed,
        pace=pace,
        type_wpm=type_wpm,
        jitter=rng.uniform(0.08, 0.22),
        overshoot_chance=rng.uniform(0.04, 0.16),
        typo_chance=rng.uniform(0.0, 0.03),
    )


def click_point(bounds_px: tuple[float, float, float, float], rng: random.Random) -> tuple[int, int]:
    x, y, width, height = bounds_px
    if width <= 0 or height <= 0:
        raise ValueError("La cible doit avoir une largeur et une hauteur positives")
    left, right = x + width * 0.1, x + width * 0.9
    top, bottom = y + height * 0.1, y + height * 0.9
    point_x = round(min(right, max(left, rng.gauss(x + width / 2, width * 0.18))))
    point_y = round(min(bottom, max(top, rng.gauss(y + height / 2, height * 0.18))))
    center_x, center_y = round(x + width / 2), round(y + height / 2)
    if point_x == center_x and point_y == center_y:
        if point_x < round(right):
            point_x += 1
        elif point_x > round(left):
            point_x -= 1
        elif point_y < round(bottom):
            point_y += 1
        else:
            point_y -= 1
    return point_x, point_y


def _ease_in_out(value: float) -> float:
    return value * value * (3 - 2 * value)


def _delay(rng: random.Random, profile: HumanProfile) -> float:
    return min(0.022, max(0.006, rng.uniform(0.006, 0.022) * (1 + rng.uniform(-profile.jitter, profile.jitter))))


def move_path(
    start: tuple[float, float],
    end: tuple[float, float],
    rng: random.Random,
    profile: HumanProfile,
) -> list[tuple[float, float, float]]:
    start_x, start_y = start
    end_x, end_y = end
    dx, dy = end_x - start_x, end_y - start_y
    distance = math.hypot(dx, dy)
    if distance == 0:
        return [(start_x, start_y, _delay(rng, profile)), (end_x, end_y, _delay(rng, profile))]

    perpendicular = (-dy / distance, dx / distance)
    scale = distance * rng.uniform(0.08, 0.2)
    bias_a = rng.uniform(-scale, scale)
    bias_b = rng.uniform(-scale, scale)
    control_a = (start_x + dx * 0.28 + perpendicular[0] * bias_a, start_y + dy * 0.28 + perpendicular[1] * bias_a)
    control_b = (start_x + dx * 0.72 + perpendicular[0] * bias_b, start_y + dy * 0.72 + perpendicular[1] * bias_b)
    overshoot = rng.random() < profile.overshoot_chance
    overshoot_distance = min(18.0, max(2.0, distance * rng.uniform(0.015, 0.04))) if overshoot else 0.0
    path_end = (end_x + dx / distance * overshoot_distance, end_y + dy / distance * overshoot_distance)
    correction_steps = rng.randint(3, 5) if overshoot else 0
    steps = rng.randint(14, 28 - correction_steps)
    points: list[tuple[float, float, float]] = []
    for index in range(steps):
        t = _ease_in_out(index / (steps - 1))
        inverse = 1 - t
        px = inverse**3 * start_x + 3 * inverse**2 * t * control_a[0] + 3 * inverse * t**2 * control_b[0] + t**3 * path_end[0]
        py = inverse**3 * start_y + 3 * inverse**2 * t * control_a[1] + 3 * inverse * t**2 * control_b[1] + t**3 * path_end[1]
        points.append((px, py, _delay(rng, profile)))
    if overshoot:
        for index in range(1, correction_steps + 1):
            t = index / correction_steps
            points.append(
                (
                    path_end[0] + (end_x - path_end[0]) * t,
                    path_end[1] + (end_y - path_end[1]) * t,
                    _delay(rng, profile),
                )
            )
    points[-1] = (end_x, end_y, points[-1][2])
    return points


def key_delays(text: str, rng: random.Random, profile: HumanProfile) -> list[float]:
    average = 60.0 / max(1.0, profile.type_wpm)
    sigma = 0.24
    next_thinking_pause = rng.randint(15, 40)
    delays: list[float] = []
    for index, char in enumerate(text, start=1):
        delay = rng.lognormvariate(math.log(average), sigma)
        if char == " ":
            delay *= 1.35
        elif char in ".,!?;":
            delay *= 1.8
        if index == next_thinking_pause:
            delay += rng.uniform(0.3, 0.9)
            next_thinking_pause += rng.randint(15, 40)
        delays.append(delay)
    return delays


_KEYBOARD_ROWS = ("1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm")


def _adjacent_key(char: str, rng: random.Random) -> str | None:
    lower = char.lower()
    for row in _KEYBOARD_ROWS:
        index = row.find(lower)
        if index < 0:
            continue
        neighbors = row[max(0, index - 1):index] + row[index + 1:index + 2]
        if not neighbors:
            return None
        wrong = rng.choice(neighbors)
        return wrong.upper() if char.isupper() else wrong
    return None


def typos(text: str, rng: random.Random, profile: HumanProfile) -> list[tuple[str, bool]]:
    result: list[tuple[str, bool]] = []
    for char in text:
        wrong = _adjacent_key(char, rng) if rng.random() < min(0.03, max(0.0, profile.typo_chance)) else None
        if wrong is not None:
            result.append((wrong, False))
        result.append((char, True))
    return result


def pre_action_delay(rng: random.Random, profile: HumanProfile) -> float:
    return rng.uniform(0.4 * profile.pace, 1.8 * profile.pace)
