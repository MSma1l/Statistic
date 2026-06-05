"""Landinguri găzduite + buclă de aplicare AI (Faza 2 din viziune).

Două routere:
  - `router` (privat, /api/analytics, require_cap("sites")): management landinguri,
    versionare, generare AI, publicare. Tot ce face owner-ul site-ului.
  - `public_router` (public, /lp): SERVEȘTE versiunea publicată la path-ul ei, ca
    s-o vadă vizitatorul. Aici se „aplică" efectiv schimbarea aprobată.

Bucla cerută: adaugi landing-ul → AI propune o versiune din recomandare → tu o
verifici (diff) → o aprobi (sau o editezi/dai varianta ta) → la aprobare devine
versiunea publicată și e servită automat la path/url.
"""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_cap
from app.config import settings
from app.core.sanitize import clean_text
from app.database import get_db
from app.models import LandingPage, LandingVersion, Site, User
from app.schemas.landing import (
    GenerateRequest,
    LandingCreate,
    LandingOut,
    LandingUpdate,
    VersionCreate,
    VersionOut,
)
from app.services.landing_ai import generate_version
from app.services.scope import owned_site

router = APIRouter(
    prefix="/api/landings",
    tags=["landings"],
    dependencies=[Depends(require_cap("sites"))],
)


# ---------------------------------------------------------------------------
#  Helpere
# ---------------------------------------------------------------------------


async def _owned_landing(
    site_id: int, landing_id: int, user: User, db: AsyncSession
) -> LandingPage:
    """Landing-ul, doar dacă site-ul lui aparține userului."""
    await owned_site(site_id, user, db)
    lp = await db.get(LandingPage, landing_id)
    if not lp or lp.site_id != site_id:
        raise HTTPException(status_code=404, detail="Landing inexistent")
    return lp


async def _next_version_no(landing_id: int, db: AsyncSession) -> int:
    mx = await db.scalar(
        select(func.max(LandingVersion.version_no)).where(
            LandingVersion.landing_id == landing_id
        )
    )
    return (mx or 0) + 1


# ---------------------------------------------------------------------------
#  CRUD landinguri
# ---------------------------------------------------------------------------


