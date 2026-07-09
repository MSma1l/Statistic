"""Teste pentru partajarea per-resursă (site / link) + vizibilitate de admin."""

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _create_site(c, name="Shared Site", domain="ex.com"):
    return await c.post("/api/sites", json={"name": name, "domain": domain})


async def _create_link(c, slug="sh-link", dest="https://x.com", kind="link"):
    return await c.post(
        "/api/links",
        json={"slug": slug, "destination_url": dest, "kind": kind},
    )


# ------------------------------------------------------------------------------
#  SITE-uri
# ------------------------------------------------------------------------------
async def test_site_owner_vede_si_editeaza(auth_client_factory, make_user):
    owner = await make_user("sh_owner@x.com")
    c = auth_client_factory(owner)
    sid = (await _create_site(c)).json()["id"]

    c = auth_client_factory(owner)
    r = await c.get(f"/api/sites/{sid}")
    assert r.status_code == 200
    body = r.json()
    assert body["access"] == "owner"
    assert body["can_edit"] is True
    assert body["owner_email"] == "sh_owner@x.com"

    c = auth_client_factory(owner)
    r = await c.patch(f"/api/sites/{sid}", json={"name": "Nou"})
    assert r.status_code == 200


async def test_site_alt_user_404_pana_la_share(auth_client_factory, make_user):
    owner = await make_user("sh_o2@x.com")
    other = await make_user("sh_ot2@x.com")
    c = auth_client_factory(owner)
    sid = (await _create_site(c)).json()["id"]

    c = auth_client_factory(other)
    assert (await c.get(f"/api/sites/{sid}")).status_code == 404

    # Owner partajează (view-only).
    c = auth_client_factory(owner)
    r = await c.post(
        "/api/shares",
        json={
            "resource_type": "site",
            "resource_id": sid,
            "user_id": other.id,
            "can_edit": False,
        },
    )
    assert r.status_code == 201
    sh = r.json()
    assert sh["user_email"] == "sh_ot2@x.com"
    assert sh["can_edit"] is False

    # Acum vede, dar view-only → PATCH 403.
    c = auth_client_factory(other)
    r = await c.get(f"/api/sites/{sid}")
    assert r.status_code == 200
    assert r.json()["access"] == "shared"
    assert r.json()["can_edit"] is False
    assert r.json()["owner_email"] == "sh_o2@x.com"

    c = auth_client_factory(other)
    assert (await c.patch(f"/api/sites/{sid}", json={"name": "H"})).status_code == 403
    # Nici delete.
    c = auth_client_factory(other)
    assert (await c.delete(f"/api/sites/{sid}")).status_code == 403


async def test_site_share_can_edit_editeaza_dar_nu_sterge(
    auth_client_factory, make_user
):
    owner = await make_user("sh_o3@x.com")
    editor = await make_user("sh_ed3@x.com")
    c = auth_client_factory(owner)
    sid = (await _create_site(c)).json()["id"]

    c = auth_client_factory(owner)
    r = await c.post(
        "/api/shares",
        json={
            "resource_type": "site",
            "resource_id": sid,
            "user_id": editor.id,
            "can_edit": True,
        },
    )
    assert r.status_code == 201

    c = auth_client_factory(editor)
    r = await c.patch(f"/api/sites/{sid}", json={"name": "Editat"})
    assert r.status_code == 200
    assert r.json()["name"] == "Editat"
    assert r.json()["can_edit"] is True

    c = auth_client_factory(editor)
    assert (await c.delete(f"/api/sites/{sid}")).status_code == 403


async def test_site_admin_vede_tot(auth_client_factory, make_user):
    owner = await make_user("sh_o4@x.com")
    adm = await make_user("sh_adm4@x.com", is_admin=True)
    c = auth_client_factory(owner)
    sid = (await _create_site(c, name="Al lui owner")).json()["id"]

    c = auth_client_factory(adm)
    r = await c.get(f"/api/sites/{sid}")
    assert r.status_code == 200
    assert r.json()["access"] == "admin"
    assert r.json()["can_edit"] is True
    # Admin poate edita și șterge orice.
    c = auth_client_factory(adm)
    assert (await c.patch(f"/api/sites/{sid}", json={"name": "AdmEdit"})).status_code == 200
    c = auth_client_factory(adm)
    assert (await c.delete(f"/api/sites/{sid}")).status_code == 204


