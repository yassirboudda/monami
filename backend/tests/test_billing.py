import pytest
from fastapi.testclient import TestClient

from app import billing, main


@pytest.fixture
def app_state(monkeypatch, tmp_path):
    monkeypatch.setattr(main.settings, "database_path", str(tmp_path / "billing.db"))
    monkeypatch.setattr(main.settings, "seed_demo_data", False)
    monkeypatch.setattr(main.settings, "clerk_secret_key", "sk_test_local")
    current_user = {"user_id": "user_a", "workspace": "user:user_a", "org_id": None, "via": "clerk", "claims": {}}
    main.app.dependency_overrides.clear()
    main.app.dependency_overrides[main.require_user] = lambda: current_user
    yield main.app, current_user
    main.app.dependency_overrides.clear()


@pytest.fixture
def client(app_state):
    app, current_user = app_state
    with TestClient(app) as c:
        yield c, current_user


def shop(marketplace):
    return {"marketplace": marketplace, "displayName": marketplace, "status": "connected", "listingCount": 0}


def test_nothing_gated_until_stripe_is_configured(client):
    c, _ = client
    r = c.get("/v1/billing")
    assert r.status_code == 200
    assert r.json()["billing"]["configured"] is False
    assert r.json()["billing"]["plan"] == "free"
    assert c.post("/v1/shops", json=shop("vinted")).status_code == 200
    assert c.post("/v1/shops", json=shop("ebay")).status_code == 200
    r = c.put("/v1/me/profile", json={"displayName": "A", "preferences": {"inbox": {"autoReply": True}}})
    assert r.status_code == 200
    assert c.get("/v1/agent/policy").json()["policy"]["autoReply"] is True
    assert c.post("/v1/billing/checkout").status_code == 503


def test_free_plan_limits_shops_and_autopilot_when_configured(client, monkeypatch):
    monkeypatch.setattr(main.settings, "stripe_secret_key", "sk_test_x")
    monkeypatch.setattr(main.settings, "stripe_price_pro", "price_x")
    c, current_user = client
    assert c.post("/v1/shops", json=shop("vinted")).status_code == 200
    r = c.post("/v1/shops", json=shop("ebay"))
    assert r.status_code == 402
    assert "Pro" in r.json()["detail"]
    r = c.put("/v1/me/profile", json={"displayName": "A", "preferences": {"inbox": {"autoReply": True}}})
    assert r.status_code == 402
    c.put("/v1/me/profile", json={"displayName": "A", "preferences": {"inbox": {"autoReply": False}}})
    assert c.get("/v1/agent/policy").json()["policy"]["plan"] == "free"

    monkeypatch.setattr(main.settings, "billing_pro_workspaces", "user:user_a")
    assert c.post("/v1/shops", json=shop("ebay")).status_code == 200
    assert c.put("/v1/me/profile", json={"displayName": "A", "preferences": {"inbox": {"autoReply": True}}}).status_code == 200
    b = c.get("/v1/billing").json()["billing"]
    assert b["plan"] == "pro" and b["complimentary"] is True


def test_webhook_rejects_bad_signature_and_applies_subscription(client, monkeypatch):
    c, _ = client
    assert c.post("/v1/billing/webhook", content=b"{}").status_code == 503
    monkeypatch.setattr(main.settings, "stripe_webhook_secret", "whsec_x")
    r = c.post("/v1/billing/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=bad"})
    assert r.status_code == 400

    with main.db.connection() as conn:
        billing._apply_subscription(
            conn,
            {
                "id": "sub_1",
                "customer": "cus_1",
                "status": "active",
                "metadata": {"workspace": "user:user_a"},
                "items": {"data": [{"current_period_end": 1_900_000_000}]},
                "cancel_at_period_end": False,
            },
        )
    b = c.get("/v1/billing").json()["billing"]
    assert b["plan"] == "pro" and b["status"] == "active" and b["currentPeriodEnd"].startswith("2030")
    with main.db.connection() as conn:
        billing._apply_subscription(conn, {"id": "sub_1", "customer": "cus_1", "status": "canceled", "metadata": {}, "items": {"data": []}})
    assert c.get("/v1/billing").json()["billing"]["plan"] == "free"
