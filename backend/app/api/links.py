import io
from datetime import datetime, timedelta, timezone

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from qrcode.image.svg import SvgImage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.core.sanitize import clean_text
from app.database import get_db
from app.models import LinkVisit, TrackedLink, User
from app.schemas.link import LinkCreate, LinkOut, LinkUpdate, LinkWithUrls

router = APIRouter(prefix="/api/links", tags=["links"])


def _short_url(slug: str) -> str:
    return f"{settings.BASE_URL}/l/{slug}"


def _qr_target(slug: str) -> str:
    return f"{settings.BASE_URL}/q/{slug}"


def _to_with_urls(link: TrackedLink, total: int = 0) -> LinkWithUrls:
    return LinkWithUrls(
        **LinkOut.model_validate(link).model_dump(),
        short_url=_short_url(link.slug),
        qr_url=f"{settings.BASE_URL}/api/links/{link.id}/qr.png",
        total_visits=total,
    )


async def _owned_link(link_id: int, user: User, db: AsyncSession) -> TrackedLink:
    link = await db.get(TrackedLink, link_id)
    if not link or link.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Link inexistent")
    return link


@router.get("", response_model=list[LinkWithUrls])
async def list_links(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(TrackedLink, func.count(LinkVisit.id))
        .outerjoin(LinkVisit, LinkVisit.link_id == TrackedLink.id)
        .where(TrackedLink.owner_id == user.id)
        .group_by(TrackedLink.id)
        .order_by(TrackedLink.created_at.desc())
    )
    return [_to_with_urls(link, total) for link, total in result.all()]


@router.post("", response_model=LinkWithUrls, status_code=status.HTTP_201_CREATED)
async def create_link(
    payload: LinkCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(TrackedLink).where(TrackedLink.slug == payload.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Slug-ul este deja folosit")
    link = TrackedLink(
        slug=payload.slug,
        destination_url=payload.destination_url,
        name=clean_text(payload.name),
        description=clean_text(payload.description),
        location_label=clean_text(payload.location_label),
        owner_id=user.id,
    )
    db.add(link)
    await db.flush()
    await db.refresh(link)
    return _to_with_urls(link, 0)


@router.get("/{link_id}", response_model=LinkWithUrls)
async def get_link(
    link_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    link = await _owned_link(link_id, user, db)
    total = await db.scalar(
        select(func.count()).where(LinkVisit.link_id == link.id)
    )
    return _to_with_urls(link, total or 0)


@router.patch("/{link_id}", response_model=LinkWithUrls)
async def update_link(
    link_id: int,
    payload: LinkUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    link = await _owned_link(link_id, user, db)
    if payload.destination_url is not None:
        link.destination_url = payload.destination_url
    if payload.name is not None:
        link.name = clean_text(payload.name)
    if payload.description is not None:
        link.description = clean_text(payload.description)
    if payload.location_label is not None:
        link.location_label = clean_text(payload.location_label)
    if payload.is_active is not None:
        link.is_active = payload.is_active
    await db.flush()
    await db.refresh(link)
    total = await db.scalar(select(func.count()).where(LinkVisit.link_id == link.id))
    return _to_with_urls(link, total or 0)


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(
    link_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    link = await _owned_link(link_id, user, db)
    await db.delete(link)


@router.get("/{link_id}/qr.png")
async def qr_png(
    link_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    link = await _owned_link(link_id, user, db)
    img = qrcode.make(_qr_target(link.slug), box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@router.get("/{link_id}/qr.svg")
async def qr_svg(
    link_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    link = await _owned_link(link_id, user, db)
    img = qrcode.make(_qr_target(link.slug), image_factory=SvgImage, box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf)
    return Response(content=buf.getvalue(), media_type="image/svg+xml")


@router.get("/{link_id}/stats")
async def link_stats(
    link_id: int,
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    link = await _owned_link(link_id, user, db)
    since = datetime.now(timezone.utc) - timedelta(days=days)

    total = await db.scalar(select(func.count()).where(LinkVisit.link_id == link.id))
    scans = await db.scalar(
        select(func.count()).where(
            LinkVisit.link_id == link.id, LinkVisit.source == "qr"
        )
    )
    clicks = await db.scalar(
        select(func.count()).where(
            LinkVisit.link_id == link.id, LinkVisit.source == "link"
        )
    )

    day = func.date_trunc("day", LinkVisit.created_at).label("day")
    ts_rows = await db.execute(
        select(day, func.count().label("c"))
        .where(LinkVisit.link_id == link.id, LinkVisit.created_at >= since)
        .group_by(day)
        .order_by(day)
    )
    dev_rows = await db.execute(
        select(LinkVisit.device_type, func.count().label("c"))
        .where(LinkVisit.link_id == link.id, LinkVisit.created_at >= since)
        .group_by(LinkVisit.device_type)
        .order_by(func.count().desc())
    )
    ref_rows = await db.execute(
        select(LinkVisit.referrer, func.count().label("c"))
        .where(LinkVisit.link_id == link.id, LinkVisit.created_at >= since)
        .group_by(LinkVisit.referrer)
        .order_by(func.count().desc())
        .limit(10)
    )

    return {
        "total": total or 0,
        "scans": scans or 0,
        "clicks": clicks or 0,
        "timeseries": [
            {"day": r.day.date().isoformat(), "visits": r.c} for r in ts_rows
        ],
        "devices": [
            {"device": r.device_type or "unknown", "count": r.c} for r in dev_rows
        ],
        "referrers": [
            {"referrer": r.referrer or "(direct)", "count": r.c} for r in ref_rows
        ],
    }
