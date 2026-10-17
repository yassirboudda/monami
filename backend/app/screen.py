from __future__ import annotations

import unicodedata
from typing import Any
from urllib.parse import quote

import httpx

from .settings import settings


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.screenpipe_api_key}"}


async def latest_frame_id() -> str | None:
    if not settings.screenpipe_api_url or not settings.screenpipe_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                f"{settings.screenpipe_api_url.rstrip('/')}/search",
                headers=_headers(),
                params={"content_type": "ocr", "limit": 1},
            )
            response.raise_for_status()
            rows = response.json().get("data") or []
        if not rows:
            return None
        content = rows[0].get("content") or {}
        frame_id = content.get("frame_id") or rows[0].get("frame_id")
        return str(frame_id) if frame_id is not None else None
    except (httpx.HTTPError, ValueError, TypeError):
        return None


async def frame_elements(frame_id: str) -> list[dict[str, Any]]:
    if not settings.screenpipe_api_url or not settings.screenpipe_api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                f"{settings.screenpipe_api_url.rstrip('/')}/frames/{quote(str(frame_id), safe='')}/elements",
                headers=_headers(),
            )
            response.raise_for_status()
            payload = response.json()
        elements = payload if isinstance(payload, list) else payload.get("data", payload.get("elements", []))
        return [element for element in elements if isinstance(element, dict)] if isinstance(elements, list) else []
    except (httpx.HTTPError, ValueError, TypeError):
        return []


def _normalise(value: Any) -> str:
    decomposed = unicodedata.normalize("NFKD", str(value or "").casefold())
    unaccented = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(unaccented.split())


def _bounds(
    element: dict[str, Any],
    screen_size: tuple[int, int] | None,
) -> tuple[float, float, float, float] | None:
    raw = element.get("bounds") or element.get("bounds_px")
    if isinstance(raw, dict):
        try:
            left = float(raw.get("left", raw.get("x", 0)))
            top = float(raw.get("top", raw.get("y", 0)))
            width = float(raw.get("width", 0))
            height = float(raw.get("height", 0))
        except (TypeError, ValueError):
            return None
        if max(abs(left), abs(top), abs(width), abs(height)) <= 1.01:
            if screen_size is None:
                return None
            screen_width, screen_height = screen_size
            return left * screen_width, top * screen_height, width * screen_width, height * screen_height
        return left, top, width, height
    if isinstance(raw, (list, tuple)) and len(raw) == 4:
        try:
            return tuple(float(value) for value in raw)  # type: ignore[return-value]
        except (TypeError, ValueError):
            return None
    return None


def _candidate(
    elements: list[dict[str, Any]],
    frame_id: str,
    indices: list[int],
    target_bounds: list[tuple[float, float, float, float]],
) -> dict[str, Any] | None:
    texts = [str(elements[index].get("text") or "").strip() for index in indices]
    text = " ".join(part for part in texts if part)
    if not text:
        return None
    left = min(bounds[0] for bounds in target_bounds)
    top = min(bounds[1] for bounds in target_bounds)
    right = max(bounds[0] + bounds[2] for bounds in target_bounds)
    bottom = max(bounds[1] + bounds[3] for bounds in target_bounds)
    try:
        confidence = min(float(elements[index].get("confidence", 0) or 0) for index in indices)
    except (TypeError, ValueError):
        confidence = 0
    return {
        "text": text,
        "bounds_px": (round(left), round(top), round(right - left), round(bottom - top)),
        "confidence": confidence,
        "frame_id": frame_id,
        "role": elements[indices[0]].get("role"),
    }


def _candidates(
    elements: list[dict[str, Any]],
    frame_id: str,
    screen_size: tuple[int, int] | None,
) -> list[dict[str, Any]]:
    usable: list[tuple[int, dict[str, Any], tuple[float, float, float, float]]] = []
    for index, element in enumerate(elements):
        bounds = _bounds(element, screen_size)
        if not bounds or bounds[2] <= 0 or bounds[3] <= 0 or not str(element.get("text") or "").strip():
            continue
        usable.append((index, element, bounds))
    result: list[dict[str, Any]] = []
    for index, element, bounds in usable:
        item = _candidate(elements, frame_id, [index], [bounds])
        if item is not None:
            result.append(item)

    lines: list[list[tuple[int, dict[str, Any], tuple[float, float, float, float]]]] = []
    for entry in sorted(usable, key=lambda item: (item[2][1], item[2][0])):
        bounds = entry[2]
        line = next(
            (
                items for items in lines
                if abs(bounds[1] - items[0][2][1]) <= max(14, 0.45 * max(bounds[3], items[0][2][3]))
            ),
            None,
        )
        if line is None:
            lines.append([entry])
        else:
            line.append(entry)

    for line in lines:
        line.sort(key=lambda item: item[2][0])
        for start in range(len(line)):
            indices = [line[start][0]]
            boxes = [line[start][2]]
            for next_index in range(start + 1, len(line)):
                previous = boxes[-1]
                current = line[next_index][2]
                gap = current[0] - (previous[0] + previous[2])
                if gap > max(24, 1.5 * max(previous[3], current[3])):
                    break
                indices.append(line[next_index][0])
                boxes.append(current)
                item = _candidate(elements, frame_id, indices, boxes)
                if item is not None:
                    result.append(item)
    return result


def _inside(bounds: tuple[int, int, int, int], within: Any) -> bool:
    if within is None:
        return True
    if isinstance(within, dict):
        within = within.get("bounds_px") or within.get("bounds")
    if isinstance(within, dict):
        x, y, width, height = (within.get(key) for key in ("left", "top", "width", "height"))
    elif isinstance(within, (tuple, list)) and len(within) == 4:
        x, y, width, height = within
    else:
        return False
    center_x = bounds[0] + bounds[2] / 2
    center_y = bounds[1] + bounds[3] / 2
    try:
        return float(x) <= center_x <= float(x) + float(width) and float(y) <= center_y <= float(y) + float(height)
    except (TypeError, ValueError):
        return False


async def find_target(
    text: str,
    role: str | None = None,
    within: Any = None,
    screen_size: tuple[int, int] | None = None,
) -> dict[str, Any] | None:
    target = _normalise(text)
    if not target:
        return None
    frame_id = await latest_frame_id()
    if frame_id is None:
        return None
    elements = await frame_elements(frame_id)
    matches: list[tuple[int, float, dict[str, Any]]] = []
    for candidate in _candidates(elements, frame_id, screen_size):
        normalized = _normalise(candidate["text"])
        confidence = candidate["confidence"]
        if confidence < 40 or not _inside(candidate["bounds_px"], within):
            continue
        if role and candidate.get("role") != role:
            continue
        if normalized == target:
            score = 3
        elif normalized.startswith(target):
            score = 2
        elif target in normalized:
            score = 1
        else:
            continue
        matches.append((score, confidence, candidate))
    if not matches:
        return None
    best = max(matches, key=lambda match: (match[0], match[1], -len(match[2]["text"])))
    return {key: value for key, value in best[2].items() if key != "role"}
