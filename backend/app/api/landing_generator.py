"""Router pentru generatorul de landing-uri de vânzări (modul adițional).

Subțire: citește READ-ONLY datele existente (pixelul site-ului + linkurile scurte
ale userului) și cheamă serviciul AI care construiește pagina. Nu modifică nimic
din ce există — salvarea paginii generate se face prin endpoint-urile existente
de landing-uri (`/api/landings`), deci aici doar PRODUCEM conținutul.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_cap
from app.config import settings
from app.database import get_db
from app.models import Site, TrackedLink, User
from app.services.landing_generator_ai import TEMPLATES, generate_landing
from app.services.scope import owned_site

router = APIRouter(
    prefix="/api/landing-generator",
    tags=["landing-generator"],
    dependencies=[Depends(require_cap("sites"))],
)


def _pixel_snippet(site_key: str) -> str:
    """Același snippet ca în zona de site-uri (pixelul nostru de tracking)."""
    return f'<script async src="{settings.public_url}/px/t.js" data-site="{site_key}"></script>'


@router.get("/templates")
async def list_templates(_: User = Depends(get_current_user)):
    """Șabloanele de bază disponibile (AI-ul pleacă de la unul și-l perfecționează)."""
    return [
        {"id": tid, "name": t["name"], "description": t["description"]}
        for tid, t in TEMPLATES.items()
    ]


@router.get("/{site_id}/assets")
async def site_assets(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ce poate conecta AI-ul: pixelul site-ului + linkurile scurte ale userului."""
    site = await owned_site(site_id, user, db)
    rows = await db.execute(
        select(TrackedLink)
        .where(TrackedLink.owner_id == user.id, TrackedLink.is_active.is_(True))
        .order_by(TrackedLink.created_at.desc())
    )
    links = [
        {
            "slug": l.slug,
            "name": l.name or l.slug,
            "destination_url": l.destination_url,
            "short_url": f"{settings.public_url}/l/{l.slug}",
            "qr_scan_url": f"{settings.public_url}/q/{l.slug}",
        }
        for l in rows.scalars().all()
    ]
    return {
        "site_key": site.site_key,
        "pixel_snippet": _pixel_snippet(site.site_key),
        "links": links,
    }


class GenerateBody(BaseModel):
    brief: str = Field(min_length=1, max_length=6000)
    template_id: str = Field(default="blank", max_length=32)
    # Slug-urile linkurilor de conectat la butoanele CTA.
    link_slugs: list[str] = Field(default_factory=list)
    include_pixel: bool = True


@router.post("/{site_id}/generate")
async def generate(
    site_id: int,
    body: GenerateBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Construiește o pagină de vânzări nouă din brief + șablon, cu tracking conectat."""
    site = await owned_site(site_id, user, db)

    # Rezolvăm slug-urile alese la URL-uri scurte (doar linkurile userului).
    chosen: list[dict] = []
    if body.link_slugs:
        rows = await db.execute(
            select(TrackedLink).where(
                TrackedLink.owner_id == user.id,
                TrackedLink.slug.in_(body.link_slugs),
            )
        )
        for l in rows.scalars().all():
            chosen.append(
                {
                    "label": l.name or l.slug,
                    "url": f"{settings.public_url}/l/{l.slug}",
                }
            )

    pixel = _pixel_snippet(site.site_key) if body.include_pixel else ""
    return await generate_landing(db, body.brief, body.template_id, pixel, chosen)


@router.get("/{site_id}/preview-pixel")
async def preview_pixel(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _q: str = Query(default="", include_in_schema=False),
):
    """Mic helper: snippetul pixel al site-ului (pentru afișare în UI)."""
    site = await owned_site(site_id, user, db)
    return {"pixel_snippet": _pixel_snippet(site.site_key)}
