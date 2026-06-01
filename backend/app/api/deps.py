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
