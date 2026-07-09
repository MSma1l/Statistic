"""Teste pentru ingestia /px/collect și rapoartele /api/analytics."""

import json

import pytest
from sqlalchemy import func, select

from app.database import AsyncSessionLocal
from app.models import Event

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _ev(type_, path="/", session_id="s1", **kw):
    ev = {
        "type": type_,
        "path": path,
        "referrer": kw.pop("referrer", ""),
        "element_selector": kw.pop("element_selector", ""),
        "element_text": kw.pop("element_text", ""),
        "session_id": session_id,
    }
    ev.update(kw)
    return ev


async def _collect(client, site_key, visitor_id, events):
    payload = {"site": site_key, "visitor_id": visitor_id, "events": events}
    return await client.post(
        "/px/collect",
        content=json.dumps(payload),
        headers={"content-type": "text/plain"},
    )


async def _make_site(auth_client_factory, user, name="Colectare"):
    c = auth_client_factory(user)
    r = await c.post("/api/sites", json={"name": name, "domain": "ex.com"})
    return r.json()


async def _seed_events(client, site_key):
    """v1: 2 pageviews (/a,/b) + 2 clicks pe /a; v2: 1 pageview /a."""
    await _collect(
        client,
        site_key,
        "vizitator-unu",
        [
            _ev("pageview", "/a", "s1"),
            _ev("pageview", "/b", "s1"),
            _ev(
                "click",
                "/a",
                "s1",
                element_selector=".btn",
                element_text="Cumpără",
                x_pct=50.0,
                y_pct=40.0,
                doc_w=1000,
                doc_h=2000,
            ),
            _ev(
                "click",
                "/a",
                "s1",
                element_selector=".btn",
                element_text="Cumpără",
                x_pct=55.0,
                y_pct=45.0,
                doc_w=1000,
                doc_h=2000,
            ),
        ],
    )
    await _collect(client, site_key, "vizitator-doi", [_ev("pageview", "/a", "s2")])


# --- Ingestie -----------------------------------------------------------------
async def test_collect_accepta_evenimente_204(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    r = await _collect(
        client, site["site_key"], "v1", [_ev("pageview", "/acasa")]
    )
    assert r.status_code == 204


async def test_collect_salveaza_evenimentele(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _collect(client, site["site_key"], "v1", [_ev("pageview", "/x")])
    async with AsyncSessionLocal() as s:
        n = await s.scalar(
            select(func.count()).select_from(Event).where(Event.site_id == site["id"])
        )
    assert n == 1


async def test_collect_site_inexistent_204_fara_scriere(client):
    r = await _collect(client, "0000000000000000", "v1", [_ev("pageview", "/x")])
    assert r.status_code == 204
    async with AsyncSessionLocal() as s:
        n = await s.scalar(select(func.count()).select_from(Event))
    assert n == 0


async def test_collect_json_invalid_204(client):
    r = await client.post(
        "/px/collect", content="nu-e-json", headers={"content-type": "text/plain"}
    )
    assert r.status_code == 204


async def test_collect_sanitizeaza_element_text(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _collect(
        client,
        site["site_key"],
        "v1",
        [_ev("click", "/a", "s1", element_text="<script>alert(1)</script>Buy")],
    )
    async with AsyncSessionLocal() as s:
        txt = await s.scalar(
            select(Event.element_text).where(Event.site_id == site["id"])
        )
    assert "<" not in txt and ">" not in txt


async def test_collect_tip_necunoscut_devine_custom(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _collect(client, site["site_key"], "v1", [_ev("inventat", "/a")])
    async with AsyncSessionLocal() as s:
        t = await s.scalar(select(Event.type).where(Event.site_id == site["id"]))
    assert t == "custom"


# --- Rapoarte -----------------------------------------------------------------
async def test_summary_cifre_corecte(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_events(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get(f"/api/analytics/{site['id']}/summary")
    assert r.status_code == 200
    b = r.json()
    assert b["pageviews"] == 3
    assert b["clicks"] == 2
    assert b["visitors"] == 2
    assert b["sessions"] == 2


async def test_top_pages(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_events(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get(f"/api/analytics/{site['id']}/top-pages")
    pages = {p["path"]: p["views"] for p in r.json()}
    assert pages["/a"] == 2
    assert pages["/b"] == 1


async def test_top_elements(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_events(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get(f"/api/analytics/{site['id']}/top-elements")
    rows = r.json()
    assert rows[0]["selector"] == ".btn"
    assert rows[0]["clicks"] == 2
    assert rows[0]["text"] == "Cumpără"


async def test_heatmap(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_events(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get(f"/api/analytics/{site['id']}/heatmap", params={"path": "/a"})
    b = r.json()
    assert b["count"] == 2
    assert len(b["points"]) == 2
    assert b["doc_w"] == 1000


async def test_breakdown(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_events(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get(f"/api/analytics/{site['id']}/breakdown")
    b = r.json()
    # 3 pageviews, toate cu referrer gol → (direct)
    ref = {x["referrer"]: x["count"] for x in b["referrers"]}
    assert ref.get("(direct)") == 3
    assert "devices" in b


async def test_timeseries(client, auth_client_factory, user):
    site = await _make_site(auth_client_factory, user)
    await _seed_events(client, site["site_key"])
    c = auth_client_factory(user)
    r = await c.get(f"/api/analytics/{site['id']}/timeseries")
    rows = r.json()
    total_pv = sum(x["pageviews"] for x in rows)
    total_cl = sum(x["clicks"] for x in rows)
    assert total_pv == 3
    assert total_cl == 2


# --- Izolare / permisiuni -----------------------------------------------------
async def test_analytics_izolare_pe_owner_404(auth_client_factory, make_user):
    ua = await make_user("an_a@x.com")
    ub = await make_user("an_b@x.com")
    ca = auth_client_factory(ua)
    sid = (await ca.post("/api/sites", json={"name": "A", "domain": ""})).json()["id"]
    cb = auth_client_factory(ub)
    r = await cb.get(f"/api/analytics/{sid}/summary")
    assert r.status_code == 404


async def test_analytics_site_inexistent_404(auth_client_factory, user):
    c = auth_client_factory(user)
    r = await c.get("/api/analytics/99999/summary")
    assert r.status_code == 404


async def test_analytics_fara_permisiune_sites_403(auth_client_factory, make_user):
    u = await make_user("an_nos@x.com", can_sites=False)
    c = auth_client_factory(u)
    r = await c.get("/api/analytics/1/summary")
    assert r.status_code == 403
