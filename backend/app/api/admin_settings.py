"""Setări globale editabile din interfața de admin (tabela `app_settings`).

Expune peste HTTP helperele din `app.core.app_settings`: adminul poate citi
toate setările cunoscute (cu valoarea efectivă = DB sau default-ul din cod) și
poate salva o valoare nouă pentru o cheie, fără redeploy. Cheile necunoscute
sunt respinse (404) — schema de setări e definită în cod, nu liber în DB.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.app_settings import get_all_settings, set_setting
from app.database import get_db

router = APIRouter(
    prefix="/api/admin/settings",
    tags=["admin-settings"],
    dependencies=[Depends(require_admin)],
)


class SettingUpdate(BaseModel):
    # `value` poate fi text (prompt), număr (prag) sau listă (reguli GDPR).
    value: Any


@router.get("")
async def list_settings(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Toate setările cunoscute, cu valoarea efectivă (DB sau default) + meta pentru UI."""
    return await get_all_settings(db)


@router.put("/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def update_setting(
    key: str,
    payload: SettingUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Salvează (upsert) valoarea unei setări. Cheie necunoscută → 404."""
    try:
        await set_setting(db, key, payload.value)
    except KeyError:
        raise HTTPException(status_code=404, detail="Setare inexistentă")
