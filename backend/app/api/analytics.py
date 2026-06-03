from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_cap
from app.database import get_db
from app.models import Event, Site, User

router = APIRouter(
    prefix="/api/analytics",
    tags=["analytics"],
    dependencies=[Depends(require_cap("sites"))],
)


async def _owned_site(site_id: int, user: User, db: AsyncSession) -> Site:
    site = await db.get(Site, site_id)
    if not site or site.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Site inexistent")
    return site


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


@router.get("/{site_id}/summary")
async def summary(
    site_id: int,
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    site = await _owned_site(site_id, user, db)
    since = _since(days)
    min_ms = site.min_engagement_seconds * 1000
    base = select(Event).where(Event.site_id == site_id, Event.created_at >= since)

    pageviews = await db.scalar(
        select(func.count()).select_from(
            base.where(Event.type == "pageview").subquery()
        )
    )
    clicks = await db.scalar(
        select(func.count()).select_from(base.where(Event.type == "click").subquery())
    )
    visitors = await db.scalar(
        select(func.count(func.distinct(Event.visitor_id))).where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.visitor_id != "",
        )
    )
    sessions = await db.scalar(
        select(func.count(func.distinct(Event.session_id))).where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.session_id != "",
        )
    )

    # Timp mediu activ pe pagină (din evenimentele `engagement`), ignorând
    # vizitele sub pragul de atenție configurat pe site.
    avg_ms = await db.scalar(
        select(func.avg(Event.duration_ms)).where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "engagement",
            Event.duration_ms >= min_ms,
        )
    )

    # Bounce rate: % din sesiuni cu o singură pagină vizitată.
    sess_pv = (
        select(Event.session_id, func.count().label("pv"))
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "pageview",
            Event.session_id != "",
        )
        .group_by(Event.session_id)
        .subquery()
    )
    total_sess = await db.scalar(select(func.count()).select_from(sess_pv)) or 0
    bounced = await db.scalar(
        select(func.count()).select_from(sess_pv).where(sess_pv.c.pv == 1)
    ) or 0

    return {
        "pageviews": pageviews or 0,
        "clicks": clicks or 0,
        "visitors": visitors or 0,
        "sessions": sessions or 0,
        "avg_seconds": round((avg_ms or 0) / 1000),
        "bounce_rate": round(100 * bounced / total_sess) if total_sess else 0,
        "days": days,
    }


