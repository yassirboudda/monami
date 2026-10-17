from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def get_doc() -> dict:
    path = Path(__file__).parent / "data" / "marketplaces.json"
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def get_marketplace(mid: str) -> dict | None:
    return next(
        (
            marketplace
            for marketplace in get_doc().get("marketplaces", [])
            if marketplace.get("marketplace_id") == mid
        ),
        None,
    )


def agent_context() -> str:
    doc = get_doc()
    how_to_read = doc.get("how_to_read", {})
    lines = [doc.get("purpose_fr", "")]

    for key in ("coverage", "workflow.required", "workflow.created_by"):
        legend = how_to_read.get(key, {})
        values = "; ".join(f"{value}={description}" for value, description in legend.items())
        lines.append(f"{key}: {values}")
    lines.append(f"confirmation_note_fr: {how_to_read.get('confirmation_note_fr', '')}")

    lines.append("agent_rules:")
    lines.extend(f"- {rule}" for rule in doc.get("agent_rules", []))

    for marketplace in doc.get("marketplaces", []):
        official_api = marketplace.get("official_api") or {}
        api_name = official_api.get("name") or "aucune"
        access = official_api.get("access_fr") or "-"
        lines.append(
            f"## {marketplace.get('name', '')} ({marketplace.get('marketplace_id', '')}) "
            f"— API: {api_name} — accès: {access}"
        )
        for action in marketplace.get("actions", []):
            workflow = action.get("workflow") or {}
            seller_confirmation = action.get("seller_confirmation") or {}
            buyer_confirmation = action.get("buyer_confirmation") or {}
            created_by = workflow.get("created_by") or "-"
            line = (
                f"{action.get('action_id', '')} | {action.get('side', '')} | "
                f"{action.get('coverage', '')} | "
                f"wf={workflow.get('required', '-')}/{created_by} | "
                f"vendeur={seller_confirmation.get('required', '-')} | "
                f"acheteur={buyer_confirmation.get('required', '-')}"
            )
            notes = action.get("notes_fr") or ""
            if notes:
                line += f" | {notes[:120]}"
            lines.append(line)

    return "\n".join(lines)
