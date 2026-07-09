from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_cap
from app.config import settings
from app.core.access import access_level, can_manage
from app.core.sanitize import clean_text
from app.database import get_db
from app.models import ResourceShare, Site, User
from app.schemas.site import SiteCreate, SiteOut, SiteUpdate, SiteWithSnippet

router = APIRouter(
    prefix="/api/sites", tags=["sites"], dependencies=[Depends(require_cap("sites"))]
)


def build_snippet(site_key: str) -> str:
    return (
        f'<script async src="{settings.public_url}/px/t.js" '
        f'data-site="{site_key}"></script>'
    )


def _site_out(
    site: Site, access: str | None, can_edit: bool, owner_email: str | None
) -> SiteOut:
    """Construiește SiteOut cu câmpurile de partajare completate."""
    return SiteOut(
        **SiteOut.model_validate(site).model_dump(
            exclude={"access", "can_edit", "owner_email"}
        ),
        access=access,
        can_edit=can_edit,
        owner_email=owner_email,
    )


async def _get_accessible_site(
    site_id: int, user: User, db: AsyncSession
) -> tuple[Site, str, bool]:
    """Întoarce (site, access, can_edit) dacă userul poate VEDEA site-ul; altfel 404."""
    site = await db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site inexistent")
    access, editable = await access_level("site", site.id, site.owner_id, user, db)
    if access is None:
        raise HTTPException(status_code=404, detail="Site inexistent")
    return site, access, editable


@router.get("", response_model=list[SiteOut])
async def list_sites(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    # Admin vede toate site-urile; userul obișnuit vede proprii + cele partajate.
    if user.is_admin:
        rows = await db.execute(
            select(Site, User.email)
            .join(User, User.id == Site.owner_id)
            .order_by(Site.created_at.desc())
        )
        return [
            _site_out(
                site,
                "owner" if site.owner_id == user.id else "admin",
                True,
                owner_email,
            )
            for site, owner_email in rows.all()
        ]

    shared_ids = (
        select(ResourceShare.resource_id).where(
            ResourceShare.resource_type == "site",
            ResourceShare.user_id == user.id,
        )
    ).scalar_subquery()
    rows = await db.execute(
        select(Site, User.email, ResourceShare.can_edit)
        .join(User, User.id == Site.owner_id)
        .outerjoin(
            ResourceShare,
            (ResourceShare.resource_type == "site")
            & (ResourceShare.resource_id == Site.id)
            & (ResourceShare.user_id == user.id),
        )
        .where(or_(Site.owner_id == user.id, Site.id.in_(shared_ids)))
        .order_by(Site.created_at.desc())
    )
    out = []
    for site, owner_email, share_can_edit in rows.all():
        if site.owner_id == user.id:
            out.append(_site_out(site, "owner", True, owner_email))
        else:
            out.append(
                _site_out(site, "shared", bool(share_can_edit), owner_email)
            )
    return out


@router.post("", response_model=SiteWithSnippet, status_code=status.HTTP_201_CREATED)
async def create_site(
    payload: SiteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    site = Site(
        name=clean_text(payload.name),
        domain=clean_text(payload.domain),
        owner_id=user.id,
    )
    db.add(site)
    await db.flush()
    await db.refresh(site)
    return SiteWithSnippet(
        **_site_out(site, "owner", True, user.email).model_dump(),
        snippet=build_snippet(site.site_key),
    )


@router.get("/{site_id}", response_model=SiteWithSnippet)
async def get_site(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    site, access, editable = await _get_accessible_site(site_id, user, db)
    owner = await db.get(User, site.owner_id)
    return SiteWithSnippet(
        **_site_out(
            site, access, editable, owner.email if owner else None
        ).model_dump(),
        snippet=build_snippet(site.site_key),
    )


@router.patch("/{site_id}", response_model=SiteOut)
async def update_site(
    site_id: int,
    payload: SiteUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    site, access, editable = await _get_accessible_site(site_id, user, db)
    if not editable:
        raise HTTPException(status_code=403, detail="Nu ai drept de editare")
    if payload.name is not None:
        site.name = clean_text(payload.name)
    if payload.domain is not None:
        site.domain = clean_text(payload.domain)
    if payload.min_engagement_seconds is not None:
        site.min_engagement_seconds = payload.min_engagement_seconds
    await db.flush()
    await db.refresh(site)
    owner = await db.get(User, site.owner_id)
    return _site_out(site, access, editable, owner.email if owner else None)


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_site(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    site, access, _ = await _get_accessible_site(site_id, user, db)
    # Ștergerea e permisă DOAR owner-ului sau adminului.
    if not can_manage(access):
        raise HTTPException(status_code=403, detail="Doar proprietarul poate șterge")
    # Curățăm share-urile aferente (site_id se refolosește doar teoretic, dar
    # evităm orphan-uri).
    await db.execute(
        delete(ResourceShare).where(
            ResourceShare.resource_type == "site",
            ResourceShare.resource_id == site.id,
        )
    )
    await db.delete(site)
