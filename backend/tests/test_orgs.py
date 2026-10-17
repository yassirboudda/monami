import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import db, main


@pytest.fixture
def app_state(monkeypatch, tmp_path):
    monkeypatch.setattr(main.settings, "database_path", str(tmp_path / "stockflow.db"))
    monkeypatch.setattr(main.settings, "clerk_secret_key", "sk_test_local")
    main._organization_names.clear()
    current_user = {
        "user_id": "user_a",
        "workspace": "user:user_a",
        "org_id": None,
        "via": "clerk",
        "claims": {},
    }
    main.app.dependency_overrides.clear()
    main.app.dependency_overrides[main.require_user] = lambda: current_user
    yield main.app, current_user
    main.app.dependency_overrides.clear()


@pytest.fixture
def client(app_state):
    app, current_user = app_state
    with TestClient(app) as test_client:
        yield test_client, current_user


def assume_user(current_user, user_id, org_id=None):
    current_user.clear()
    current_user.update(
        {
            "user_id": user_id,
            "workspace": f"org:{org_id}" if org_id else f"user:{user_id}",
            "org_id": org_id,
            "via": "clerk",
            "claims": {},
        }
    )


def test_personal_and_organization_workspaces_are_isolated(client):
    test_client, current_user = client
    private_item = test_client.post(
        "/v1/stock",
        json={"title": "Personnel A", "qty": 1},
    ).json()["item"]
    assert len(test_client.get("/v1/shops").json()["shops"]) == 2

    assume_user(current_user, "user_a", "org_x")
    assert test_client.get("/v1/stock").json()["items"] == []
    assert test_client.get("/v1/shops").json()["shops"] == []
    assert test_client.get("/v1/listings").json()["listings"] == []
    test_client.post("/v1/stock", json={"title": "Stock org X", "qty": 2})

    assume_user(current_user, "user_a")
    personal_items = test_client.get("/v1/stock").json()["items"]
    assert any(item["id"] == private_item["id"] for item in personal_items)
    assert not any(item["title"] == "Stock org X" for item in personal_items)


def test_organization_members_share_data_but_not_personal_data(client):
    test_client, current_user = client
    personal_item = test_client.post(
        "/v1/stock",
        json={"title": "Privé de A", "qty": 3},
    ).json()["item"]

    assume_user(current_user, "user_a", "org_x")
    created_shop = test_client.post(
        "/v1/shops",
        json={"marketplace": "vinted", "displayName": "Boutique commune"},
    ).json()["shop"]
    shared_item = test_client.post(
        "/v1/stock",
        json={"title": "Article partagé", "qty": 4},
    ).json()["item"]
    workflow = test_client.get("/v1/workflows").json()["workflows"][0]
    test_client.patch(f"/v1/workflows/{workflow['id']}", json={"enabled": True})

    assume_user(current_user, "user_b", "org_x")
    assert created_shop["id"] in [shop["id"] for shop in test_client.get("/v1/shops").json()["shops"]]
    assert shared_item["id"] in [item["id"] for item in test_client.get("/v1/stock").json()["items"]]
    assert test_client.get("/v1/workflows").json()["workflows"][0]["enabled"] is True

    assume_user(current_user, "user_b")
    personal_items = test_client.get("/v1/stock").json()["items"]
    assert all(item["id"] != personal_item["id"] for item in personal_items)
    assert all(item["id"] != shared_item["id"] for item in personal_items)


def test_workflow_toggle_is_persistent_and_scoped(client):
    test_client, current_user = client
    assume_user(current_user, "user_a", "org_x")
    workflow_id = test_client.get("/v1/workflows").json()["workflows"][0]["id"]
    assert test_client.patch(
        f"/v1/workflows/{workflow_id}",
        json={"enabled": True},
    ).json()["workflow"]["enabled"] is True

    assume_user(current_user, "user_b", "org_x")
    assert test_client.get("/v1/workflows").json()["workflows"][0]["enabled"] is True

    assume_user(current_user, "user_b", "org_y")
    assert test_client.get("/v1/workflows").json()["workflows"][0]["enabled"] is False


def test_patch_and_delete_reject_rows_from_another_workspace(client):
    test_client, current_user = client
    item = test_client.post("/v1/stock", json={"title": "Privé", "qty": 1}).json()["item"]
    shop = test_client.post(
        "/v1/shops",
        json={"marketplace": "vinted", "displayName": "Privée"},
    ).json()["shop"]

    assume_user(current_user, "user_b")
    assert test_client.patch(f"/v1/stock/{item['id']}", json={"qty": 9}).status_code == 404
    assert test_client.delete(f"/v1/stock/{item['id']}").status_code == 404
    assert test_client.patch(f"/v1/shops/{shop['id']}", json={"status": "expired"}).status_code == 404
    assert test_client.delete(f"/v1/shops/{shop['id']}").status_code == 404


