import pytest
from fastapi.testclient import TestClient

from app import connectors, main


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(main.settings, "database_path", str(tmp_path / "connectors.db"))
    monkeypatch.setattr(main.settings, "seed_demo_data", False)
    monkeypatch.setattr(main.settings, "clerk_secret_key", "sk_test_local")
    monkeypatch.setattr(main.settings, "app_session_secret", "unit-test-secret")
    current_user = {"user_id": "user_a", "workspace": "user:user_a", "org_id": None, "via": "clerk", "claims": {}}
    main.app.dependency_overrides.clear()
    main.app.dependency_overrides[main.require_user] = lambda: current_user
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()


def test_unconfigured_connector_lists_google_as_coming_soon(client):
    r = client.get("/v1/connectors")
    assert r.status_code == 200
    body = r.json()["connectors"]
    assert body["configured"] is False
    google = body["providers"][0]
    assert google["id"] == "google" and google["connected"] is False
    assert client.post("/v1/connectors/google/start").status_code == 503
    assert client.get("/v1/connectors/google/gmail/search", params={"q": "x"}).status_code == 409


def test_start_builds_google_consent_url_with_signed_state(client, monkeypatch):
    monkeypatch.setattr(main.settings, "google_client_id", "cid.apps.googleusercontent.com")
    monkeypatch.setattr(main.settings, "google_client_secret", "shh")
    url = client.post("/v1/connectors/google/start").json()["url"]
    assert url.startswith(connectors.AUTH_URL)
    assert "client_id=cid.apps.googleusercontent.com" in url
    assert "gmail.modify" in url and "access_type=offline" in url
    state = url.split("state=")[1].split("&")[0]
    assert connectors.verify_state(state)["ws"] == "user:user_a"
    with pytest.raises(Exception):
        connectors.verify_state(state[:-2] + "zz")


def test_callback_stores_encrypted_tokens_and_status_shows_email(client, monkeypatch):
    monkeypatch.setattr(main.settings, "google_client_id", "cid")
    monkeypatch.setattr(main.settings, "google_client_secret", "shh")
    monkeypatch.setattr(connectors, "exchange_code", lambda code: {"access_token": "at", "refresh_token": "rt", "expires_in": 3600, "scope": "email"})
    monkeypatch.setattr(connectors, "userinfo", lambda tok: {"email": "seller@example.com"})
    state = connectors.sign_state("user:user_a", "user_a")
    r = client.get("/v1/connectors/google/callback", params={"code": "abc", "state": state}, follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"].endswith("/dashboard/settings?google=connected")
    google = client.get("/v1/connectors").json()["connectors"]["providers"][0]
    assert google["connected"] is True and google["email"] == "seller@example.com"
    with main.db.connection() as conn:
        row = conn.execute("SELECT token_enc FROM connectors WHERE workspace = ?", ("user:user_a",)).fetchone()
        assert "rt" not in row["token_enc"] and connectors._decrypt(row["token_enc"])["refresh_token"] == "rt"
        assert connectors.access_token(conn, "user:user_a") == "at"
    monkeypatch.setattr(connectors.httpx, "post", lambda *a, **k: type("R", (), {"status_code": 200})())
    assert client.delete("/v1/connectors/google").json()["removed"] is True
    assert client.get("/v1/connectors").json()["connectors"]["providers"][0]["connected"] is False


def test_bad_state_redirects_with_error(client, monkeypatch):
    monkeypatch.setattr(main.settings, "google_client_id", "cid")
    monkeypatch.setattr(main.settings, "google_client_secret", "shh")
    r = client.get("/v1/connectors/google/callback", params={"code": "abc", "state": "nope.nope"}, follow_redirects=False)
    assert r.status_code == 302 and "google=error" in r.headers["location"]
