"""Experimente A/B cu alocare bandit (viziune §6) — modelul „C" peste Faza 3.

Două routere:
  - `router` (privat, /api/experiments, require_cap): owner-ul creează experimentul
    (control + variante), îl pornește/oprește și vede statisticile per braț.
  - `public_router` (public, /px/experiment): `t.js` întreabă „ce braț pentru acest
    vizitator?", primește patch-ul brațului (sau nimic la control) și-l aplică.

Decizia de alocare și calculul statisticilor stau în `services/bandit.py`.
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_cap
from app.core.sanitize import clean_text
from app.database import get_db
from app.models import (
    Experiment,
    ExperimentArm,
    ExperimentAssignment,
    Site,
    User,
)
from app.schemas.experiment import ExperimentCreate, ExperimentOut
from app.services.bandit import choose_arm, experiment_stats
from app.services.scope import owned_site

router = APIRouter(
    prefix="/api/experiments",
    tags=["experiments"],
    dependencies=[Depends(require_cap("sites"))],
)


async def _load(experiment_id: int, db: AsyncSession) -> Experiment | None:
    """Experimentul cu brațele eager-loaded (relația e nevoie sincron mai jos)."""
    return await db.scalar(
        select(Experiment)
        .where(Experiment.id == experiment_id)
        .options(selectinload(Experiment.arms))
    )


async def _owned_experiment(
    site_id: int, experiment_id: int, user: User, db: AsyncSession
) -> Experiment:
    await owned_site(site_id, user, db)
    exp = await _load(experiment_id, db)
    if not exp or exp.site_id != site_id:
        raise HTTPException(status_code=404, detail="Experiment inexistent")
    return exp


@router.get("/{site_id}", response_model=list[ExperimentOut])
async def list_experiments(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await owned_site(site_id, user, db)
    rows = await db.execute(
        select(Experiment)
        .where(Experiment.site_id == site_id)
        .options(selectinload(Experiment.arms))
        .order_by(Experiment.created_at.desc())
    )
    return list(rows.scalars().all())


@router.post("/{site_id}", response_model=ExperimentOut, status_code=201)
async def create_experiment(
    site_id: int,
    payload: ExperimentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creează un experiment oprit (îl pornești explicit). Brațele non-control cu
    risc mediu+ sunt acceptate, dar le vezi marcate — banditul nu „aprobă" singur
    schimbări riscante; pornirea experimentului e decizia ta."""
    await owned_site(site_id, user, db)
    exp = Experiment(
        site_id=site_id,
        path=payload.path[:1024],
        name=clean_text(payload.name)[:255] or payload.path[:255],
        status="stopped",
    )
    db.add(exp)
    await db.flush()
    for a in payload.arms:
        db.add(
            ExperimentArm(
                experiment_id=exp.id,
                name=clean_text(a.name)[:255] or ("Control" if a.is_control else "Variantă"),
                is_control=a.is_control,
                selector="" if a.is_control else a.selector[:1024],
                op=a.op,
                prop="" if a.is_control else a.prop[:255],
                value="" if a.is_control else a.value[:4000],
            )
        )
    await db.flush()
    return await _load(exp.id, db)


@router.post("/{site_id}/{experiment_id}/start", response_model=ExperimentOut)
async def start_experiment(
    site_id: int,
    experiment_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exp = await _owned_experiment(site_id, experiment_id, user, db)
    exp.status = "running"
    await db.flush()
    return await _load(exp.id, db)


@router.post("/{site_id}/{experiment_id}/stop", response_model=ExperimentOut)
async def stop_experiment(
    site_id: int,
    experiment_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exp = await _owned_experiment(site_id, experiment_id, user, db)
    exp.status = "stopped"
    await db.flush()
    return await _load(exp.id, db)


@router.get("/{site_id}/{experiment_id}/stats")
async def get_stats(
    site_id: int,
    experiment_id: int,
    days: int = 30,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Per braț: trafic alocat, conversii, rată, % alocare bandit, campion + confidence."""
    site = await owned_site(site_id, user, db)
    exp = await _owned_experiment(site_id, experiment_id, user, db)
    return await experiment_stats(exp, site, max(1, min(365, days)), db)


@router.delete("/{site_id}/{experiment_id}", status_code=204)
async def delete_experiment(
    site_id: int,
    experiment_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exp = await _owned_experiment(site_id, experiment_id, user, db)
    await db.delete(exp)


# ---------------------------------------------------------------------------
#  Public: t.js cere brațul vizitatorului
# ---------------------------------------------------------------------------

public_router = APIRouter(prefix="/px", tags=["pixel-experiment"])

_CORS = {"Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"}


def _json(payload: dict) -> Response:
    return Response(
        json.dumps(payload, ensure_ascii=False),
        media_type="application/json",
        headers=_CORS,
    )


@public_router.get("/experiment")
async def assign_arm(
    site: str,
    path: str = "/",
    vid: str = "",
    db: AsyncSession = Depends(get_db),
):
    """Întoarce patch-ul brațului alocat acestui vizitator (sticky). Control => `null`.

    Răspuns: {"arm": null | {"selector","op","prop","value"}}. Fără date personale.
    """
    s = await db.scalar(select(Site).where(Site.site_key == site))
    if not s or not vid:
        return _json({"arm": None})

    exp = await db.scalar(
        select(Experiment)
        .where(
            Experiment.site_id == s.id,
            Experiment.path == path,
            Experiment.status == "running",
        )
        .options(selectinload(Experiment.arms))
        .order_by(Experiment.created_at.desc())
    )
    if not exp or not exp.arms:
        return _json({"arm": None})

    vid = vid[:64]
    # Sticky: dacă vizitatorul are deja un braț, îl păstrăm (experiență stabilă).
    existing = await db.scalar(
        select(ExperimentAssignment.arm_id).where(
            ExperimentAssignment.experiment_id == exp.id,
            ExperimentAssignment.visitor_id == vid,
        )
    )
    if existing is not None:
        arm = next((a for a in exp.arms if a.id == existing), None)
    else:
        arm = await choose_arm(exp, s, db)
        db.add(
            ExperimentAssignment(experiment_id=exp.id, arm_id=arm.id, visitor_id=vid)
        )
        try:
            await db.flush()
        except IntegrityError:
            # Cursă: două cereri ale aceluiași vizitator deodată. Re-citim brațul deja scris.
            await db.rollback()
            existing = await db.scalar(
                select(ExperimentAssignment.arm_id).where(
                    ExperimentAssignment.experiment_id == exp.id,
                    ExperimentAssignment.visitor_id == vid,
                )
            )
            arm = next((a for a in exp.arms if a.id == existing), None)

    if not arm or arm.is_control:
        return _json({"arm": None})
    return _json(
        {"arm": {"selector": arm.selector, "op": arm.op, "prop": arm.prop, "value": arm.value}}
    )
