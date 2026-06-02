from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, has_cap, require_links_area
from app.config import settings
from app.core.qrgen import qr_png_bytes, qr_svg_bytes
from app.core.sanitize import clean_text
from app.database import get_db
from app.models import GalleryImage, LinkVisit, TrackedLink, User
from app.schemas.link import LinkCreate, LinkOut, LinkUpdate, LinkWithUrls

router = APIRouter(
    prefix="/api/links", tags=["links"], dependencies=[Depends(require_links_area)]
)


def _allowed_kinds(user: User) -> list[str]:
    kinds = []
    if has_cap(user, "links"):
        kinds.append("link")
    if has_cap(user, "qr"):
        kinds.append("qr")
    return kinds


def _check_kind(user: User, kind: str) -> None:
    if kind == "qr" and not has_cap(user, "qr"):
        raise HTTPException(status_code=403, detail="Nu ai permisiunea pentru QR coduri")
    if kind == "link" and not has_cap(user, "links"):
        raise HTTPException(status_code=403, detail="Nu ai permisiunea pentru linkuri")


def _short_url(slug: str) -> str:
    return f"{settings.public_url}/l/{slug}"


def _qr_target(slug: str) -> str:
    return f"{settings.public_url}/q/{slug}"


def _to_with_urls(link: TrackedLink, total: int = 0) -> LinkWithUrls:
    return LinkWithUrls(
        **LinkOut.model_validate(link).model_dump(),
        short_url=_short_url(link.slug),
        # qr_url rămâne pe API (imaginea e servită autentificat din dashboard)
        qr_url=f"{settings.BASE_URL}/api/links/{link.id}/qr.png",
        total_visits=total,
    )


async def _owned_link(link_id: int, user: User, db: AsyncSession) -> TrackedLink:
    link = await db.get(TrackedLink, link_id)
    if not link or link.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Link inexistent")
    if link.kind not in _allowed_kinds(user):
        raise HTTPException(status_code=404, detail="Link inexistent")
    return link


async def _validate_logo(logo_id: int | None, user: User, db: AsyncSession) -> int | None:
    """Verifică faptul că logo-ul ales aparține utilizatorului."""
    if logo_id is None:
        return None
    img = await db.get(GalleryImage, logo_id)
    if not img or img.owner_id != user.id:
        raise HTTPException(status_code=400, detail="Imagine logo inexistentă")
    return logo_id


async def _logo_bytes(link: TrackedLink, db: AsyncSession) -> bytes | None:
    if not link.logo_image_id:
        return None
    img = await db.get(GalleryImage, link.logo_image_id)
    return img.data if img else None


@router.get("", response_model=list[LinkWithUrls])
async def list_links(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(TrackedLink, func.count(LinkVisit.id))
        .outerjoin(LinkVisit, LinkVisit.link_id == TrackedLink.id)
        .where(
            TrackedLink.owner_id == user.id,
            TrackedLink.kind.in_(_allowed_kinds(user)),
        )
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
    _check_kind(user, payload.kind)
    logo_id = await _validate_logo(payload.logo_image_id, user, db)
    link = TrackedLink(
        slug=payload.slug,
        destination_url=payload.destination_url,
        name=clean_text(payload.name),
        description=clean_text(payload.description),
        location_label=clean_text(payload.location_label),
        kind=payload.kind,
        logo_image_id=logo_id,
        owner_id=user.id,
    )
    db.add(link)
    await db.flush()
    await db.refresh(link)
    return _to_with_urls(link, 0)


@router.get("/overview")
async def links_overview(
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Statistici agregate peste toate linkurile userului (pentru dashboard)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    kinds = _allowed_kinds(user)
    owned = (
        select(TrackedLink.id)
        .where(TrackedLink.owner_id == user.id, TrackedLink.kind.in_(kinds))
        .scalar_subquery()
    )

    links_count = await db.scalar(
        select(func.count()).where(
            TrackedLink.owner_id == user.id, TrackedLink.kind.in_(kinds)
        )
    )
    total = await db.scalar(select(func.count()).where(LinkVisit.link_id.in_(owned)))
    scans = await db.scalar(
        select(func.count()).where(
            LinkVisit.link_id.in_(owned), LinkVisit.source == "qr"
        )
    )
    clicks = await db.scalar(
        select(func.count()).where(
            LinkVisit.link_id.in_(owned), LinkVisit.source == "link"
        )
    )

    # Top linkuri (care aduc cele mai multe intrări/lead-uri)
    top_rows = await db.execute(
        select(
            TrackedLink.id,
            TrackedLink.name,
            TrackedLink.slug,
            TrackedLink.location_label,
            TrackedLink.kind,
            func.count(LinkVisit.id).label("visits"),
        )
        .outerjoin(LinkVisit, LinkVisit.link_id == TrackedLink.id)
        .where(TrackedLink.owner_id == user.id, TrackedLink.kind.in_(kinds))
        .group_by(TrackedLink.id)
        .order_by(func.count(LinkVisit.id).desc())
        .limit(8)
    )
    top_links = [
        {
            "id": r.id,
            "name": r.name or r.slug,
            "slug": r.slug,
            "location_label": r.location_label,
            "kind": r.kind,
            "visits": r.visits,
        }
        for r in top_rows
    ]

    # Unde s-au deschis cel mai mult (după locația indicată)
    loc_rows = await db.execute(
        select(TrackedLink.location_label, func.count(LinkVisit.id).label("c"))
        .join(LinkVisit, LinkVisit.link_id == TrackedLink.id)
        .where(
            TrackedLink.owner_id == user.id,
            TrackedLink.kind.in_(kinds),
            LinkVisit.created_at >= since,
        )
        .group_by(TrackedLink.location_label)
        .order_by(func.count(LinkVisit.id).desc())
        .limit(8)
    )
    by_location = [
        {"location": r.location_label or "(fără locație)", "count": r.c} for r in loc_rows
    ]

    # Evoluție în timp (toate intrările pe linkuri)
    day = func.date_trunc("day", LinkVisit.created_at).label("day")
    ts_rows = await db.execute(
        select(day, func.count().label("c"))
        .where(LinkVisit.link_id.in_(owned), LinkVisit.created_at >= since)
        .group_by(day)
        .order_by(day)
    )
    timeseries = [{"day": r.day.date().isoformat(), "visits": r.c} for r in ts_rows]

    return {
        "links_count": links_count or 0,
        "total": total or 0,
        "scans": scans or 0,
        "clicks": clicks or 0,
        "top_links": top_links,
        "by_location": by_location,
        "timeseries": timeseries,
    }


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
    if payload.kind is not None:
        _check_kind(user, payload.kind)
        link.kind = payload.kind
    if payload.clear_logo:
        link.logo_image_id = None
    elif payload.logo_image_id is not None:
        link.logo_image_id = await _validate_logo(payload.logo_image_id, user, db)
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
    logo = await _logo_bytes(link, db)
    return Response(content=qr_png_bytes(_qr_target(link.slug), logo), media_type="image/png")


@router.get("/{link_id}/qr.svg")
async def qr_svg(
    link_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    link = await _owned_link(link_id, user, db)
    logo = await _logo_bytes(link, db)
    return Response(
        content=qr_svg_bytes(_qr_target(link.slug), logo), media_type="image/svg+xml"
    )


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
