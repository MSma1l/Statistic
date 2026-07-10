from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from user_agents import parse as parse_ua

from app.core.security import hash_ip
from app.database import get_db
from app.models import LinkVisit, TrackedLink

router = APIRouter(tags=["redirect"])

# Cuvinte rezervate: căi proprii ale aplicației (docs, health, API, pixel etc.)
# care NU trebuie tratate ca slug de către ruta „catch-all" GET /{slug}.
_RESERVED_SLUGS = {
    "health",
    "docs",
    "redoc",
    "openapi.json",
    "favicon.ico",
    "api",
    "auth",
    "px",
    "l",
    "q",
}


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


async def _resolve_and_record(
    slug: str, source: str, request: Request, db: AsyncSession
) -> str | None:
    """Logica comună: găsește linkul activ după slug, înregistrează vizita
    (`LinkVisit` cu sursa dată) și întoarce URL-ul destinație.

    Întoarce None dacă slug-ul e inexistent sau linkul e inactiv (fiecare rută
    decide singură cum tratează acest caz).
    """
    result = await db.execute(
        select(TrackedLink).where(TrackedLink.slug == slug.lower())
    )
    link = result.scalar_one_or_none()
    if not link or not link.is_active:
        return None

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
    return link.destination_url


@router.get("/l/{slug}")
async def redirect_link(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    # Compatibilitate: linkurile /l/ vechi. Slug inexistent/inactiv → home.
    dest = await _resolve_and_record(slug, "link", request, db)
    return RedirectResponse(url=dest or "/", status_code=302)


@router.get("/q/{slug}")
async def redirect_qr(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    # Compatibilitate: QR-urile /q/ deja printate. Slug inexistent/inactiv → home.
    dest = await _resolve_and_record(slug, "qr", request, db)
    return RedirectResponse(url=dest or "/", status_code=302)


@router.get("/{slug}")
async def redirect_clean(
    slug: str, request: Request, q: str | None = None, db: AsyncSession = Depends(get_db)
):
    """Ruta curată DOMENIU/<slug>. Marcajul invizibil ?q=1 (pus în conținutul
    QR) marchează scanarea; altfel e un click obișnuit."""
    # Nu trata căile proprii ale aplicației ca slug.
    if slug.lower() in _RESERVED_SLUGS:
        raise HTTPException(status_code=404, detail="Not found")
    source = "qr" if q is not None else "link"
    dest = await _resolve_and_record(slug, source, request, db)
    if dest is None:
        raise HTTPException(status_code=404, detail="Link inexistent")
    return RedirectResponse(url=dest, status_code=302)
