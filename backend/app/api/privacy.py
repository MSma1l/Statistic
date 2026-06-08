"""GDPR platformă Nivel 1 — drept la ștergere (viziune §10, Nivel 1).

Două căi de ștergere a tot ce ține de un `visitor_id`:
  - PUBLIC (`/px/forget`): self-service. Vizitatorul (prin t.js, cu propriul
    `visitor_id` din localStorage) își cere ștergerea datelor. E „dreptul la
    ștergere" exercitat direct de persoana vizată, fără cont.
  - PRIVAT (owner, sub /api/sites): owner-ul site-ului procesează manual o cerere
    de ștergere (ex. primită pe email), cu un preview al câte evenimente există.

Ștergem evenimentele brute ȘI alocările din experimente (orice îl leagă pe om de
comportamentul lui). Agregatele deja calculate nu conțin identificatori, deci rămân.
"""

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_cap
from app.core.guard import limiter
from app.database import get_db
from app.models import Event, Experiment, ExperimentAssignment, Site, User
from app.services.scope import owned_site

router = APIRouter(
    prefix="/api/sites", tags=["privacy"], dependencies=[Depends(require_cap("sites"))]
)


async def _count_visitor_events(site_id: int, vid: str, db: AsyncSession) -> int:
    return (
        await db.scalar(
            select(func.count()).where(
                Event.site_id == site_id, Event.visitor_id == vid
            )
        )
        or 0
    )


async def _erase_visitor(site_id: int, vid: str, db: AsyncSession) -> int:
    """Șterge tot ce ține de un vizitator pe un site. Întoarce nr. de evenimente șterse."""
    count = await _count_visitor_events(site_id, vid, db)
    await db.execute(
        delete(Event).where(Event.site_id == site_id, Event.visitor_id == vid)
    )
    # Alocările din experimentele ACESTUI site (leagă vizitatorul de un braț).
    await db.execute(
        delete(ExperimentAssignment).where(
            ExperimentAssignment.visitor_id == vid,
            ExperimentAssignment.experiment_id.in_(
                select(Experiment.id).where(Experiment.site_id == site_id)
            ),
        )
    )
    return count


@router.get("/{site_id}/privacy/visitor/{visitor_id}")
async def preview_visitor(
    site_id: int,
    visitor_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Câte evenimente are un vizitator (preview înainte de ștergere)."""
    await owned_site(site_id, user, db)
    return {"visitor_id": visitor_id, "events": await _count_visitor_events(site_id, visitor_id[:64], db)}


@router.delete("/{site_id}/privacy/visitor/{visitor_id}")
async def erase_visitor(
    site_id: int,
    visitor_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Owner-ul procesează o cerere de ștergere pentru un vizitator anume."""
    await owned_site(site_id, user, db)
    deleted = await _erase_visitor(site_id, visitor_id[:64], db)
    return {"visitor_id": visitor_id, "deleted_events": deleted}


# ---------------------------------------------------------------------------
#  Public: self-service erasure declanșat de t.js (window.statistic.forget())
# ---------------------------------------------------------------------------

public_router = APIRouter(prefix="/px", tags=["privacy-public"])


@public_router.post("/forget", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def forget(request: Request, db: AsyncSession = Depends(get_db)):
    """Persoana vizată își șterge propriile date (corp text/plain: site + visitor_id).

    Răspundem mereu 204 (nu dezvăluim dacă site-ul/vizitatorul există). Rate-limitat
    ca să nu fie folosit ca unealtă de ștergere în masă.
    """
    import json

    headers = {"Access-Control-Allow-Origin": "*"}
    try:
        body = json.loads(await request.body())
        site_key = str(body.get("site", ""))[:64]
        vid = str(body.get("visitor_id", ""))[:64]
    except (TypeError, ValueError):
        return Response(status_code=status.HTTP_204_NO_CONTENT, headers=headers)

    if site_key and vid:
        s = await db.scalar(select(Site).where(Site.site_key == site_key))
        if s:
            await _erase_visitor(s.id, vid, db)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=headers)
