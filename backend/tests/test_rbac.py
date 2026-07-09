"""Teste RBAC pe capabilități (can_sites / can_links / can_qr) impuse pe server."""

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_user_doar_qr_blocat_la_sites(auth_client_factory, make_user):
    u = await make_user(
        "rbac_qr@x.com", can_sites=False, can_links=False, can_qr=True
    )
    c = auth_client_factory(u)
    r = await c.get("/api/sites")
    assert r.status_code == 403


async def test_user_doar_qr_blocat_la_kind_link(auth_client_factory, make_user):
    u = await make_user(
        "rbac_qr2@x.com", can_sites=False, can_links=False, can_qr=True
    )
    c = auth_client_factory(u)
    r = await c.post(
        "/api/links",
        json={"slug": "rbac-l", "destination_url": "https://x.com", "kind": "link"},
    )
    assert r.status_code == 403


async def test_user_doar_qr_poate_crea_kind_qr(auth_client_factory, make_user):
    u = await make_user(
        "rbac_qr3@x.com", can_sites=False, can_links=False, can_qr=True
    )
    c = auth_client_factory(u)
    r = await c.post(
        "/api/links",
        json={"slug": "rbac-q", "destination_url": "https://x.com", "kind": "qr"},
    )
    assert r.status_code == 201


async def test_user_doar_qr_are_acces_la_galerie(auth_client_factory, make_user):
    u = await make_user(
        "rbac_qr4@x.com", can_sites=False, can_links=False, can_qr=True
    )
    c = auth_client_factory(u)
    r = await c.get("/api/gallery")
    assert r.status_code == 200


async def test_user_doar_sites_blocat_la_linkuri(auth_client_factory, make_user):
    u = await make_user(
        "rbac_s@x.com", can_sites=True, can_links=False, can_qr=False
    )
    c = auth_client_factory(u)
    r = await c.get("/api/links")
    assert r.status_code == 403
    c = auth_client_factory(u)
    r2 = await c.get("/api/gallery")
    assert r2.status_code == 403
    c = auth_client_factory(u)
    r3 = await c.get("/api/sites")
    assert r3.status_code == 200


async def test_admin_are_toate_capabilitatile(auth_client_factory, make_user):
    """Admin cu toate flag-urile False → totuși are acces (admin le are pe toate)."""
    a = await make_user(
        "rbac_admin@x.com",
        is_admin=True,
        can_sites=False,
        can_links=False,
        can_qr=False,
    )
    c = auth_client_factory(a)
    assert (await c.get("/api/sites")).status_code == 200
    c = auth_client_factory(a)
    assert (await c.get("/api/links")).status_code == 200
    c = auth_client_factory(a)
    assert (await c.get("/api/gallery")).status_code == 200
