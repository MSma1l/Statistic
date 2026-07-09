"""Endpoint-uri de partajare per-resursă (site / link).

Cine poate gestiona share-urile unei resurse: OWNER-ul resursei sau un admin.
Userul cu care se partajează primește acces de vizualizare (și editare dacă
`can_edit`), dar niciodată ștergere sau re-partajare.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models import ResourceShare, Site, TrackedLink, User
from app.schemas.share import ShareCreate, ShareOut, ShareUpdate

router = APIRouter(prefix="/api/shares", tags=["shares"])


async def _resource_owner_id(
    resource_type: str, resource_id: int, db: AsyncSession
) -> int | None:
    """Owner-ul resursei date sau None dacă resursa nu există."""
    if resource_type == "site":
        obj = await db.get(Site, resource_id)
    else:
        obj = await db.get(TrackedLink, resource_id)
    return obj.owner_id if obj else None


async def _assert_can_manage(
    resource_type: str, resource_id: int, user: User, db: AsyncSession
) -> int:
    """Verifică faptul că userul poate gestiona share-urile resursei.

    Întoarce owner_id-ul resursei. 404 dacă resursa nu există, 403 dacă
    requesterul nu e owner/admin.
    """
    owner_id = await _resource_owner_id(resource_type, resource_id, db)
    if owner_id is None:
        raise HTTPException(status_code=404, detail="Resursă inexistentă")
    if not (user.is_admin or owner_id == user.id):
        raise HTTPException(
            status_code=403, detail="Doar proprietarul poate gestiona partajarea"
        )
    return owner_id


async def _share_out(share: ResourceShare, db: AsyncSession) -> ShareOut:
    target = await db.get(User, share.user_id)
    return ShareOut(
        id=share.id,
        user_id=share.user_id,
        user_email=target.email if target else "",
        can_edit=share.can_edit,
        created_at=share.created_at,
    )


@router.get("", response_model=list[ShareOut])
async def list_shares(
    resource_type: str = Query(...),
    resource_id: int = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    resource_type = (resource_type or "").strip().lower()
    if resource_type not in ("site", "link"):
        raise HTTPException(status_code=400, detail="Tip de resursă invalid")
    await _assert_can_manage(resource_type, resource_id, user, db)
    rows = await db.execute(
        select(ResourceShare)
        .where(
            ResourceShare.resource_type == resource_type,
            ResourceShare.resource_id == resource_id,
        )
        .order_by(ResourceShare.created_at.desc())
    )
    return [await _share_out(s, db) for s in rows.scalars()]


@router.post("", response_model=ShareOut, status_code=status.HTTP_201_CREATED)
async def create_share(
    payload: ShareCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    owner_id = await _assert_can_manage(
        payload.resource_type, payload.resource_id, user, db
    )
    # Nu are sens să partajezi cu owner-ul resursei sau cu tine însuți.
    if payload.user_id == owner_id or payload.user_id == user.id:
        raise HTTPException(
            status_code=400, detail="Nu poți partaja cu proprietarul resursei"
        )
    target = await db.get(User, payload.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utilizator inexistent")
    # Duplicat?
    existing = await db.scalar(
        select(ResourceShare).where(
            ResourceShare.resource_type == payload.resource_type,
            ResourceShare.resource_id == payload.resource_id,
            ResourceShare.user_id == payload.user_id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Resursa e deja partajată cu userul")
    share = ResourceShare(
        resource_type=payload.resource_type,
        resource_id=payload.resource_id,
        user_id=payload.user_id,
        can_edit=payload.can_edit,
    )
    db.add(share)
    await db.flush()
    await db.refresh(share)
    return await _share_out(share, db)


@router.patch("/{share_id}", response_model=ShareOut)
async def update_share(
    share_id: int,
    payload: ShareUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    share = await db.get(ResourceShare, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Partajare inexistentă")
    await _assert_can_manage(share.resource_type, share.resource_id, user, db)
    share.can_edit = payload.can_edit
    await db.flush()
    await db.refresh(share)
    return await _share_out(share, db)


@router.delete("/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_share(
    share_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    share = await db.get(ResourceShare, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Partajare inexistentă")
    await _assert_can_manage(share.resource_type, share.resource_id, user, db)
    await db.delete(share)
