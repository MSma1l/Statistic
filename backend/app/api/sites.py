from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_cap
from app.config import settings
from app.core.sanitize import clean_text
from app.database import get_db
from app.models import Site, User
from app.schemas.site import SiteCreate, SiteOut, SiteUpdate, SiteWithSnippet

router = APIRouter(
    prefix="/api/sites", tags=["sites"], dependencies=[Depends(require_cap("sites"))]
)


def build_snippet(site_key: str, consent_required: bool = False) -> str:
    # `data-consent="required"` spune lui t.js să NU urmărească până la consimțământ.
    consent_attr = ' data-consent="required"' if consent_required else ""
    return (
        f'<script async src="{settings.public_url}/px/t.js" '
        f'data-site="{site_key}"{consent_attr}></script>'
    )


async def _get_owned_site(site_id: int, user: User, db: AsyncSession) -> Site:
    site = await db.get(Site, site_id)
    if not site or site.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Site inexistent")
    return site


@router.get("", response_model=list[SiteOut])
async def list_sites(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Site).where(Site.owner_id == user.id).order_by(Site.created_at.desc())
    )
    return result.scalars().all()


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
        **SiteOut.model_validate(site).model_dump(),
        snippet=build_snippet(site.site_key, site.consent_required),
    )


@router.get("/{site_id}", response_model=SiteWithSnippet)
async def get_site(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    site = await _get_owned_site(site_id, user, db)
    return SiteWithSnippet(
        **SiteOut.model_validate(site).model_dump(),
        snippet=build_snippet(site.site_key, site.consent_required),
    )


@router.patch("/{site_id}", response_model=SiteOut)
async def update_site(
    site_id: int,
    payload: SiteUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    site = await _get_owned_site(site_id, user, db)
    if payload.name is not None:
        site.name = clean_text(payload.name)
    if payload.domain is not None:
        site.domain = clean_text(payload.domain)
    if payload.min_engagement_seconds is not None:
        site.min_engagement_seconds = payload.min_engagement_seconds
    if payload.consent_required is not None:
        site.consent_required = payload.consent_required
    if payload.retention_days is not None:
        site.retention_days = payload.retention_days
    await db.flush()
    await db.refresh(site)
    return site


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_site(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    site = await _get_owned_site(site_id, user, db)
    await db.delete(site)
