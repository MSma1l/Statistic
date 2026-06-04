"""Helpere mici, partajate, pentru endpoint-urile de analytics.

DE CE un modul separat: atât router-ul vechi (`api/analytics.py`) cât și cel nou
(`api/optimization.py`) au nevoie de aceleași două lucruri — „dă-mi site-ul DOAR
dacă e al userului" și „de la ce dată în jos". Le ținem o singură dată aici,
ca să nu le duplicăm și să rămână o singură sursă de adevăr.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Site, User


def since(days: int) -> datetime:
    """Momentul `days` zile în urmă (UTC) — limita inferioară a interogărilor."""
    return datetime.now(timezone.utc) - timedelta(days=days)


async def owned_site(site_id: int, user: User, db: AsyncSession) -> Site:
    """Întoarce site-ul doar dacă aparține userului; altfel 404 (nu dezvăluim existența)."""
    site = await db.get(Site, site_id)
    if not site or site.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Site inexistent")
    return site
