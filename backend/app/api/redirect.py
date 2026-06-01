from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from user_agents import parse as parse_ua

from app.core.security import hash_ip
from app.database import get_db
from app.models import LinkVisit, TrackedLink

router = APIRouter(tags=["redirect"])


def _device_type(ua_string: str) -> str:
    try:
        ua = parse_ua(ua_string)
        if ua.is_mobile:
            return "mobile"
        if ua.is_tablet:
            return "tablet"
        if ua.is_pc:
            return "desktop"
        if ua.is_bot:
            return "bot"
    except Exception:
        pass
    return "unknown"


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


async def _handle(slug: str, source: str, request: Request, db: AsyncSession):
    result = await db.execute(
        select(TrackedLink).where(TrackedLink.slug == slug.lower())
    )
    link = result.scalar_one_or_none()
    if not link or not link.is_active:
        # 404 simplu pentru linkuri inexistente/inactive
        return RedirectResponse(url="/", status_code=302)

    ua_string = request.headers.get("user-agent", "")[:512]
    db.add(
        LinkVisit(
            link_id=link.id,
            source=source,
            referrer=request.headers.get("referer", "")[:1024],
            user_agent=ua_string,
            device_type=_device_type(ua_string),
            ip_hash=hash_ip(_client_ip(request)),
        )
    )
    return RedirectResponse(url=link.destination_url, status_code=302)


@router.get("/l/{slug}")
async def redirect_link(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    return await _handle(slug, "link", request, db)


@router.get("/q/{slug}")
async def redirect_qr(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    return await _handle(slug, "qr", request, db)