def test_invite_links_require_an_org_and_accept_with_admin_role(client, monkeypatch):
    test_client, current_user = client
    assert test_client.post("/v1/org/invite-links").status_code == 400

    assume_user(current_user, "owner", "org_x")
    calls = []

    async def fake_clerk_api(method, path, body=None):
        calls.append((method, path, body))
        if method == "GET":
            if path == "/users/owner":
                return 200, {"email_addresses": [{"email_address": "YassirBoudda@gmail.com"}]}
            return 200, {"id": "org_x", "name": "Atelier partagé"}
        if method == "POST":
            return 422, {
                "errors": [{"code": "already_a_member_in_organization"}],
            }
        return 200, {"public_metadata": {"stockflow_access": True}}

    monkeypatch.setattr(main, "_clerk_api", fake_clerk_api)
    created_response = test_client.post("/v1/org/invite-links")
    assert created_response.status_code == 200
    created = created_response.json()
    assert created["token"].startswith("inv_")
    assert created["path"] == f"/join/{created['token']}"
    info = test_client.get(f"/v1/invites/{created['token']}")
    assert info.status_code == 200
    assert info.json() == {
        "orgId": "org_x",
        "orgName": "Atelier partagé",
        "expiresAt": created["expiresAt"],
    }

    assume_user(current_user, "member_b")
    accepted = test_client.post(f"/v1/invites/{created['token']}/accept")
    assert accepted.status_code == 200
    assert accepted.json() == {"orgId": "org_x"}
    assert calls[-2:] == [
        (
            "POST",
            "/organizations/org_x/memberships",
            {"user_id": "member_b", "role": "org:admin"},
        ),
        (
            "PATCH",
            "/users/member_b/metadata",
            {"public_metadata": {"stockflow_access": True}},
        ),
    ]


@pytest.mark.parametrize(
    ("clerk_user", "expected_status"),
    [
        ({"email_addresses": [{"email_address": "INVITER@example.com"}]}, 200),
        ({"public_metadata": {"stockflow_access": True}}, 200),
        ({"email_addresses": [{"email_address": "other@example.com"}]}, 403),
    ],
)
def test_invite_link_creation_requires_stockflow_access(
    client,
    monkeypatch,
    clerk_user,
    expected_status,
):
    test_client, current_user = client
    assume_user(current_user, "owner", "org_x")
    monkeypatch.setattr(main.settings, "poc_allowed_emails", " inviter@example.com, teammate@example.com ")

    async def fake_clerk_api(method, path, body=None):
        assert method == "GET"
        assert path == "/users/owner"
        return 200, clerk_user

    monkeypatch.setattr(main, "_clerk_api", fake_clerk_api)
    response = test_client.post("/v1/org/invite-links")
    assert response.status_code == expected_status
    if expected_status == 403:
        assert response.json()["detail"] == "Accès Stockflow requis pour inviter"
    else:
        assert response.json()["token"].startswith("inv_")


def test_invite_link_clerk_lookup_errors_return_bad_gateway(client, monkeypatch):
    test_client, current_user = client
    assume_user(current_user, "owner", "org_x")

    async def fake_clerk_api(_method, _path, _body=None):
        return 500, {"errors": []}

    monkeypatch.setattr(main, "_clerk_api", fake_clerk_api)
    response = test_client.post("/v1/org/invite-links")
    assert response.status_code == 502


def test_invites_return_not_found_and_gone_for_unknown_or_expired_tokens(client):
    test_client, current_user = client
    assert test_client.get("/v1/invites/not-a-token").status_code == 404
    expired = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace("+00:00", "Z")
    with db.connection() as conn:
        conn.execute(
            """INSERT INTO invite_links (token, org_id, created_by, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?)""",
            ("inv_expired", "org_x", "owner", expired, expired),
        )
    assert test_client.get("/v1/invites/inv_expired").status_code == 410


def test_data_survives_recreating_the_app_client(app_state):
    app, current_user = app_state
    with TestClient(app) as first_client:
        result = first_client.post(
            "/v1/stock",
            json={"title": "Persistant", "qty": 2},
        ).json()["item"]

    with TestClient(app) as next_client:
        items = next_client.get("/v1/stock").json()["items"]
    assert any(item["id"] == result["id"] for item in items)
    assert current_user["workspace"] == "user:user_a"


@pytest.mark.parametrize(
    ("claims", "expected_workspace", "expected_org"),
    [
        ({"sub": "user_a", "o": {"id": "org_v2"}}, "org:org_v2", "org_v2"),
        ({"sub": "user_a", "org_id": "org_v1"}, "org:org_v1", "org_v1"),
        ({"sub": "user_a"}, "user:user_a", None),
    ],
)
def test_require_user_derives_workspace_from_clerk_claims(
    claims,
    expected_workspace,
    expected_org,
    monkeypatch,
):
    async def fake_jwks():
        return [{"kid": "test"}]

    token = main.jwt.encode({"sub": "unused"}, "secret", algorithm="HS256", headers={"kid": "test"})
    monkeypatch.setattr(main, "_jwks", fake_jwks)
    monkeypatch.setattr(main.jwk, "construct", lambda *_args: "test-key")
    monkeypatch.setattr(main.jwt, "decode", lambda *_args, **_kwargs: claims)
    user = asyncio.run(main.require_user(f"Bearer {token}"))
    assert user["workspace"] == expected_workspace
    assert user["org_id"] == expected_org
