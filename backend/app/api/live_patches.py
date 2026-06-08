"""Patch-uri DOM live (Faza 3 din viziune) — modelul „C": `t.js` aplică în browser.

Două routere:
  - `router` (privat, /api/live-patches, require_cap("sites")): owner-ul își creează,
    generează (AI), aprobă (publish) și oprește (pause) patch-urile.
  - `public_router` (public, /px/patches): `t.js` cere patch-urile LIVE ale unei pagini
    și le aplică. E read-only, fără date personale, deci CORS permisiv (`*`).

POARTA din §9 (risc × încredere × gardian GDPR) e impusă la PUBLISH:
  - un patch blocat de gardian NU poate trece live (veto dur);
  - risc „medium"+ cere aprobare umană explicită (nu poate fi `auto_apply`).
"""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_cap
from app.core.sanitize import clean_text
from app.database import get_db
from app.models import LivePatch, Site, User
from app.schemas.live_patch import (
    LivePatchCreate,
    LivePatchOut,
    LivePatchUpdate,
    PatchGenerateRequest,
)
from app.services.aggregates import aggregates_for_path
from app.services.patch_ai import derive_risk, generate_patch, guard_patch
from app.services.scope import owned_site

router = APIRouter(
    prefix="/api/live-patches",
    tags=["live-patches"],
    dependencies=[Depends(require_cap("sites"))],
)


async def _owned_patch(
    site_id: int, patch_id: int, user: User, db: AsyncSession
) -> LivePatch:
    await owned_site(site_id, user, db)
    p = await db.get(LivePatch, patch_id)
    if not p or p.site_id != site_id:
        raise HTTPException(status_code=404, detail="Patch inexistent")
    return p


