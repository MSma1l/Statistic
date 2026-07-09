"""Teste de integrare pentru rutele /auth."""

import pytest

from app.config import settings

pytestmark = pytest.mark.asyncio(loop_scope="session")


# --- Login --------------------------------------------------------------------
async def test_login_corect_seteaza_cookie(client, make_user):
    await make_user("ok@x.com", password="parola123")
    r = await client.post(
        "/auth/login", json={"email": "ok@x.com", "password": "parola123"}
    )
    assert r.status_code == 200
    assert r.json()["email"] == "ok@x.com"
    assert settings.COOKIE_NAME in r.cookies


async def test_login_email_case_insensitive(client, make_user):
    await make_user("mixed@x.com", password="parola123")
    r = await client.post(
        "/auth/login", json={"email": "MIXED@X.COM", "password": "parola123"}
    )
    assert r.status_code == 200


async def test_login_parola_gresita_401(client, make_user):
    await make_user("wrong@x.com", password="parola123")
    r = await client.post(
        "/auth/login", json={"email": "wrong@x.com", "password": "gresita"}
    )
    assert r.status_code == 401


async def test_login_user_inexistent_401(client):
    r = await client.post(
        "/auth/login", json={"email": "nimeni@x.com", "password": "orice12"}
    )
    assert r.status_code == 401


async def test_login_cont_inactiv_403(client, make_user):
    await make_user("inactiv@x.com", password="parola123", is_active=False)
    r = await client.post(
        "/auth/login", json={"email": "inactiv@x.com", "password": "parola123"}
    )
    assert r.status_code == 403


# --- /auth/me -----------------------------------------------------------------
async def test_me_fara_cookie_401(client):
    r = await client.get("/auth/me")
    assert r.status_code == 401


async def test_me_cu_cookie_ok(auth_client_factory, make_user):
    u = await make_user("me@x.com")
    c = auth_client_factory(u)
    r = await c.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == "me@x.com"


async def test_me_cookie_invalid_401(client):
    client.cookies.update({settings.COOKIE_NAME: "token-invalid"})
    r = await client.get("/auth/me")
    assert r.status_code == 401


# --- Logout -------------------------------------------------------------------
async def test_logout(client):
    r = await client.post("/auth/logout")
    assert r.status_code == 200


# --- CRUD utilizatori (doar admin) --------------------------------------------
async def test_list_users_doar_admin(auth_client_factory, admin_client, admin, user):
    r = await admin_client.get("/auth/users")
    assert r.status_code == 200
    assert len(r.json()) >= 2

    c = auth_client_factory(user)
    r2 = await c.get("/auth/users")
    assert r2.status_code == 403


async def test_creare_user_de_catre_admin(admin_client):
    r = await admin_client.post(
        "/auth/users",
        json={"email": "nou@x.com", "full_name": "Nou", "password": "parola123"},
    )
    assert r.status_code == 201
    assert r.json()["email"] == "nou@x.com"


async def test_creare_user_email_duplicat_409(admin_client, make_user):
    await make_user("dup@x.com")
    r = await admin_client.post(
        "/auth/users", json={"email": "dup@x.com", "password": "parola123"}
    )
    assert r.status_code == 409


async def test_creare_user_parola_prea_scurta_422(admin_client):
    r = await admin_client.post(
        "/auth/users", json={"email": "scurt@x.com", "password": "abc"}
    )
    assert r.status_code == 422


async def test_creare_user_de_non_admin_403(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await c.post(
        "/auth/users", json={"email": "x@x.com", "password": "parola123"}
    )
    assert r.status_code == 403


async def test_admin_nu_isi_poate_retrage_adminul(admin_client, admin):
    r = await admin_client.patch(
        f"/auth/users/{admin.id}", json={"is_admin": False}
    )
    assert r.status_code == 400


async def test_admin_nu_isi_poate_sterge_contul(admin_client, admin):
    r = await admin_client.delete(f"/auth/users/{admin.id}")
    assert r.status_code == 400


async def test_admin_poate_modifica_permisiuni_alt_user(admin_client, user):
    r = await admin_client.patch(
        f"/auth/users/{user.id}", json={"can_sites": False, "is_active": False}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["can_sites"] is False
    assert body["is_active"] is False


async def test_admin_poate_sterge_alt_user(admin_client, user):
    r = await admin_client.delete(f"/auth/users/{user.id}")
    assert r.status_code == 204


async def test_patch_user_inexistent_404(admin_client):
    r = await admin_client.patch("/auth/users/99999", json={"can_qr": False})
    assert r.status_code == 404
