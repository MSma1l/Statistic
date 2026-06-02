from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.api import analytics, auth, collect, gallery, links, redirect, sites
from app.config import settings
from app.core.guard import SecurityGuardMiddleware, limiter
from app.database import Base, engine
from app.models import (  # noqa: F401
    Event,
    GalleryImage,
    LinkVisit,
    Site,
    TrackedLink,
    User,
)
from app.seed import seed_admin

# Migrări idempotente pentru coloane adăugate ulterior (fără a pierde date).
_MIGRATIONS = [
    "ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'link'",
    "ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS logo_image_id INTEGER REFERENCES gallery_images(id) ON DELETE SET NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS can_sites BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS can_links BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS can_qr BOOLEAN NOT NULL DEFAULT true",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Creează tabelele dacă nu există (start fresh, fără migrații manuale)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in _MIGRATIONS:
            await conn.execute(text(stmt))
    await seed_admin()
    yield


app = FastAPI(
    title="Statistic API",
    description="Analytics pixel + QR/linkuri trackuibile",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiting (slowapi)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Guard SQLi/XSS + security headers (rulează primul, deci e adăugat ultimul)
app.add_middleware(SecurityGuardMiddleware)

# CORS pentru dashboard (cu credențiale, deci origine explicită)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routere
app.include_router(auth.router)
app.include_router(sites.router)
app.include_router(analytics.router)
app.include_router(links.router)
app.include_router(gallery.router)
app.include_router(collect.router)
app.include_router(redirect.router)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}
