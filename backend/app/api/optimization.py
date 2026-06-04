"""Router pentru stratul A/B Marketing (Faza 0 + Faza 1).

Subțire intenționat: aici stă DOAR expunerea HTTP (rute, validare, ownership).
Calculul real e în servicii:
  - pâlnia comparativă        -> services/funnel.py
  - agregatele unui landing   -> services/aggregates.py
  - consultantul AI + gardian -> services/ai_advisor.py

Folosește același prefix `/api/analytics` și aceeași gardă `require_cap("sites")`
ca router-ul de analytics, ca să fie o continuare firească a aceleiași zone.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_cap
from app.core.sanitize import clean_text
from app.database import get_db
from app.models import FunnelStep, User
from app.schemas.funnel import AiAnalyzeIn, FunnelStepIn, FunnelStepOut
from app.services.aggregates import aggregates_for_path
from app.services.ai_advisor import analyze_landing
from app.services.funnel import funnel_compare
from app.services.scope import owned_site

router = APIRouter(
    prefix="/api/analytics",
    tags=["optimization"],
    dependencies=[Depends(require_cap("sites"))],
)

# Limită sanitară pe numărul de trepte (o pâlnie reală are câteva, nu sute).
_MAX_FUNNEL_STEPS = 20


@router.get("/{site_id}/funnel", response_model=list[FunnelStepOut])
async def get_funnel(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Treptele de funnel + conversie definite pentru site (ordonate)."""
    await owned_site(site_id, user, db)
    rows = await db.execute(
        select(FunnelStep)
        .where(FunnelStep.site_id == site_id)
        .order_by(FunnelStep.position)
    )
    return list(rows.scalars().all())


@router.put("/{site_id}/funnel", response_model=list[FunnelStepOut])
async def put_funnel(
    site_id: int,
    steps: list[FunnelStepIn],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Înlocuiește TOATĂ lista de trepte (model simplu „salvează tot").

    DE CE delete + reinsert: pâlnia e mică și se editează rar; reconstruirea ei
    integrală e trivial de înțeles și exclude stările parțiale. `position` derivă
    din ordinea trimisă de UI.
    """
    await owned_site(site_id, user, db)
    if len(steps) > _MAX_FUNNEL_STEPS:
        raise HTTPException(status_code=400, detail="Prea multe trepte de funnel.")

    await db.execute(delete(FunnelStep).where(FunnelStep.site_id == site_id))
    for i, s in enumerate(steps):
        db.add(
            FunnelStep(
                site_id=site_id,
                position=i,
                kind=s.kind,
                # value e potrivit EXACT pe path / element_text => nu-l alterăm
                # (doar lungimea, deja limitată din schema). label e text afișat => îl curățăm.
                value=s.value[:1024],
                label=clean_text(s.label)[:255],
                is_conversion=s.is_conversion,
            )
        )
    await db.flush()
    rows = await db.execute(
        select(FunnelStep)
        .where(FunnelStep.site_id == site_id)
        .order_by(FunnelStep.position)
    )
    return list(rows.scalars().all())


@router.get("/{site_id}/funnel-compare")
async def funnel_compare_endpoint(
    site_id: int,
    days: int = Query(30, ge=1, le=365),
    group_by: str = Query("landing", pattern="^(landing|campaign)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compară landing-uri (sau campanii) pe pâlnia completă + metrici de calitate."""
    site = await owned_site(site_id, user, db)
    return await funnel_compare(site, days, group_by, db)


@router.post("/{site_id}/ai-analyze")
async def ai_analyze(
    site_id: int,
    payload: AiAnalyzeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analiză AI a unui landing: agregate -> consultant CRO + gardian GDPR.

    Răspunde mereu cu un obiect care are `available`; dacă lipsește cheia API,
    `available=False` + mesaj clar (restul aplicației merge normal).
    """
    site = await owned_site(site_id, user, db)
    aggregates = await aggregates_for_path(site, payload.path, payload.days, db)

    # Atașăm și pâlnia LANDING-ului analizat (contextul de conversie pentru AI).
    compare = await funnel_compare(site, payload.days, "landing", db)
    funnel_group = next(
        (g for g in compare["groups"] if g["group"] == payload.path), None
    )

    return await analyze_landing(
        db,
        {
            "path": payload.path,
            "days": payload.days,
            "funnel": funnel_group,
            "funnel_steps": compare["funnel_steps"],
            **aggregates,
        },
    )
