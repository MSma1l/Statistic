"""Strânge agregatele unui landing pentru AI (engagement, scroll, elemente, heatmap).

Regula de aur (cost + GDPR): tot ce iese de aici e AGREGAT — procente, medii,
clustere. NICIODATĂ evenimente brute sau identificatori. AI-ul vede imaginea de
ansamblu a paginii, nu oamenii din spatele ei.

Separat de `funnel.py` fiindcă răspunde altei întrebări: nu „cum compar landing-uri",
ci „cum arată UN landing în detaliu" (input pentru consultantul AI).
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Site
from app.services.scope import since as _since


async def _engagement(site_id: int, path: str, since, min_ms: int, db: AsyncSession) -> dict:
    """Vizualizări + timp activ mediu (peste prag) pe pagina dată."""
    views = (
        await db.scalar(
            select(func.count()).where(
                Event.site_id == site_id,
                Event.created_at >= since,
                Event.type == "pageview",
                Event.path == path,
            )
        )
        or 0
    )
    visit_ms = (
        select(func.sum(Event.duration_ms).label("ms"))
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "engagement",
            Event.duration_ms.isnot(None),
            Event.path == path,
        )
        .group_by(Event.session_id)
        .subquery()
    )
    avg_ms = await db.scalar(
        select(func.avg(visit_ms.c.ms)).where(visit_ms.c.ms >= min_ms)
    )
    return {"views": views, "avg_seconds": round((avg_ms or 0) / 1000)}


async def _scroll_curve(site_id: int, path: str, since, db: AsyncSession) -> list[dict]:
    """% din sesiuni care ajung la fiecare adâncime de scroll (25/50/75/100)."""
    base = (
        await db.scalar(
            select(func.count(func.distinct(Event.session_id))).where(
                Event.site_id == site_id,
                Event.created_at >= since,
                Event.type == "pageview",
                Event.path == path,
                Event.session_id != "",
            )
        )
        or 0
    )
    rows = await db.execute(
        select(
            Event.scroll_depth,
            func.count(func.distinct(Event.session_id)).label("s"),
        )
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "scroll",
            Event.path == path,
            Event.scroll_depth.isnot(None),
        )
        .group_by(Event.scroll_depth)
    )
    reached = {r.scroll_depth: r.s for r in rows}
    return [
        {"depth": d, "pct": round(100 * reached.get(d, 0) / base) if base else 0}
        for d in (25, 50, 75, 100)
    ]


async def _top_elements(site_id: int, path: str, since, db: AsyncSession) -> list[dict]:
    """Cele mai apăsate elemente DE PE pagina dată."""
    rows = await db.execute(
        select(Event.element_selector, Event.element_text, func.count().label("c"))
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "click",
            Event.path == path,
        )
        .group_by(Event.element_selector, Event.element_text)
        .order_by(func.count().desc())
        .limit(10)
    )
    return [
        {
            "selector": r.element_selector or "(necunoscut)",
            "text": r.element_text,
            "clicks": r.c,
        }
        for r in rows
    ]


async def _heatmap_clusters(site_id: int, path: str, since, db: AsyncSession) -> dict:
    """Heatmap AGREGAT: nu punctele brute, ci clustere pe o grilă (x:25% / y:10%).

    Suficient ca AI-ul să „vadă" unde se concentrează atenția, fără date brute.
    """
    rows = await db.execute(
        select(Event.x_pct, Event.y_pct).where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "click",
            Event.path == path,
            Event.x_pct.isnot(None),
            Event.y_pct.isnot(None),
        )
        .limit(5000)
    )
    clusters: dict[tuple[int, int], int] = {}
    total = 0
    for r in rows:
        total += 1
        cx = round(r.x_pct / 25) * 25
        cy = round(r.y_pct / 10) * 10
        clusters[(cx, cy)] = clusters.get((cx, cy), 0) + 1
    top = sorted(
        ({"x_pct": k[0], "y_pct": k[1], "clicks": v} for k, v in clusters.items()),
        key=lambda c: c["clicks"],
        reverse=True,
    )[:15]
    return {"total_clicks": total, "clusters": top}


async def aggregates_for_path(site: Site, path: str, days: int, db: AsyncSession) -> dict:
    """Toate agregatele unui landing, gata de trimis către consultantul AI."""
    site_id = site.id
    s = _since(days)
    min_ms = site.min_engagement_seconds * 1000
    return {
        "engagement": await _engagement(site_id, path, s, min_ms, db),
        "scroll": await _scroll_curve(site_id, path, s, db),
        "top_elements": await _top_elements(site_id, path, s, db),
        "heatmap": await _heatmap_clusters(site_id, path, s, db),
    }