async def test_site_liste_contin_campuri_share(auth_client_factory, make_user):
    owner = await make_user("sh_o5@x.com")
    other = await make_user("sh_ot5@x.com")
    c = auth_client_factory(owner)
    sid = (await _create_site(c, name="Partajat")).json()["id"]
    c = auth_client_factory(owner)
    await c.post(
        "/api/shares",
        json={
            "resource_type": "site",
            "resource_id": sid,
            "user_id": other.id,
            "can_edit": True,
        },
    )

    # Owner list: apare ca owner.
    c = auth_client_factory(owner)
    lst = (await c.get("/api/sites")).json()
    mine = next(s for s in lst if s["id"] == sid)
    assert mine["access"] == "owner"
    assert mine["can_edit"] is True
    assert mine["owner_email"] == "sh_o5@x.com"

    # Other list: apare ca shared, can_edit True, owner_email al ownerului.
    c = auth_client_factory(other)
    lst = (await c.get("/api/sites")).json()
    assert len(lst) == 1
    assert lst[0]["access"] == "shared"
    assert lst[0]["can_edit"] is True
    assert lst[0]["owner_email"] == "sh_o5@x.com"


# ------------------------------------------------------------------------------
#  Gestionarea share-urilor (permisiuni, 409, PATCH, DELETE, 400)
# ------------------------------------------------------------------------------
async def test_share_doar_owner_sau_admin_poate_crea(auth_client_factory, make_user):
    owner = await make_user("sh_o6@x.com")
    stranger = await make_user("sh_str6@x.com")
    target = await make_user("sh_tg6@x.com")
    c = auth_client_factory(owner)
    sid = (await _create_site(c)).json()["id"]

    # Un user oarecare NU poate partaja resursa altcuiva.
    c = auth_client_factory(stranger)
    r = await c.post(
        "/api/shares",
        json={
            "resource_type": "site",
            "resource_id": sid,
            "user_id": target.id,
            "can_edit": False,
        },
    )
    assert r.status_code == 403


async def test_share_duplicat_409(auth_client_factory, make_user):
    owner = await make_user("sh_o7@x.com")
    other = await make_user("sh_ot7@x.com")
    c = auth_client_factory(owner)
    sid = (await _create_site(c)).json()["id"]

    body = {
        "resource_type": "site",
        "resource_id": sid,
        "user_id": other.id,
        "can_edit": False,
    }
    c = auth_client_factory(owner)
    assert (await c.post("/api/shares", json=body)).status_code == 201
    c = auth_client_factory(owner)
    assert (await c.post("/api/shares", json=body)).status_code == 409


async def test_share_cu_owner_sau_self_400(auth_client_factory, make_user):
    owner = await make_user("sh_o8@x.com")
    c = auth_client_factory(owner)
    sid = (await _create_site(c)).json()["id"]

    c = auth_client_factory(owner)
    r = await c.post(
        "/api/shares",
        json={
            "resource_type": "site",
            "resource_id": sid,
            "user_id": owner.id,
            "can_edit": False,
        },
    )
    assert r.status_code == 400


async def test_share_resursa_inexistenta_404(auth_client_factory, make_user):
    owner = await make_user("sh_o9@x.com")
    target = await make_user("sh_tg9@x.com")
    c = auth_client_factory(owner)
    r = await c.post(
        "/api/shares",
        json={
            "resource_type": "site",
            "resource_id": 999999,
            "user_id": target.id,
            "can_edit": False,
        },
    )
    assert r.status_code == 404


async def test_share_list_patch_delete(auth_client_factory, make_user):
    owner = await make_user("sh_o10@x.com")
    other = await make_user("sh_ot10@x.com")
    c = auth_client_factory(owner)
    sid = (await _create_site(c)).json()["id"]

    c = auth_client_factory(owner)
    share_id = (
        await c.post(
            "/api/shares",
            json={
                "resource_type": "site",
                "resource_id": sid,
                "user_id": other.id,
                "can_edit": False,
            },
        )
    ).json()["id"]

    # GET listă share-uri.
    c = auth_client_factory(owner)
    r = await c.get(f"/api/shares?resource_type=site&resource_id={sid}")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["user_email"] == "sh_ot10@x.com"

    # PATCH → ridică can_edit.
    c = auth_client_factory(owner)
    r = await c.patch(f"/api/shares/{share_id}", json={"can_edit": True})
    assert r.status_code == 200
    assert r.json()["can_edit"] is True

    # Acum other poate edita.
    c = auth_client_factory(other)
    assert (await c.patch(f"/api/sites/{sid}", json={"name": "OK"})).status_code == 200

    # DELETE share → other pierde accesul.
    c = auth_client_factory(owner)
    assert (await c.delete(f"/api/shares/{share_id}")).status_code == 204
    c = auth_client_factory(other)
    assert (await c.get(f"/api/sites/{sid}")).status_code == 404


