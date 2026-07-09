"""Reguli de acces per-resursă (partajare + vizibilitate de admin).

O resursă (site sau link) poate fi accesată de:
  - owner            → acces complet (view/edit/delete/share);
  - admin            → acces complet la ORICE resursă;
  - user cu share    → view mereu; edit doar dacă `can_edit`; NU delete/re-share;
  - altcineva        → fără acces (404 la detaliu, exclus din liste).

Helperele întorc/impun nivelul de acces pornind de la un `ResourceShare`.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ResourceShare, User


async def _get_share(
    resource_type: str, resource_id: int, user: User, db: AsyncSession
) -> ResourceShare | None:
    """Share-ul (dacă există) al userului pentru resursa dată."""
    return await db.scalar(
        select(ResourceShare).where(
            ResourceShare.resource_type == resource_type,
            ResourceShare.resource_id == resource_id,
            ResourceShare.user_id == user.id,
        )
    )


async def access_level(
    resource_type: str,
    resource_id: int,
    owner_id: int,
    user: User,
    db: AsyncSession,
) -> tuple[str | None, bool]:
    """Întoarce (access, can_edit) pentru user pe resursa dată.

    `access` ∈ {"owner", "admin", "shared", None}. `None` = fără acces.
    """
    if owner_id == user.id:
        return "owner", True
    if user.is_admin:
        return "admin", True
    share = await _get_share(resource_type, resource_id, user, db)
    if share:
        return "shared", bool(share.can_edit)
    return None, False


async def can_view(
    resource_type: str,
    resource_id: int,
    owner_id: int,
    user: User,
    db: AsyncSession,
) -> bool:
    access, _ = await access_level(resource_type, resource_id, owner_id, user, db)
    return access is not None


async def can_edit(
    resource_type: str,
    resource_id: int,
    owner_id: int,
    user: User,
    db: AsyncSession,
) -> bool:
    access, editable = await access_level(
        resource_type, resource_id, owner_id, user, db
    )
    return access is not None and editable


def can_manage(access: str | None) -> bool:
    """Cine poate gestiona share-uri / șterge resursa: doar owner sau admin."""
    return access in ("owner", "admin")