@router.get("/{site_id}/timeseries")
async def timeseries(
    site_id: int,
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _owned_site(site_id, user, db)
    since = _since(days)
    day = func.date_trunc("day", Event.created_at).label("day")
    result = await db.execute(
        select(
            day,
            func.count().filter(Event.type == "pageview").label("pageviews"),
            func.count().filter(Event.type == "click").label("clicks"),
        )
        .where(Event.site_id == site_id, Event.created_at >= since)
        .group_by(day)
        .order_by(day)
    )
    return [
        {"day": row.day.date().isoformat(), "pageviews": row.pageviews, "clicks": row.clicks}
        for row in result
    ]


@router.get("/{site_id}/top-pages")
async def top_pages(
    site_id: int,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _owned_site(site_id, user, db)
    since = _since(days)
    result = await db.execute(
        select(Event.path, func.count().label("views"))
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "pageview",
        )
        .group_by(Event.path)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return [{"path": r.path or "/", "views": r.views} for r in result]


@router.get("/{site_id}/top-elements")
async def top_elements(
    site_id: int,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _owned_site(site_id, user, db)
    since = _since(days)
    result = await db.execute(
        select(
            Event.element_selector,
            Event.element_text,
            func.count().label("clicks"),
        )
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "click",
        )
        .group_by(Event.element_selector, Event.element_text)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return [
        {
            "selector": r.element_selector or "(necunoscut)",
            "text": r.element_text,
            "clicks": r.clicks,
        }
        for r in result
    ]


@router.get("/{site_id}/breakdown")
async def breakdown(
    site_id: int,
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Surse de trafic (referrer) + tipuri de device."""
    await _owned_site(site_id, user, db)
    since = _since(days)

    ref_rows = await db.execute(
        select(Event.referrer, func.count().label("c"))
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "pageview",
        )
        .group_by(Event.referrer)
        .order_by(func.count().desc())
        .limit(10)
    )
    dev_rows = await db.execute(
        select(Event.device_type, func.count().label("c"))
        .where(Event.site_id == site_id, Event.created_at >= since)
        .group_by(Event.device_type)
        .order_by(func.count().desc())
    )
    return {
        "referrers": [
            {"referrer": r.referrer or "(direct)", "count": r.c} for r in ref_rows
        ],
        "devices": [{"device": r.device_type or "unknown", "count": r.c} for r in dev_rows],
    }


@router.get("/{site_id}/heatmap")
async def heatmap(
    site_id: int,
    path: str = Query(..., max_length=1024),
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Punctele de click (x%, y%) pentru o pagină dată — pentru heatmap."""
    await _owned_site(site_id, user, db)
    since = _since(days)
    result = await db.execute(
        select(Event.x_pct, Event.y_pct)
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "click",
            Event.path == path,
            Event.x_pct.isnot(None),
            Event.y_pct.isnot(None),
        )
        .limit(5000)
    )
    points = [{"x": r.x_pct, "y": r.y_pct} for r in result]
    return {"path": path, "points": points, "count": len(points)}


@router.get("/{site_id}/paths")
async def list_paths(
    site_id: int,
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista paginilor care au cel puțin un click (pentru selectorul de heatmap)."""
    await _owned_site(site_id, user, db)
    since = _since(days)
    result = await db.execute(
        select(Event.path, func.count().label("clicks"))
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "click",
        )
        .group_by(Event.path)
        .order_by(func.count().desc())
    )
    return [{"path": r.path or "/", "clicks": r.clicks} for r in result]


# ============================================================================
#  COMPORTAMENT PER VIZITATOR (sesiuni + jurnal) — „Webvisor lite"
# ============================================================================


@router.get("/{site_id}/sessions")
async def sessions(
    site_id: int,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sesiunile recente, cu rezumat (durată, pagini, click-uri, sursă, landing)."""
    site = await _owned_site(site_id, user, db)
    since = _since(days)
    min_ms = site.min_engagement_seconds * 1000

    # 1) Agregat per sesiune: timpi, contoare, device.
    #    Timpul activ numără doar engagement-urile peste pragul de atenție.
    agg = await db.execute(
        select(
            Event.session_id,
            func.min(Event.created_at).label("first_seen"),
            func.max(Event.created_at).label("last_seen"),
            func.max(Event.visitor_id).label("visitor_id"),
            func.max(Event.device_type).label("device"),
            func.count().filter(Event.type == "pageview").label("pageviews"),
            func.count().filter(Event.type == "click").label("clicks"),
            func.coalesce(
                func.sum(Event.duration_ms).filter(Event.duration_ms >= min_ms), 0
            ).label("active_ms"),
        )
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.session_id != "",
        )
        .group_by(Event.session_id)
        .order_by(func.max(Event.created_at).desc())
        .limit(limit)
    )
    rows = agg.all()
    session_ids = [r.session_id for r in rows]

    # 2) Primul eveniment al fiecărei sesiuni (landing + sursă + campanie).
    #    DISTINCT ON (session_id) + ORDER BY created_at => primul în timp.
    landing: dict[str, object] = {}
    if session_ids:
        land_rows = await db.execute(
            select(
                Event.session_id,
                Event.path,
                Event.referrer,
                Event.utm_source,
                Event.utm_medium,
                Event.utm_campaign,
            )
            .distinct(Event.session_id)
            .where(Event.site_id == site_id, Event.session_id.in_(session_ids))
            .order_by(Event.session_id, Event.created_at)
        )
        for r in land_rows:
            landing[r.session_id] = r

    out = []
    for r in rows:
        l = landing.get(r.session_id)
        out.append(
            {
                "session_id": r.session_id,
                "visitor_id": r.visitor_id,
                "first_seen": r.first_seen.isoformat(),
                "last_seen": r.last_seen.isoformat(),
                "duration_s": round((r.last_seen - r.first_seen).total_seconds()),
                "active_s": round((r.active_ms or 0) / 1000),
                "pageviews": r.pageviews,
                "clicks": r.clicks,
                "device": r.device or "unknown",
                "landing": (getattr(l, "path", "") or "/") if l else "/",
                "referrer": (getattr(l, "referrer", "") or "(direct)") if l else "(direct)",
                "utm_source": getattr(l, "utm_source", None) if l else None,
                "utm_campaign": getattr(l, "utm_campaign", None) if l else None,
            }
        )
    return out


@router.get("/{site_id}/journey")
async def journey(
    site_id: int,
    session_id: str = Query(..., max_length=64),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Traseul cronologic detaliat al unei sesiuni — istoria de click-uri/scroll."""
    await _owned_site(site_id, user, db)
    result = await db.execute(
        select(
            Event.created_at,
            Event.type,
            Event.path,
            Event.element_text,
            Event.element_selector,
            Event.scroll_depth,
            Event.duration_ms,
            Event.referrer,
            Event.props,
        )
        .where(Event.site_id == site_id, Event.session_id == session_id)
        .order_by(Event.created_at)
        .limit(2000)
    )
    return [
        {
            "at": r.created_at.isoformat(),
            "type": r.type,
            "path": r.path,
            "text": r.element_text or "",
            "selector": r.element_selector or "",
            "scroll_depth": r.scroll_depth,
            "duration_s": round(r.duration_ms / 1000) if r.duration_ms else None,
            "referrer": r.referrer or "",
            "props": r.props,
        }
        for r in result
    ]


# ============================================================================
#  ATENȚIE & ENGAGEMENT
# ============================================================================


@router.get("/{site_id}/engagement")
async def engagement(
    site_id: int,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(15, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Per pagină: vizualizări + timp mediu activ (cât țin atenția paginile)."""
    site = await _owned_site(site_id, user, db)
    since = _since(days)
    min_ms = site.min_engagement_seconds * 1000

    pv_rows = await db.execute(
        select(Event.path, func.count().label("views"))
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "pageview",
        )
        .group_by(Event.path)
    )
    views = {r.path: r.views for r in pv_rows}

    eng_rows = await db.execute(
        select(
            Event.path,
            func.avg(Event.duration_ms).label("avg_ms"),
            func.max(Event.scroll_depth).label("max_scroll"),
        )
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "engagement",
            Event.duration_ms >= min_ms,
        )
        .group_by(Event.path)
    )
    eng = {r.path: r for r in eng_rows}

    out = []
    for path, v in views.items():
        e = eng.get(path)
        out.append(
            {
                "path": path or "/",
                "views": v,
                "avg_seconds": round((e.avg_ms or 0) / 1000) if e else 0,
            }
        )
    out.sort(key=lambda x: x["views"], reverse=True)
    return out[:limit]


@router.get("/{site_id}/scrollmap")
async def scrollmap(
    site_id: int,
    path: str = Query(..., max_length=1024),
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Curba de atenție: % din vizitatori care ajung la fiecare adâncime de scroll."""
    await _owned_site(site_id, user, db)
    since = _since(days)

    base = await db.scalar(
        select(func.count(func.distinct(Event.session_id))).where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "pageview",
            Event.path == path,
            Event.session_id != "",
        )
    ) or 0

    rows = await db.execute(
        select(
            Event.scroll_depth,
            func.count(func.distinct(Event.session_id)).label("sessions"),
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
    reached = {r.scroll_depth: r.sessions for r in rows}

    curve = [
        {
            "depth": d,
            "sessions": reached.get(d, 0),
            "pct": round(100 * reached.get(d, 0) / base) if base else 0,
        }
        for d in (25, 50, 75, 100)
    ]
    return {"path": path, "base_sessions": base, "curve": curve}


@router.get("/{site_id}/campaigns")
async def campaigns(
    site_id: int,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Atribuire campanie: breakdown după UTM (source / medium / campaign)."""
    await _owned_site(site_id, user, db)
    since = _since(days)
    rows = await db.execute(
        select(
            Event.utm_source,
            Event.utm_medium,
            Event.utm_campaign,
            func.count(func.distinct(Event.session_id)).label("sessions"),
            func.count().filter(Event.type == "pageview").label("pageviews"),
        )
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.utm_source.isnot(None),
        )
        .group_by(Event.utm_source, Event.utm_medium, Event.utm_campaign)
        .order_by(func.count(func.distinct(Event.session_id)).desc())
        .limit(limit)
    )
    return [
        {
            "source": r.utm_source or "(necunoscut)",
            "medium": r.utm_medium or "—",
            "campaign": r.utm_campaign or "—",
            "sessions": r.sessions,
            "pageviews": r.pageviews,
        }
        for r in rows
    ]
