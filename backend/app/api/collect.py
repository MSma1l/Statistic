import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from user_agents import parse as parse_ua

from app.core.guard import limiter
from app.core.sanitize import clean_text
from app.database import get_db
from app.models import Event, Site
from app.schemas.event import CollectPayload

router = APIRouter(prefix="/px", tags=["pixel"])

_ALLOWED_TYPES = {"pageview", "click", "scroll", "custom", "engagement"}
_TRACKER_PATH = Path(__file__).resolve().parent.parent / "static" / "t.js"


@router.get("/t.js")
async def tracker_script():
    """Servește scriptul de tracking care se pune pe site-uri."""
    return FileResponse(
        _TRACKER_PATH,
        media_type="application/javascript",
        headers={"Cache-Control": "public, max-age=3600"},
    )


def _clean_utm(value: str | None) -> str | None:
    """Sanitizează un parametru UTM (vine din URL, deci e input neîncrezut)."""
    if not value:
        return None
    return clean_text(value)[:128] or None


# Limite pentru `props` (input public, neîncrezut) ca să evităm umflarea DB-ului.
_PROPS_MAX_KEYS = 25
_PROPS_MAX_BYTES = 2048


def _clean_props(props: dict | None) -> dict | None:
    """Acceptă doar obiecte mici, plate, cu valori simple (anti-DoS de stocare)."""
    if not props or not isinstance(props, dict):
        return None
    out: dict = {}
    for k, v in list(props.items())[:_PROPS_MAX_KEYS]:
        if isinstance(v, (str, int, float, bool)) or v is None:
            out[str(k)[:64]] = v[:512] if isinstance(v, str) else v
    # Plafon dur pe mărimea serializată.
    try:
        if len(json.dumps(out)) > _PROPS_MAX_BYTES:
            return None
    except (TypeError, ValueError):
        return None
    return out or None


@lru_cache(maxsize=4096)
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


@router.post("/collect", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("120/minute")
async def collect(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Body-ul vine ca text/plain (beacon, fără preflight CORS) → parsăm manual.
    raw = await request.body()
    try:
        payload = CollectPayload.model_validate_json(raw)
    except ValidationError:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    result = await db.execute(select(Site).where(Site.site_key == payload.site))
    site = result.scalar_one_or_none()
    if not site:
        # Nu dezvăluim dacă site-ul există; răspundem oricum 204.
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    ua_string = request.headers.get("user-agent", "")[:512]
    device = _device_type(ua_string)

    for ev in payload.events:
        ev_type = ev.type if ev.type in _ALLOWED_TYPES else "custom"
        db.add(
            Event(
                site_id=site.id,
                type=ev_type,
                path=ev.path[:1024],
                referrer=ev.referrer[:1024],
                element_selector=ev.element_selector[:512],
                element_text=clean_text(ev.element_text)[:2000],
                x_pct=ev.x_pct,
                y_pct=ev.y_pct,
                viewport_w=ev.viewport_w,
                viewport_h=ev.viewport_h,
                doc_w=ev.doc_w,
                doc_h=ev.doc_h,
                scroll_depth=ev.scroll_depth,
                duration_ms=ev.duration_ms,
                utm_source=_clean_utm(ev.utm_source),
                utm_medium=_clean_utm(ev.utm_medium),
                utm_campaign=_clean_utm(ev.utm_campaign),
                visitor_id=payload.visitor_id[:64],
                session_id=ev.session_id[:64],
                user_agent=ua_string,
                device_type=device,
                props=_clean_props(ev.props),
            )
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
