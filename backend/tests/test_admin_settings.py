"""Teste pentru /api/admin/settings (GET listă, PUT upsert, cheie necunoscută, RBAC)."""

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_get_settings_admin_listeaza(admin_client):
    r = await admin_client.get("/api/admin/settings")
    assert r.status_code == 200
    keys = {s["key"] for s in r.json()}
    assert "analytics.min_sessions" in keys
    assert "ai.advisor_prompt" in keys
    # Fără nimic salvat → toate sunt default.
    assert all(s["is_default"] for s in r.json())


async def test_put_cheie_cunoscuta_seteaza(admin_client):
    r = await admin_client.put(
        "/api/admin/settings/analytics.min_sessions", json={"value": 250}
    )
    assert r.status_code == 204

    r2 = await admin_client.get("/api/admin/settings")
    row = next(s for s in r2.json() if s["key"] == "analytics.min_sessions")
    assert row["value"] == 250
    assert row["is_default"] is False
    assert row["updated_at"] is not None


async def test_put_cheie_necunoscuta_404(admin_client):
    r = await admin_client.put(
        "/api/admin/settings/cheie.inexistenta", json={"value": 1}
    )
    assert r.status_code == 404


async def test_get_settings_non_admin_403(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await c.get("/api/admin/settings")
    assert r.status_code == 403


async def test_put_settings_non_admin_403(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await c.put(
        "/api/admin/settings/analytics.min_sessions", json={"value": 5}
    )
    assert r.status_code == 403


async def test_settings_fara_auth_401(client):
    client.cookies.clear()
    r = await client.get("/api/admin/settings")
    assert r.status_code == 401
