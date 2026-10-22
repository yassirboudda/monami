"""Stripe subscriptions: one customer per workspace; Trial / Starter / Pro / Unlimited entitlements + monthly usage metering."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import stripe
from fastapi import HTTPException

from . import db, events
from .settings import settings

# Quotas are per calendar month. desktopMinutes 44640 = 31 days × 24 h (always-on desktop).
PLANS: dict[str, dict[str, Any]] = {
    "trial": {
        "name": "Trial",
        "priceLabel": "$0",
        "desktopMinutes": 30,
        "aiTokens": 100_000,
        "maxShops": 1,
        "autopilot": False,
        "features": ["30 minutes of remote desktop to try it", "Agent chat, 100k AI tokens", "1 connected marketplace", "Approve every reply before it is sent"],
    },
    "starter": {
        "name": "Starter",
        "priceLabel": "$20 / month",
        "desktopMinutes": 600,
        "aiTokens": 500_000,
        "maxShops": 2,
        "autopilot": False,
        "features": ["10 hours of remote desktop per month", "500k AI tokens", "2 marketplaces", "Market prices on every listing"],
    },
    "pro": {
        "name": "Pro",
        "priceLabel": "$100 / month",
        "desktopMinutes": 6_000,
        "aiTokens": 5_000_000,
        "maxShops": 0,  # 0 = unlimited
        "autopilot": True,
        "features": ["100 hours of remote desktop per month", "5M AI tokens", "Unlimited marketplaces", "Inbox autopilot: replies sent for you (within your discount limit)"],
    },
    "unlimited": {
        "name": "Unlimited",
        "priceLabel": "$200 / month",
        "desktopMinutes": 44_640,
        "aiTokens": 25_000_000,
        "maxShops": 0,
        "autopilot": True,
        "features": ["Remote desktop on 24/7, all month", "25M AI tokens", "Unlimited marketplaces + inbox autopilot", "Priority support"],
    },
}
PAID = ("starter", "pro", "unlimited")
ACTIVE = {"active", "trialing", "past_due"}


def _price_ids() -> dict[str, str]:
    """Stripe price → plan. The legacy €9.99 price keeps mapping to "pro"."""
    out = {settings.stripe_price_starter: "starter", settings.stripe_price_pro_usd: "pro",
           settings.stripe_price_unlimited: "unlimited", settings.stripe_price_pro: "pro"}
    return {k: v for k, v in out.items() if k}


def price_for(plan: str) -> str:
    for price, p in _price_ids().items():
        if p == plan and price != settings.stripe_price_pro:
            return price
    return settings.stripe_price_pro if plan == "pro" else ""


def configured() -> bool:
    return bool(settings.stripe_secret_key and any(price_for(p) for p in PAID))


def _client() -> None:
    stripe.api_key = settings.stripe_secret_key


def _complimentary(workspace: str) -> bool:
    return workspace in {w.strip() for w in settings.billing_pro_workspaces.split(",") if w.strip()}


def _row(conn, workspace: str):
    return conn.execute("SELECT * FROM subscriptions WHERE workspace = ?", (workspace,)).fetchone()


def plan_for(conn, workspace: str) -> str:
    if _complimentary(workspace):
        return "unlimited"
    row = _row(conn, workspace)
    if row and row["plan"] in PAID and row["status"] in ACTIVE:
        return row["plan"]
    return "trial"


def entitlements(conn, workspace: str) -> dict[str, Any]:
    """Until Stripe is configured nothing is gated (judges demo, local dev)."""
    plan = plan_for(conn, workspace)
    effective = plan if configured() else "unlimited"
    return {"plan": plan, **{k: v for k, v in PLANS[effective].items() if k in ("maxShops", "autopilot", "desktopMinutes", "aiTokens")}}


# ---------------------------------------------------------------- usage metering (per calendar month)

def _period() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m")


def usage_for(conn, workspace: str) -> dict[str, Any]:
    row = conn.execute("SELECT desktop_seconds, ai_tokens FROM usage WHERE workspace = ? AND period = ?",
                       (workspace, _period())).fetchone()
    return {"period": _period(), "desktopSeconds": row["desktop_seconds"] if row else 0, "aiTokens": row["ai_tokens"] if row else 0}


def record_usage(conn, workspace: str, *, desktop_seconds: int = 0, ai_tokens: int = 0) -> None:
    if not workspace or (desktop_seconds <= 0 and ai_tokens <= 0):
        return
    conn.execute(
        """INSERT INTO usage (workspace, period, desktop_seconds, ai_tokens) VALUES (?, ?, ?, ?)
           ON CONFLICT(workspace, period) DO UPDATE SET
             desktop_seconds = usage.desktop_seconds + excluded.desktop_seconds,
             ai_tokens = usage.ai_tokens + excluded.ai_tokens,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')""",
        (workspace, _period(), max(0, desktop_seconds), max(0, ai_tokens)),
    )
    conn.commit()


def require_desktop_time(conn, workspace: str, seconds: int) -> None:
    """402 when the month's remote-desktop time is used up (trial: 30 minutes)."""
    ent = entitlements(conn, workspace)
    used = usage_for(conn, workspace)["desktopSeconds"]
    quota = int(ent["desktopMinutes"]) * 60
    if used + max(60, seconds // 10) > quota:
        what = "Your 30-minute trial of the remote desktop is over" if ent["plan"] == "trial" else "This month's remote-desktop time is used up"
        raise HTTPException(status_code=402, detail=f"{what}. Choose a plan in Settings → Plan to keep going.")


def require_ai_tokens(conn, workspace: str) -> None:
    ent = entitlements(conn, workspace)
    if usage_for(conn, workspace)["aiTokens"] >= int(ent["aiTokens"]):
        raise HTTPException(status_code=402, detail="This month's AI tokens are used up. Upgrade in Settings → Plan to keep chatting.")


def require_autopilot(conn, workspace: str) -> None:
    if not entitlements(conn, workspace)["autopilot"]:
        raise HTTPException(
            status_code=402,
            detail="Inbox autopilot (replies sent without your approval) comes with the Pro and Unlimited plans. Upgrade in Settings → Plan.",
        )


def check_shop_limit(conn, workspace: str, current_shops: int) -> None:
    ent = entitlements(conn, workspace)
    if ent["maxShops"] and current_shops >= ent["maxShops"]:
        raise HTTPException(
            status_code=402,
            detail=f"Your plan connects {ent['maxShops']} marketplace{'s' if ent['maxShops'] > 1 else ''}. Upgrade in Settings → Plan to connect more.",
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
        "usage": usage_for(conn, workspace),
        "quota": {k: v for k, v in PLANS[plan].items() if k in ("desktopMinutes", "aiTokens", "maxShops", "autopilot")},
        "plans": [{"id": k, **v, "available": k == "trial" or bool(price_for(k))} for k, v in PLANS.items()],
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


def checkout_url(conn, workspace: str, user_id: str, email: str | None, plan: str = "pro") -> str:
    if not configured():
        raise HTTPException(status_code=503, detail="Billing is not configured yet.")
    if plan not in PAID or not price_for(plan):
        raise HTTPException(status_code=400, detail="Unknown plan")
    customer_id = _ensure_customer(conn, workspace, user_id, email)
    _client()
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": price_for(plan), "quantity": 1}],
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
    price_id = ((items[0].get("price") or {}).get("id") if items else None) or ""
    plan = _price_ids().get(price_id, "pro") if status_ in ACTIVE else "trial"
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
    events.emit("billing.subscription", workspace,
                {"plan": plan, "status": status_, "cancelAtPeriodEnd": bool(sub.get("cancel_at_period_end"))})


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
