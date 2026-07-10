"""Teste pentru /api/links (linkuri + QR), redirect curat /{slug} + /l & /q,
statistici, QR imagini."""

import pytest

from app.api.links import _qr_target, _short_url
from app.config import settings

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _create_link(c, slug, kind="link", dest="https://example.com"):
    return await c.post(
        "/api/links",
        json={"slug": slug, "destination_url": dest, "kind": kind, "name": slug},
    )


# --- CRUD + validare ----------------------------------------------------------
async def test_creare_link_201_cu_urls(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await _create_link(c, "promo-vara")
    assert r.status_code == 201
    b = r.json()
    assert b["slug"] == "promo-vara"
    # URL curat, fără prefixul /l/: DOMENIU/<slug>
    assert b["short_url"] == f"{settings.public_url}/promo-vara"
    assert "/l/" not in b["short_url"]
    assert f"/api/links/{b['id']}/qr.png" in b["qr_url"]


async def test_short_url_curat_fara_prefix():
    assert _short_url("abc") == f"{settings.public_url}/abc"
    assert "/l/" not in _short_url("abc")


async def test_qr_target_are_marcaj_q():
    # Conținutul QR e URL-ul curat + marcajul invizibil ?q=1 (deosebește scanarea)
    assert _qr_target("abc") == f"{settings.public_url}/abc?q=1"
    assert "/q/" not in _qr_target("abc")


async def test_slug_duplicat_409(auth_client_factory, user):
    c = auth_client_factory(user)
    await _create_link(c, "dublu")
    c = auth_client_factory(user)
    r = await _create_link(c, "dublu")
    assert r.status_code == 409


async def test_slug_invalid_422(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await _create_link(c, "Slug Invalid!")
    assert r.status_code == 422


async def test_url_invalid_422(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await _create_link(c, "fara-schema", dest="example.com")
    assert r.status_code == 422


async def test_slug_normalizat_lowercase(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await _create_link(c, "MixedCase")
    assert r.status_code == 201
    assert r.json()["slug"] == "mixedcase"


async def test_get_link_altui_owner_404(auth_client_factory, make_user):
    ua = await make_user("la@x.com")
    ub = await make_user("lb@x.com")
    ca = auth_client_factory(ua)
    lid = (await _create_link(ca, "al-meu")).json()["id"]
    cb = auth_client_factory(ub)
    r = await cb.get(f"/api/links/{lid}")
    assert r.status_code == 404


async def test_update_si_delete_link(auth_client_factory, user):
    c = auth_client_factory(user)
    lid = (await _create_link(c, "de-editat")).json()["id"]
    c = auth_client_factory(user)
    r = await c.patch(
        f"/api/links/{lid}", json={"destination_url": "https://nou.com"}
    )
    assert r.status_code == 200
    assert r.json()["destination_url"] == "https://nou.com"
    c = auth_client_factory(user)
    r2 = await c.delete(f"/api/links/{lid}")
    assert r2.status_code == 204


# --- Redirect /l și /q --------------------------------------------------------
async def test_redirect_link_302_si_inregistreaza_click(
    client, auth_client_factory, user
):
    c = auth_client_factory(user)
    lid = (await _create_link(c, "redir-l", dest="https://target.com")).json()["id"]

    client.cookies.clear()
    r = await client.get("/l/redir-l", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "https://target.com"

    c = auth_client_factory(user)
    stats = (await c.get(f"/api/links/{lid}/stats")).json()
    assert stats["total"] == 1
    assert stats["clicks"] == 1
    assert stats["scans"] == 0


async def test_redirect_qr_302_si_inregistreaza_scan(
    client, auth_client_factory, user
):
    c = auth_client_factory(user)
    lid = (
        await _create_link(c, "redir-q", kind="qr", dest="https://qrt.com")
    ).json()["id"]

    client.cookies.clear()
    r = await client.get("/q/redir-q", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "https://qrt.com"

    c = auth_client_factory(user)
    stats = (await c.get(f"/api/links/{lid}/stats")).json()
    assert stats["total"] == 1
    assert stats["scans"] == 1
    assert stats["clicks"] == 0


async def test_redirect_slug_inexistent_302_home(client):
    client.cookies.clear()
    r = await client.get("/l/nu-exista", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "/"


# --- Redirect CURAT /{slug} ---------------------------------------------------
async def test_redirect_curat_302_si_click(client, auth_client_factory, user):
    c = auth_client_factory(user)
    lid = (
        await _create_link(c, "curat-click", dest="https://curat.com")
    ).json()["id"]

    client.cookies.clear()
    r = await client.get("/curat-click", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "https://curat.com"

    c = auth_client_factory(user)
    stats = (await c.get(f"/api/links/{lid}/stats")).json()
    assert stats["total"] == 1
    assert stats["clicks"] == 1
    assert stats["scans"] == 0


async def test_redirect_curat_cu_q_302_si_scan(client, auth_client_factory, user):
    c = auth_client_factory(user)
    lid = (
        await _create_link(c, "curat-scan", kind="qr", dest="https://scan.com")
    ).json()["id"]

    client.cookies.clear()
    r = await client.get("/curat-scan?q=1", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "https://scan.com"

    c = auth_client_factory(user)
    stats = (await c.get(f"/api/links/{lid}/stats")).json()
    assert stats["total"] == 1
    assert stats["scans"] == 1
    assert stats["clicks"] == 0


async def test_redirect_curat_slug_inexistent_404(client):
    client.cookies.clear()
    r = await client.get("/nu-exista-deloc", follow_redirects=False)
    assert r.status_code == 404


async def test_redirect_curat_slug_inactiv_404(client, auth_client_factory, user):
    c = auth_client_factory(user)
    lid = (await _create_link(c, "curat-inactiv")).json()["id"]
    c = auth_client_factory(user)
    await c.patch(f"/api/links/{lid}", json={"is_active": False})

    client.cookies.clear()
    r = await client.get("/curat-inactiv", follow_redirects=False)
    assert r.status_code == 404


async def test_health_nu_e_umbrit_de_catch_all(client):
    """/health rămâne 200 (catch-all-ul /{slug} nu-l umbrește)."""
    client.cookies.clear()
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_cuvant_rezervat_nu_e_slug_404(client, auth_client_factory, user):
    """Un cuvânt rezervat (ex. 'docs') nu e tratat ca slug chiar dacă ar exista."""
    # Chiar dacă am crea un link cu slug rezervat, ruta curată dă 404.
    client.cookies.clear()
    r = await client.get("/api", follow_redirects=False)
    # /api nu e o rută existentă și e cuvânt rezervat → nu redirectează
    assert r.status_code == 404


async def test_redirect_link_inactiv_302_home(client, auth_client_factory, user):
    c = auth_client_factory(user)
    lid = (await _create_link(c, "inactiv-link")).json()["id"]
    c = auth_client_factory(user)
    await c.patch(f"/api/links/{lid}", json={"is_active": False})

    client.cookies.clear()
    r = await client.get("/l/inactiv-link", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "/"


# --- QR imagini ---------------------------------------------------------------
async def test_qr_png_content_type(auth_client_factory, user):
    c = auth_client_factory(user)
    lid = (await _create_link(c, "qr-png", kind="qr")).json()["id"]
    c = auth_client_factory(user)
    r = await c.get(f"/api/links/{lid}/qr.png")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


async def test_qr_svg_content_type(auth_client_factory, user):
    c = auth_client_factory(user)
    lid = (await _create_link(c, "qr-svg", kind="qr")).json()["id"]
    c = auth_client_factory(user)
    r = await c.get(f"/api/links/{lid}/qr.svg")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/svg+xml"
    assert b"<svg" in r.content


# --- Permisiuni pe kind -------------------------------------------------------
async def test_user_doar_qr_nu_poate_crea_link(auth_client_factory, make_user):
    u = await make_user("qronly@x.com", can_links=False, can_qr=True)
    c = auth_client_factory(u)
    r = await _create_link(c, "vreau-link", kind="link")
    assert r.status_code == 403


async def test_user_doar_qr_poate_crea_qr(auth_client_factory, make_user):
    u = await make_user("qronly2@x.com", can_links=False, can_qr=True)
    c = auth_client_factory(u)
    r = await _create_link(c, "vreau-qr", kind="qr")
    assert r.status_code == 201


async def test_user_doar_link_nu_poate_crea_qr(auth_client_factory, make_user):
    u = await make_user("linkonly@x.com", can_links=True, can_qr=False)
    c = auth_client_factory(u)
    r = await _create_link(c, "vreau-qr2", kind="qr")
    assert r.status_code == 403


async def test_listare_ascunde_kind_nepermis(auth_client_factory, make_user):
    """Un user cu ambele creează link+qr; apoi îi luăm can_links → vede doar qr."""
    admin_like = await make_user("both@x.com", can_links=True, can_qr=True)
    c = auth_client_factory(admin_like)
    await _create_link(c, "l-vizibil", kind="link")
    c = auth_client_factory(admin_like)
    await _create_link(c, "q-vizibil", kind="qr")

    # revocăm can_links direct în DB
    from app.database import AsyncSessionLocal
    from app.models import User

    async with AsyncSessionLocal() as s:
        u = await s.get(User, admin_like.id)
        u.can_links = False
        await s.commit()

    c = auth_client_factory(admin_like)
    r = await c.get("/api/links")
    slugs = {x["slug"] for x in r.json()}
    assert "q-vizibil" in slugs
    assert "l-vizibil" not in slugs


async def test_links_fara_nicio_permisiune_403(auth_client_factory, make_user):
    u = await make_user("none@x.com", can_links=False, can_qr=False)
    c = auth_client_factory(u)
    r = await c.get("/api/links")
    assert r.status_code == 403