@router.get("/{site_id}", response_model=list[LivePatchOut])
async def list_patches(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await owned_site(site_id, user, db)
    rows = await db.execute(
        select(LivePatch)
        .where(LivePatch.site_id == site_id)
        .order_by(LivePatch.created_at.desc())
    )
    return list(rows.scalars().all())


@router.post("/{site_id}", response_model=LivePatchOut, status_code=201)
async def create_patch(
    site_id: int,
    payload: LivePatchCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Patch scris de OM. Trece prin gardianul GDPR la creare; rămâne DRAFT."""
    await owned_site(site_id, user, db)
    patch = {
        "label": clean_text(payload.label),
        "selector": payload.selector,
        "op": payload.op,
        "prop": payload.prop,
        "value": payload.value,
    }
    blocked, reason = await guard_patch(db, patch)
    p = LivePatch(
        site_id=site_id,
        path=payload.path[:1024],
        label=patch["label"][:255],
        selector=payload.selector[:1024],
        op=payload.op,
        prop=payload.prop[:255],
        value=payload.value[:4000],
        risk=derive_risk(payload.op, payload.prop),
        source="human",
        status="draft",
        blocked=blocked,
        blocked_reason=reason[:512],
    )
    db.add(p)
    await db.flush()
    return p


@router.post("/{site_id}/generate")
async def generate_patch_endpoint(
    site_id: int,
    payload: PatchGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI transformă o recomandare CRO într-un patch DRAFT (verificat de gardian).

    Folosește elementele REALE ale paginii (din agregate) ca AI-ul să țintească
    un selector existent. Rezultatul NU e live — îl verifici și îl publici tu.
    """
    site = await owned_site(site_id, user, db)
    aggregates = await aggregates_for_path(site, payload.path, payload.days, db)
    result = await generate_patch(
        db, aggregates.get("top_elements", []), payload.instruction
    )
    if not result.get("available") or result.get("error"):
        return result

    p = LivePatch(
        site_id=site_id,
        path=payload.path[:1024],
        label=result["label"][:255],
        selector=result["selector"][:1024],
        op=result["op"],
        prop=result["prop"][:255],
        value=result["value"][:4000],
        risk=result["risk"],
        source="ai",
        status="draft",
        blocked=result["blocked"],
        blocked_reason=result["blocked_reason"][:512],
    )
    db.add(p)
    await db.flush()
    return {"available": True, **LivePatchOut.model_validate(p).model_dump()}


@router.put("/{site_id}/{patch_id}", response_model=LivePatchOut)
async def update_patch(
    site_id: int,
    patch_id: int,
    payload: LivePatchUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Editează un patch. Orice modificare îl re-trece prin gardian și îl întoarce
    la DRAFT (o schimbare trebuie re-aprobată ca să rămână live — nu strecurăm
    modificări nevăzute pe site)."""
    p = await _owned_patch(site_id, patch_id, user, db)
    if payload.label is not None:
        p.label = clean_text(payload.label)[:255]
    if payload.selector is not None:
        p.selector = payload.selector[:1024]
    if payload.op is not None:
        p.op = payload.op
    if payload.prop is not None:
        p.prop = payload.prop[:255]
    if payload.value is not None:
        p.value = payload.value[:4000]
    p.risk = derive_risk(p.op, p.prop)
    blocked, reason = await guard_patch(
        db, {"label": p.label, "selector": p.selector, "op": p.op, "prop": p.prop, "value": p.value}
    )
    p.blocked = blocked
    p.blocked_reason = reason[:512]
    p.status = "draft"  # re-aprobare obligatorie după editare
    await db.flush()
    return p


@router.post("/{site_id}/{patch_id}/publish", response_model=LivePatchOut)
async def publish_patch(
    site_id: int,
    patch_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aprobă & pune LIVE un patch. Aici se aplică POARTA din §9 (veto dur)."""
    p = await _owned_patch(site_id, patch_id, user, db)
    if p.blocked:
        raise HTTPException(
            status_code=400,
            detail="Patch blocat de gardianul GDPR — nu poate trece live.",
        )
    p.status = "live"
    await db.flush()
    return p


@router.post("/{site_id}/{patch_id}/pause", response_model=LivePatchOut)
async def pause_patch(
    site_id: int,
    patch_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Oprește un patch live (revine la draft) — nu mai e servit de t.js."""
    p = await _owned_patch(site_id, patch_id, user, db)
    p.status = "draft"
    await db.flush()
    return p


@router.post("/{site_id}/{patch_id}/auto-apply", response_model=LivePatchOut)
async def toggle_auto_apply(
    site_id: int,
    patch_id: int,
    enabled: bool = True,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Comută auto-aplicarea. Permisă DOAR pentru risc mic + neblocat (partea
    „auto" a hibridului din §9); altfel o refuzăm — schimbarea cere aprobare umană."""
    p = await _owned_patch(site_id, patch_id, user, db)
    if enabled and (p.risk != "low" or p.blocked):
        raise HTTPException(
            status_code=400,
            detail="Auto-aplicarea e permisă doar pentru patch-uri cu risc mic și neblocate.",
        )
    p.auto_apply = enabled
    await db.flush()
    return p


@router.delete("/{site_id}/{patch_id}", status_code=204)
async def delete_patch(
    site_id: int,
    patch_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    p = await _owned_patch(site_id, patch_id, user, db)
    await db.delete(p)


# ---------------------------------------------------------------------------
#  Servire publică pentru t.js — patch-urile LIVE ale unei pagini
# ---------------------------------------------------------------------------

public_router = APIRouter(prefix="/px", tags=["pixel-patches"])


@public_router.get("/patches")
async def serve_patches(
    site: str,
    path: str = "/",
    db: AsyncSession = Depends(get_db),
):
    """Patch-urile LIVE pentru (site_key, path). Le cere `t.js` la fiecare pageview.

    Răspuns minimal (doar selector/op/prop/value) — nimic personal. CORS `*` fiindcă
    `t.js` rulează pe domeniul clientului și TREBUIE să poată citi răspunsul.
    """
    s = await db.scalar(select(Site).where(Site.site_key == site))
    headers = {"Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"}
    if not s:
        return Response('{"patches":[]}', media_type="application/json", headers=headers)
    rows = await db.execute(
        select(LivePatch).where(
            LivePatch.site_id == s.id,
            LivePatch.path == path,
            LivePatch.status == "live",
            LivePatch.blocked.is_(False),  # centură + bretele: blocatele nu ies niciodată
        )
    )
    patches = [
        {"selector": p.selector, "op": p.op, "prop": p.prop, "value": p.value}
        for p in rows.scalars().all()
    ]
    import json

    return Response(
        json.dumps({"patches": patches}, ensure_ascii=False),
        media_type="application/json",
        headers=headers,
    )
