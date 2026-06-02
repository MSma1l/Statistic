from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import decode_access_token
from app.database import get_db
from app.models import User


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str | None = Cookie(default=None, alias=settings.COOKIE_NAME),
) -> User:
    # Tokenul vine din cookie-ul httpOnly
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Neautentificat"
        )
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalid"
        )
    user = await db.get(User, int(user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cont inexistent sau inactiv",
        )
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Necesită drepturi de admin"
        )
    return user


def has_cap(user: User, cap: str) -> bool:
    """admin are toate capabilitățile; altfel verifică flagul can_<cap>."""
    if user.is_admin:
        return True
    return bool(getattr(user, f"can_{cap}", False))


def require_cap(cap: str):
    """Dependență care cere o capabilitate (sites / links / qr)."""

    async def _dep(user: User = Depends(get_current_user)) -> User:
        if not has_cap(user, cap):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Nu ai permisiunea pentru această secțiune",
            )
        return user

    return _dep


async def require_links_area(user: User = Depends(get_current_user)) -> User:
    """Acces la zona Linkuri/QR/Galerie dacă are cel puțin una dintre capabilități."""
    if not (has_cap(user, "links") or has_cap(user, "qr")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nu ai permisiunea pentru această secțiune",
        )
    return user
