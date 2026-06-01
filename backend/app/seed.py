from sqlalchemy import select

from app.config import settings
from app.core.security import hash_password
from app.database import AsyncSessionLocal
from app.models import User


async def seed_admin() -> None:
    """Creează admin-ul inițial dacă nu există deja niciun utilizator."""
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User.id).limit(1))
        if existing.first():
            return
        admin = User(
            email=settings.FIRST_ADMIN_EMAIL.lower(),
            full_name="Administrator",
            password_hash=hash_password(settings.FIRST_ADMIN_PASSWORD),
            is_admin=True,
        )
        db.add(admin)
        await db.commit()
        print(f"[seed] Admin creat: {settings.FIRST_ADMIN_EMAIL}")
