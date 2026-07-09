"""Teste de integrare pentru /api/sites (CRUD, ownership, snippet, permisiuni)."""

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _create_site(c, name="Site Test", domain="example.com"):
    return await c.post("/api/sites", json={"name": name, "domain": domain})


async def test_creare_site_201_cu_snippet(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await _create_site(c)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Site Test"
    assert "snippet" in body
    assert body["site_key"] in body["snippet"]
    assert "/px/t.js" in body["snippet"]


async def test_creare_site_sanitizeaza_numele(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await c.post(
        "/api/sites", json={"name": "Magazin <b>Pro</b>", "domain": ""}
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Magazin Pro"


async def test_creare_site_nume_gol_422(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await c.post("/api/sites", json={"name": "", "domain": ""})
    assert r.status_code == 422


async def test_list_sites_doar_ale_mele(auth_client_factory, make_user):
    ua = await make_user("owner_a@x.com")
    ub = await make_user("owner_b@x.com")

    ca = auth_client_factory(ua)
    await _create_site(ca, name="A1")
    await _create_site(ca, name="A2")

    cb = auth_client_factory(ub)
    await _create_site(cb, name="B1")

    ra = await ca.get("/api/sites")
    # atenție: auth_client_factory partajează clientul → resetăm pe ua
    ca = auth_client_factory(ua)
    ra = await ca.get("/api/sites")
    assert {s["name"] for s in ra.json()} == {"A1", "A2"}

    cb = auth_client_factory(ub)
    rb = await cb.get("/api/sites")
    assert {s["name"] for s in rb.json()} == {"B1"}


async def test_get_site_altui_owner_404(auth_client_factory, make_user):
    ua = await make_user("ga@x.com")
    ub = await make_user("gb@x.com")
    ca = auth_client_factory(ua)
    sid = (await _create_site(ca)).json()["id"]

    cb = auth_client_factory(ub)
    r = await cb.get(f"/api/sites/{sid}")
    assert r.status_code == 404


async def test_update_site_altui_owner_404(auth_client_factory, make_user):
    ua = await make_user("ua_u@x.com")
    ub = await make_user("ub_u@x.com")
    ca = auth_client_factory(ua)
    sid = (await _create_site(ca)).json()["id"]

    cb = auth_client_factory(ub)
    r = await cb.patch(f"/api/sites/{sid}", json={"name": "Hack"})
    assert r.status_code == 404


async def test_update_site_propriu(auth_client_factory, user):
    c = auth_client_factory(user)
    sid = (await _create_site(c)).json()["id"]
    c = auth_client_factory(user)
    r = await c.patch(
        f"/api/sites/{sid}",
        json={"name": "Redenumit", "min_engagement_seconds": 10},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Redenumit"
    assert r.json()["min_engagement_seconds"] == 10


async def test_delete_site_propriu_204(auth_client_factory, user):
    c = auth_client_factory(user)
    sid = (await _create_site(c)).json()["id"]
    c = auth_client_factory(user)
    r = await c.delete(f"/api/sites/{sid}")
    assert r.status_code == 204
    c = auth_client_factory(user)
    r2 = await c.get(f"/api/sites/{sid}")
    assert r2.status_code == 404


async def test_delete_site_altui_owner_404(auth_client_factory, make_user):
    ua = await make_user("da@x.com")
    ub = await make_user("db@x.com")
    ca = auth_client_factory(ua)
    sid = (await _create_site(ca)).json()["id"]
    cb = auth_client_factory(ub)
    r = await cb.delete(f"/api/sites/{sid}")
    assert r.status_code == 404


async def test_sites_fara_permisiune_403(auth_client_factory, make_user):
    u = await make_user("nos@x.com", can_sites=False)
    c = auth_client_factory(u)
    r = await c.get("/api/sites")
    assert r.status_code == 403
    c = auth_client_factory(u)
    r2 = await c.post("/api/sites", json={"name": "X", "domain": ""})
    assert r2.status_code == 403


async def test_sites_fara_auth_401(client):
    client.cookies.clear()
    r = await client.get("/api/sites")
    assert r.status_code == 401