@router.get("/{site_id}", response_model=list[LandingOut])
async def list_landings(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await owned_site(site_id, user, db)
    rows = await db.execute(
        select(LandingPage)
        .where(LandingPage.site_id == site_id)
        .order_by(LandingPage.created_at.desc())
    )
    return list(rows.scalars().all())


@router.post("/{site_id}", response_model=LandingOut, status_code=201)
async def create_landing(
    site_id: int,
    payload: LandingCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Adaugă un landing + prima versiune (sursa pe care o aduci în sistem)."""
    await owned_site(site_id, user, db)
    lp = LandingPage(
        site_id=site_id,
        path=payload.path[:1024],
        label=clean_text(payload.label)[:255],
    )
    db.add(lp)
    await db.flush()
    # Prima versiune (scrisă de om), nepublicată până nu o publici explicit.
    v = LandingVersion(
        landing_id=lp.id,
        version_no=1,
        html=payload.html,
        css=payload.css,
        js=payload.js,
        source="human",
        note="versiune inițială",
        status="draft",
    )
    db.add(v)
    await db.flush()
    return lp


@router.get("/{site_id}/{landing_id}")
async def get_landing(
    site_id: int,
    landing_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Landing + lista versiunilor (fără conținutul lor mare — doar meta)."""
    lp = await _owned_landing(site_id, landing_id, user, db)
    rows = await db.execute(
        select(LandingVersion)
        .where(LandingVersion.landing_id == landing_id)
        .order_by(LandingVersion.version_no.desc())
    )
    versions = [VersionOut.model_validate(v) for v in rows.scalars().all()]
    return {
        "landing": LandingOut.model_validate(lp),
        "published_version_id": lp.published_version_id,
        "public_url": f"{settings.public_url}/lp/{await _site_key(site_id, db)}{lp.path}",
        "versions": versions,
    }


async def _site_key(site_id: int, db: AsyncSession) -> str:
    return await db.scalar(select(Site.site_key).where(Site.id == site_id)) or ""


@router.put("/{site_id}/{landing_id}", response_model=LandingOut)
async def update_landing(
    site_id: int,
    landing_id: int,
    payload: LandingUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lp = await _owned_landing(site_id, landing_id, user, db)
    if payload.path is not None:
        lp.path = payload.path[:1024]
    if payload.label is not None:
        lp.label = clean_text(payload.label)[:255]
    await db.flush()
    return lp


@router.delete("/{site_id}/{landing_id}", status_code=204)
async def delete_landing(
    site_id: int,
    landing_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lp = await _owned_landing(site_id, landing_id, user, db)
    await db.delete(lp)


# ---------------------------------------------------------------------------
#  Versiuni: conținut, creare manuală, generare AI, publicare
# ---------------------------------------------------------------------------


@router.get("/{site_id}/{landing_id}/versions/{version_id}")
async def get_version(
    site_id: int,
    landing_id: int,
    version_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Conținutul complet (html/css/js) al unei versiuni — pentru diff/editare."""
    await _owned_landing(site_id, landing_id, user, db)
    v = await db.get(LandingVersion, version_id)
    if not v or v.landing_id != landing_id:
        raise HTTPException(status_code=404, detail="Versiune inexistentă")
    return {
        **VersionOut.model_validate(v).model_dump(),
        "html": v.html,
        "css": v.css,
        "js": v.js,
    }


@router.post("/{site_id}/{landing_id}/versions", response_model=VersionOut)
async def create_version(
    site_id: int,
    landing_id: int,
    payload: VersionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Versiune scrisă/editată de OM („dau versiunea mea")."""
    await _owned_landing(site_id, landing_id, user, db)
    v = LandingVersion(
        landing_id=landing_id,
        version_no=await _next_version_no(landing_id, db),
        html=payload.html,
        css=payload.css,
        js=payload.js,
        source="human",
        note=clean_text(payload.note)[:512] or "versiune manuală",
        status="draft",
    )
    db.add(v)
    await db.flush()
    return v


@router.post("/{site_id}/{landing_id}/generate")
async def generate_landing_version(
    site_id: int,
    landing_id: int,
    payload: GenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI aplică o recomandare pe versiunea curentă → DRAFT (verificat de gardian).

    Pleacă de la versiunea publicată dacă există, altfel de la cea mai recentă.
    Rezultatul NU se publică automat — îl vezi, îl aprobi sau îl editezi.
    """
    lp = await _owned_landing(site_id, landing_id, user, db)

    base = None
    if lp.published_version_id:
        base = await db.get(LandingVersion, lp.published_version_id)
    if base is None:
        base = await db.scalar(
            select(LandingVersion)
            .where(LandingVersion.landing_id == landing_id)
            .order_by(LandingVersion.version_no.desc())
            .limit(1)
        )
    current = (
        {"html": base.html, "css": base.css, "js": base.js}
        if base
        else {"html": "", "css": "", "js": ""}
    )

    result = await generate_version(db, current, payload.instruction)
    if not result.get("available") or result.get("error"):
        # AI indisponibil / eroare — întoarcem mesajul, fără să creăm versiune.
        return result

    v = LandingVersion(
        landing_id=landing_id,
        version_no=await _next_version_no(landing_id, db),
        html=result["html"],
        css=result["css"],
        js=result["js"],
        source="ai",
        note=result.get("note", "")[:512] or "generat de AI",
        status="draft",
        blocked=bool(result.get("blocked")),
        blocked_reason=result.get("blocked_reason", "")[:512],
    )
    db.add(v)
    await db.flush()
    return {
        "available": True,
        **VersionOut.model_validate(v).model_dump(),
        "html": v.html,
        "css": v.css,
        "js": v.js,
    }


@router.post("/{site_id}/{landing_id}/versions/{version_id}/publish")
async def publish_version(
    site_id: int,
    landing_id: int,
    version_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aprobă & publică o versiune → devine cea servită. Blocate de gardian = interzis."""
    lp = await _owned_landing(site_id, landing_id, user, db)
    v = await db.get(LandingVersion, version_id)
    if not v or v.landing_id != landing_id:
        raise HTTPException(status_code=404, detail="Versiune inexistentă")
    if v.blocked:
        raise HTTPException(
            status_code=400,
            detail="Versiune blocată de gardianul GDPR — nu poate fi publicată.",
        )
    # Cea veche revine la draft; cea nouă devine published.
    if lp.published_version_id:
        old = await db.get(LandingVersion, lp.published_version_id)
        if old:
            old.status = "archived"
    v.status = "published"
    lp.published_version_id = v.id
    await db.flush()
    return {"published_version_id": v.id, "version_no": v.version_no}


# ---------------------------------------------------------------------------
#  Servire publică (fără auth) — versiunea aprobată, la path-ul ei
# ---------------------------------------------------------------------------

public_router = APIRouter(prefix="/lp", tags=["landing-public"])


def _render(site_key: str, version: LandingVersion) -> str:
    """Asamblează documentul HTML servit: CSS în <head>, JS la final, pixel injectat.

    Injectăm automat snippetul de tracking → landing-ul găzduit e urmărit din start,
    deci alimentează direct pâlnia de comparație. `html` se așază în <body>.
    """
    pixel = f'<script async src="{settings.public_url}/px/t.js" data-site="{site_key}"></script>'
    return (
        "<!doctype html><html lang=\"ro\"><head><meta charset=\"utf-8\">"
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<style>{version.css}</style>{pixel}</head><body>"
        f"{version.html}<script>{version.js}</script></body></html>"
    )


@public_router.get("/{site_key}/{path:path}")
async def serve_landing(
    site_key: str,
    path: str,
    db: AsyncSession = Depends(get_db),
):
    """Servește versiunea publicată a landing-ului identificat prin (site_key, path)."""
    site = await db.scalar(select(Site).where(Site.site_key == site_key))
    if not site:
        raise HTTPException(status_code=404, detail="Necunoscut")
    # path-ul vine fără „/" în față din ruta `:path`; landing-urile îl țin cu „/".
    norm = "/" + path.lstrip("/")
    lp = await db.scalar(
        select(LandingPage).where(
            LandingPage.site_id == site.id, LandingPage.path == norm
        )
    )
    if not lp or not lp.published_version_id:
        raise HTTPException(status_code=404, detail="Nicio versiune publicată")
    version = await db.get(LandingVersion, lp.published_version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Nicio versiune publicată")
    return Response(content=_render(site_key, version), media_type="text/html")
