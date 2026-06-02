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
    await _owned_site(site_id, user, db)
    since = _since(days)
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
    return {
        "pageviews": pageviews or 0,
        "clicks": clicks or 0,
        "visitors": visitors or 0,
        "sessions": sessions or 0,
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
