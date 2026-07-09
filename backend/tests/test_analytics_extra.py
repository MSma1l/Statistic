"""Acoperire suplimentară: rapoartele avansate din /api/analytics + overview + snapshot."""

import io
import json

import pytest
from PIL import Image

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (6, 6), (10, 120, 220)).save(buf, format="PNG")
    return buf.getvalue()


async def _make_site(auth_client_factory, user):
    c = auth_client_factory(user)
    return (await c.post("/api/sites", json={"name": "Rap", "domain": "ex.com"})).json()


async def _seed_rich(client, site_key):
    payload = {
        "site": site_key,
        "visitor_id": "viz-1",
        "events": [
            {"type": "pageview", "path": "/a", "session_id": "s1",
             "utm_source": "google", "utm_medium": "cpc", "utm_campaign": "vara"},
            {"type": "scroll", "path": "/a", "session_id": "s1", "scroll_depth": 50},
            {"type": "scroll", "path": "/a", "session_id": "s1", "scroll_depth": 100},
            {"type": "click", "path": "/a", "session_id": "s1",
             "element_selector": ".cta", "element_text": "Hai", "x_pct": 10.0, "y_pct": 20.0},
            {"type": "engagement", "path": "/a", "session_id": "s1",
             "duration_ms": 8000, "scroll_depth": 100},
        ],
    }
    await client.post(
        "/px/collect", content=json.dumps(payload),
        headers={"content-type": "text/plain"},
    )


async def test_overview(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_rich(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get("/api/analytics/overview")
    assert r.status_code == 200
    b = r.json()
    assert b["sites_count"] >= 1
    assert b["pageviews"] == 1
    assert b["clicks"] == 1
    assert any(p["path"] == "/a" for p in b["top_pages"])


async def test_paths(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_rich(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get(f"/api/analytics/{site['id']}/paths")
    assert r.status_code == 200
    assert any(p["path"] == "/a" for p in r.json())


async def test_sessions_si_journey(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_rich(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get(f"/api/analytics/{site['id']}/sessions")
    assert r.status_code == 200
    sess = r.json()
    assert len(sess) == 1
    assert sess[0]["session_id"] == "s1"
    assert sess[0]["pageviews"] == 1
    assert sess[0]["clicks"] == 1

    c = auth_client_factory(user)
    r2 = await c.get(
        f"/api/analytics/{site['id']}/journey", params={"session_id": "s1"}
    )
    assert r2.status_code == 200
    assert len(r2.json()) == 5  # toate cele 5 evenimente ale sesiunii


async def test_engagement(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_rich(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get(f"/api/analytics/{site['id']}/engagement")
    assert r.status_code == 200
    row = next(x for x in r.json() if x["path"] == "/a")
    assert row["views"] == 1
    assert row["avg_seconds"] == 8  # 8000 ms, peste pragul de 5s


async def test_scrollmap(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_rich(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get(
        f"/api/analytics/{site['id']}/scrollmap", params={"path": "/a"}
    )
    assert r.status_code == 200
    b = r.json()
    assert b["base_sessions"] == 1
    curve = {p["depth"]: p["pct"] for p in b["curve"]}
    assert curve[50] == 100
    assert curve[100] == 100


async def test_campaigns(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_rich(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get(f"/api/analytics/{site['id']}/campaigns")
    assert r.status_code == 200
    rows = r.json()
    assert rows[0]["source"] == "google"
    assert rows[0]["campaign"] == "vara"


# --- Captură pagină (snapshot) ------------------------------------------------
async def test_snapshot_upload_get_delete(auth_client_factory, user):
    c = auth_client_factory(user)
    site = (await c.post("/api/sites", json={"name": "S", "domain": ""})).json()

    c = auth_client_factory(user)
    r = await c.post(
        f"/api/analytics/{site['id']}/snapshot",
        params={"path": "/a"},
        files={"file": ("s.png", _png(), "image/png")},
    )
    assert r.status_code == 200
    assert r.json()["has"] is True

    c = auth_client_factory(user)
    meta = await c.get(
        f"/api/analytics/{site['id']}/snapshot", params={"path": "/a"}
    )
    assert meta.json()["has"] is True

    c = auth_client_factory(user)
    raw = await c.get(
        f"/api/analytics/{site['id']}/snapshot/raw", params={"path": "/a"}
    )
    assert raw.status_code == 200
    assert raw.headers["content-type"] == "image/png"

    c = auth_client_factory(user)
    d = await c.delete(
        f"/api/analytics/{site['id']}/snapshot", params={"path": "/a"}
    )
    assert d.status_code == 204

    c = auth_client_factory(user)
    meta2 = await c.get(
        f"/api/analytics/{site['id']}/snapshot", params={"path": "/a"}
    )
    assert meta2.json()["has"] is False


async def test_snapshot_tip_invalid_400(auth_client_factory, user):
    c = auth_client_factory(user)
    site = (await c.post("/api/sites", json={"name": "S2", "domain": ""})).json()
    c = auth_client_factory(user)
    r = await c.post(
        f"/api/analytics/{site['id']}/snapshot",
        params={"path": "/a"},
        files={"file": ("s.gif", b"GIF89a", "image/gif")},
    )
    assert r.status_code == 400


async def test_snapshot_raw_inexistent_404(auth_client_factory, user):
    c = auth_client_factory(user)
    site = (await c.post("/api/sites", json={"name": "S3", "domain": ""})).json()
    c = auth_client_factory(user)
    r = await c.get(
        f"/api/analytics/{site['id']}/snapshot/raw", params={"path": "/lipsa"}
    )
    assert r.status_code == 404


# --- Overview linkuri ---------------------------------------------------------
async def test_links_overview(auth_client_factory, client, user):
    c = auth_client_factory(user)
    link = (
        await c.post(
            "/api/links",
            json={"slug": "ov-link", "destination_url": "https://x.com",
                  "kind": "link", "location_label": "Cluj"},
        )
    ).json()

    client.cookies.clear()
    await client.get(f"/l/{link['slug']}", follow_redirects=False)

    c = auth_client_factory(user)
    r = await c.get("/api/links/overview")
    assert r.status_code == 200
    b = r.json()
    assert b["links_count"] >= 1
    assert b["total"] >= 1
    assert b["clicks"] >= 1
