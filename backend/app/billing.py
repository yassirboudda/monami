"""Stripe subscriptions: one customer per workspace, Free vs Pro entitlements."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import stripe
from fastapi import HTTPException

from . import db
from .settings import settings

PLANS: dict[str, dict[str, Any]] = {
    "free": {
        "name": "Free",
        "priceLabel": "€0",
        "maxShops": 1,
        "autopilot": False,
        "features": ["1 connected marketplace", "Agent chat + remote desktop", "Approve every reply before it is sent"],
    },
    "pro": {
        "name": "Pro",
        "priceLabel": "€9.99 / month",
        "maxShops": 0,  # 0 = unlimited
        "autopilot": True,
        "features": ["Unlimited marketplaces", "Inbox autopilot: replies sent for you (within your discount limit)", "Dedicated desktop profile", "Priority support"],
    },
}
ACTIVE = {"active", "trialing", "past_due"}


def configured() -> bool:
    return bool(settings.stripe_secret_key and settings.stripe_price_pro)


def _client() -> None:
    stripe.api_key = settings.stripe_secret_key


def _complimentary(workspace: str) -> bool:
    return workspace in {w.strip() for w in settings.billing_pro_workspaces.split(",") if w.strip()}


def _row(conn, workspace: str):
    return conn.execute("SELECT * FROM subscriptions WHERE workspace = ?", (workspace,)).fetchone()


def plan_for(conn, workspace: str) -> str:
    if _complimentary(workspace):
        return "pro"
    row = _row(conn, workspace)
    if row and row["plan"] == "pro" and row["status"] in ACTIVE:
        return "pro"
    return "free"


def entitlements(conn, workspace: str) -> dict[str, Any]:
    """Until Stripe is configured nothing is gated (judges demo, local dev)."""
    plan = plan_for(conn, workspace)
    effective = plan if configured() else "pro"
    return {"plan": plan, **{k: v for k, v in PLANS[effective].items() if k in ("maxShops", "autopilot")}}


def require_autopilot(conn, workspace: str) -> None:
    if not entitlements(conn, workspace)["autopilot"]:
        raise HTTPException(
            status_code=402,
            detail="Inbox autopilot (replies sent without your approval) is a Pro feature. Upgrade in Settings → Plan.",
        )


def check_shop_limit(conn, workspace: str, current_shops: int) -> None:
    ent = entitlements(conn, workspace)
    if ent["maxShops"] and current_shops >= ent["maxShops"]:
        raise HTTPException(
            status_code=402,
            detail=f"The Free plan connects {ent['maxShops']} marketplace. Upgrade to Pro in Settings → Plan to connect more.",
        )


def status(conn, workspace: str) -> dict[str, Any]:
    row = _row(conn, workspace)
    plan = plan_for(conn, workspace)
    return {
        "configured": configured(),
        "plan": plan,
        "complimentary": _complimentary(workspace),
        "status": row["status"] if row else "none",
        "currentPeriodEnd": row["current_period_end"] if row else None,
        "cancelAtPeriodEnd": bool(row["cancel_at_period_end"]) if row else False,
        "hasCustomer": bool(row and row["stripe_customer_id"]),
        "plans": [{"id": k, **v} for k, v in PLANS.items()],
    }


def _ensure_customer(conn, workspace: str, user_id: str, email: str | None) -> str:
    row = _row(conn, workspace)
    if row and row["stripe_customer_id"]:
        return row["stripe_customer_id"]
    _client()
    customer = stripe.Customer.create(
        email=email or None,
        metadata={"workspace": workspace, "user_id": user_id},
    )
    conn.execute(
        """INSERT INTO subscriptions (workspace, stripe_customer_id) VALUES (?, ?)
           ON CONFLICT(workspace) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id""",
        (workspace, customer.id),
    )
    conn.commit()
    return customer.id


def checkout_url(conn, workspace: str, user_id: str, email: str | None) -> str:
    if not configured():
        raise HTTPException(status_code=503, detail="Billing is not configured yet.")
    customer_id = _ensure_customer(conn, workspace, user_id, email)
    _client()
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": settings.stripe_price_pro, "quantity": 1}],
        success_url=f"{settings.app_url}/dashboard/settings?billing=success",
        cancel_url=f"{settings.app_url}/dashboard/settings?billing=cancel",
        allow_promotion_codes=True,
        subscription_data={"metadata": {"workspace": workspace}},
        metadata={"workspace": workspace},
    )
    return session.url


def portal_url(conn, workspace: str) -> str:
    if not configured():
        raise HTTPException(status_code=503, detail="Billing is not configured yet.")
    row = _row(conn, workspace)
    if not row or not row["stripe_customer_id"]:
        raise HTTPException(status_code=404, detail="No billing account yet.")
    _client()
    session = stripe.billing_portal.Session.create(
        customer=row["stripe_customer_id"],
        return_url=f"{settings.app_url}/dashboard/settings",
    )
    return session.url


def _iso(ts: int | None) -> str | None:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z") if ts else None


def _apply_subscription(conn, sub: dict[str, Any]) -> None:
    customer_id = sub["customer"] if isinstance(sub["customer"], str) else sub["customer"]["id"]
    workspace = (sub.get("metadata") or {}).get("workspace")
    if not workspace:
        row = conn.execute(
            "SELECT workspace FROM subscriptions WHERE stripe_customer_id = ?", (customer_id,)
        ).fetchone()
        workspace = row["workspace"] if row else None
    if not workspace:
        return
    status_ = sub["status"]
    items = (sub.get("items") or {}).get("data") or []
    period_end = items[0].get("current_period_end") if items else sub.get("current_period_end")
    plan = "pro" if status_ in ACTIVE else "free"
    conn.execute(
        """INSERT INTO subscriptions (workspace, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(workspace) DO UPDATE SET
             stripe_customer_id = excluded.stripe_customer_id,
             stripe_subscription_id = excluded.stripe_subscription_id,
             plan = excluded.plan, status = excluded.status,
             current_period_end = excluded.current_period_end,
             cancel_at_period_end = excluded.cancel_at_period_end,
             updated_at = excluded.updated_at""",
        (
            workspace,
            customer_id,
            sub["id"],
            plan,
            status_,
            _iso(period_end),
            1 if sub.get("cancel_at_period_end") else 0,
            datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z"),
        ),
    )
    conn.commit()


def handle_webhook(payload: bytes, signature: str | None) -> dict[str, Any]:
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured.")
    try:
        event = stripe.Webhook.construct_event(payload, signature or "", settings.stripe_webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid Stripe signature.")
    obj = event["data"]["object"]
    with db.connection() as conn:
        if event["type"] in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
            _apply_subscription(conn, obj)
        elif event["type"] == "checkout.session.completed" and obj.get("mode") == "subscription" and obj.get("subscription"):
            _client()
            _apply_subscription(conn, stripe.Subscription.retrieve(obj["subscription"]))
    return {"received": True, "type": event["type"]}
