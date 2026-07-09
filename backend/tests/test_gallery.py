"""Teste pentru /api/gallery (upload, validare, limită 25MB, izolare)."""

import io

import pytest
from PIL import Image

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import GalleryImage

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _png_bytes(size=(4, 4)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


async def _upload(c, data, filename="poza.png", content_type="image/png"):
    return await c.post(
        "/api/gallery", files={"file": (filename, data, content_type)}
    )


async def test_upload_imagine_valida_201(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await _upload(c, _png_bytes())
    assert r.status_code == 201
    b = r.json()
    assert b["content_type"] == "image/png"
    assert b["size_bytes"] > 0


async def test_upload_non_imagine_400(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await _upload(c, b"text oarecare", filename="x.txt", content_type="text/plain")
    assert r.status_code == 400


async def test_upload_fisier_gol_400(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await _upload(c, b"", content_type="image/png")
    assert r.status_code == 400


async def test_upload_date_care_nu_sunt_imagine_400(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await _upload(c, b"\x00\x01\x02 nu e imagine", content_type="image/png")
    assert r.status_code == 400


async def test_limita_galerie_413(auth_client_factory, user):
    # Umplem galeria aproape la limită printr-o intrare fictivă în DB.
    async with AsyncSessionLocal() as s:
        s.add(
            GalleryImage(
                owner_id=user.id,
                filename="mare.bin",
                content_type="image/png",
                size_bytes=settings.GALLERY_MAX_BYTES,
                data=b"x",
            )
        )
        await s.commit()

    c = auth_client_factory(user)
    r = await _upload(c, _png_bytes())
    assert r.status_code == 413


async def test_lista_galerie_arata_used_si_limit(auth_client_factory, user):
    c = auth_client_factory(user)
    await _upload(c, _png_bytes())
    c = auth_client_factory(user)
    r = await c.get("/api/gallery")
    assert r.status_code == 200
    b = r.json()
    assert b["limit_bytes"] == settings.GALLERY_MAX_BYTES
    assert b["used_bytes"] > 0
    assert len(b["images"]) == 1


async def test_get_raw_propriu(auth_client_factory, user):
    c = auth_client_factory(user)
    img_id = (await _upload(c, _png_bytes())).json()["id"]
    c = auth_client_factory(user)
    r = await c.get(f"/api/gallery/{img_id}/raw")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


async def test_delete_imagine_204(auth_client_factory, user):
    c = auth_client_factory(user)
    img_id = (await _upload(c, _png_bytes())).json()["id"]
    c = auth_client_factory(user)
    r = await c.delete(f"/api/gallery/{img_id}")
    assert r.status_code == 204


async def test_izolare_owner_get_raw_404(auth_client_factory, make_user):
    ua = await make_user("gra@x.com")
    ub = await make_user("grb@x.com")
    ca = auth_client_factory(ua)
    img_id = (await _upload(ca, _png_bytes())).json()["id"]
    cb = auth_client_factory(ub)
    r = await cb.get(f"/api/gallery/{img_id}/raw")
    assert r.status_code == 404


async def test_izolare_owner_delete_404(auth_client_factory, make_user):
    ua = await make_user("gda@x.com")
    ub = await make_user("gdb@x.com")
    ca = auth_client_factory(ua)
    img_id = (await _upload(ca, _png_bytes())).json()["id"]
    cb = auth_client_factory(ub)
    r = await cb.delete(f"/api/gallery/{img_id}")
    assert r.status_code == 404


async def test_galerie_fara_permisiune_403(auth_client_factory, make_user):
    u = await make_user("gnoperm@x.com", can_links=False, can_qr=False)
    c = auth_client_factory(u)
    r = await c.get("/api/gallery")
    assert r.status_code == 403
