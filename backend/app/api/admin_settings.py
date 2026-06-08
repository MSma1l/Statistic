from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.config import settings
from app.core.app_settings import DEFAULTS, get_all_settings, set_setting
from app.database import get_db
from app.models import User

# Setările editabile (prompturi, reguli GDPR, praguri) sunt globale și sensibile,
# deci toată zona cere drepturi de admin — la fel ca gestiunea de utilizatori.
router = APIRouter(
    prefix="/api/admin/settings",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


class SettingUpdate(BaseModel):
    # `value` e liber ca tip (text/număr/listă) — îl validăm după `kind`.
    value: object


@router.get("")
async def list_settings(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Toate setările editabile + starea cheii AI (din .env, doar citită)."""
    return {
        # `ai_enabled` îi spune UI-ului dacă să afișeze „AI indisponibil".
        # Cheia în sine NU se trimite niciodată spre frontend (e secret).
        "ai": {
            "enabled": settings.ai_enabled,
            "model": settings.AI_MODEL,
        },
        "settings": await get_all_settings(db),
    }


@router.put("/{key}")
async def update_setting(
    key: str,
    payload: SettingUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Salvează o setare. Cheia trebuie să fie una cunoscută (vezi DEFAULTS)."""
    if key not in DEFAULTS:
        raise HTTPException(status_code=404, detail="Setare necunoscută")

    kind = DEFAULTS[key]["kind"]
    value = payload.value

    # Validare minimală după tipul declarat, ca să nu stricăm citirile ulterioare.
    if kind == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise HTTPException(status_code=400, detail="Această setare cere un număr")
    elif kind == "bool":
        if not isinstance(value, bool):
            raise HTTPException(status_code=400, detail="Această setare cere true/false")
    elif kind == "text":
        if not isinstance(value, str):
            raise HTTPException(status_code=400, detail="Această setare cere text")
    elif kind == "json":
        # gdpr.rules: listă de {match: [str], reason: str}.
        if not isinstance(value, list):
            raise HTTPException(status_code=400, detail="Această setare cere o listă")
        for rule in value:
            if (
                not isinstance(rule, dict)
                or not isinstance(rule.get("match"), list)
                or not isinstance(rule.get("reason"), str)
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Fiecare regulă cere {match: [cuvinte], reason: text}",
                )

    await set_setting(db, key, value)
    return {"key": key, "value": value}