async def test_delete_site_curata_share_urile(auth_client_factory, make_user, db):
    from sqlalchemy import select

    from app.models import ResourceShare

    owner = await make_user("sh_o11@x.com")
    other = await make_user("sh_ot11@x.com")
    c = auth_client_factory(owner)
    sid = (await _create_site(c)).json()["id"]
    c = auth_client_factory(owner)
    await c.post(
        "/api/shares",
        json={
            "resource_type": "site",
            "resource_id": sid,
            "user_id": other.id,
            "can_edit": False,
        },
    )
    c = auth_client_factory(owner)
    assert (await c.delete(f"/api/sites/{sid}")).status_code == 204

    rows = (
        await db.execute(
            select(ResourceShare).where(
                ResourceShare.resource_type == "site",
                ResourceShare.resource_id == sid,
            )
        )
    ).scalars().all()
    assert rows == []


# ------------------------------------------------------------------------------
#  LINK-uri
# ------------------------------------------------------------------------------
async def test_link_share_flux_complet(auth_client_factory, make_user):
    owner = await make_user("sh_lo@x.com")
    other = await make_user("sh_lot@x.com")
    c = auth_client_factory(owner)
    lid = (await _create_link(c, slug="share-l1")).json()["id"]

    # Alt user nu vede.
    c = auth_client_factory(other)
    assert (await c.get(f"/api/links/{lid}")).status_code == 404

    # Share view-only.
    c = auth_client_factory(owner)
    r = await c.post(
        "/api/shares",
        json={
            "resource_type": "link",
            "resource_id": lid,
            "user_id": other.id,
            "can_edit": False,
        },
    )
    assert r.status_code == 201

    c = auth_client_factory(other)
    r = await c.get(f"/api/links/{lid}")
    assert r.status_code == 200
    assert r.json()["access"] == "shared"
    assert r.json()["can_edit"] is False
    assert r.json()["owner_email"] == "sh_lo@x.com"

    # PATCH 403 (view-only), DELETE 403.
    c = auth_client_factory(other)
    assert (
        await c.patch(f"/api/links/{lid}", json={"name": "X"})
    ).status_code == 403
    c = auth_client_factory(other)
    assert (await c.delete(f"/api/links/{lid}")).status_code == 403

    # Apare în lista celuilalt user.
    c = auth_client_factory(other)
    lst = (await c.get("/api/links")).json()
    assert any(x["id"] == lid and x["access"] == "shared" for x in lst)


async def test_link_share_can_edit(auth_client_factory, make_user):
    owner = await make_user("sh_lo2@x.com")
    editor = await make_user("sh_led2@x.com")
    c = auth_client_factory(owner)
    lid = (await _create_link(c, slug="share-l2")).json()["id"]

    c = auth_client_factory(owner)
    await c.post(
        "/api/shares",
        json={
            "resource_type": "link",
            "resource_id": lid,
            "user_id": editor.id,
            "can_edit": True,
        },
    )
    c = auth_client_factory(editor)
    r = await c.patch(f"/api/links/{lid}", json={"name": "Editat"})
    assert r.status_code == 200
    assert r.json()["name"] == "Editat"
    # Dar nu poate șterge.
    c = auth_client_factory(editor)
    assert (await c.delete(f"/api/links/{lid}")).status_code == 403


async def test_link_admin_vede_tot(auth_client_factory, make_user):
    owner = await make_user("sh_lo3@x.com")
    adm = await make_user("sh_ladm3@x.com", is_admin=True)
    c = auth_client_factory(owner)
    lid = (await _create_link(c, slug="share-l3")).json()["id"]

    c = auth_client_factory(adm)
    r = await c.get(f"/api/links/{lid}")
    assert r.status_code == 200
    assert r.json()["access"] == "admin"
    # Admin vede linkul în listă.
    c = auth_client_factory(adm)
    lst = (await c.get("/api/links")).json()
    assert any(x["id"] == lid for x in lst)
