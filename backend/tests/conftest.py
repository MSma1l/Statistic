"""Harness comun pentru suita de teste backend „Statistic".

Reguli cheie:
  - Setăm `DATABASE_URL` spre baza SEPARATĂ `statistic_test` ÎNAINTE de a importa
    orice din `app` (config/engine se citesc la import).
  - Rulăm totul într-un SINGUR event loop (loop_scope="session") ca să nu apară
    erori de tip „attached to a different loop" cu asyncpg + engine partajat.
  - Schema se creează o dată; între teste facem TRUNCATE la toate tabelele.
  - Testăm endpoint-urile IN-PROCESS cu httpx ASGITransport (fără rețea).
"""

import os

# --- ENV înainte de importul aplicației (obligatoriu) ---------------------------
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://statistic:statistic@localhost:5433/statistic_test",
)
os.environ.setdefault("JWT_SECRET", "test-secret-key-not-for-prod")
os.environ.setdefault("FIRST_ADMIN_EMAIL", "admin@statistic.app")
os.environ.setdefault("FIRST_ADMIN_PASSWORD", "admin1234")
os.environ.setdefault("BASE_URL", "http://localhost:8000")
os.environ.setdefault("PUBLIC_BASE_URL", "http://localhost:8000")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.config import settings  # noqa: E402
from app.core.guard import limiter  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.database import AsyncSessionLocal, Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

# Dezactivăm rate-limiterul global ca testele să nu fie flaky (multe login-uri
# din același „IP"). Testul dedicat de rate-limit îl reactivează local.
limiter.enabled = False


# ------------------------------------------------------------------------------
#  Schema + izolare
# ------------------------------------------------------------------------------
@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _setup_schema():
    """Creează schema o singură dată pentru întreaga sesiune de teste."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest_asyncio.fixture(loop_scope="session", autouse=True)
async def _clean_tables():
    """Golește toate tabelele înainte de fiecare test (izolare)."""
    tables = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    yield


# ------------------------------------------------------------------------------
#  Sesiune DB directă (pentru aranjarea/verificarea datelor în teste)
# ------------------------------------------------------------------------------
@pytest_asyncio.fixture(loop_scope="session")
async def db():
    async with AsyncSessionLocal() as session:
        yield session


# ------------------------------------------------------------------------------
#  Client HTTP in-process
# ------------------------------------------------------------------------------
@pytest_asyncio.fixture(loop_scope="session")
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as ac:
        yield ac


# ------------------------------------------------------------------------------
#  Fabrici de utilizatori + clienți autentificați
# ------------------------------------------------------------------------------
async def _create_user(
    email: str,
    password: str = "parola123",
    *,
    is_admin: bool = False,
    is_active: bool = True,
    can_sites: bool = True,
    can_links: bool = True,
    can_qr: bool = True,
    full_name: str = "Test User",
) -> User:
    async with AsyncSessionLocal() as session:
        user = User(
            email=email.lower(),
            full_name=full_name,
            password_hash=hash_password(password),
            is_admin=is_admin,
            is_active=is_active,
            can_sites=can_sites,
            can_links=can_links,
            can_qr=can_qr,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


def _auth_cookie_for(user_id: int) -> dict:
    token = create_access_token(user_id)
    return {settings.COOKIE_NAME: token}


@pytest_asyncio.fixture(loop_scope="session")
async def make_user():
    """Fabrică: creează un user în DB și întoarce obiectul User."""

    async def _factory(email: str, **kwargs) -> User:
        return await _create_user(email, **kwargs)

    return _factory


@pytest_asyncio.fixture(loop_scope="session")
async def admin(make_user) -> User:
    return await make_user("admin@statistic.app", is_admin=True, full_name="Admin")


@pytest_asyncio.fixture(loop_scope="session")
async def user(make_user) -> User:
    """Un user obișnuit, non-admin, cu toate capabilitățile."""
    return await make_user("user@statistic.app")


@pytest_asyncio.fixture(loop_scope="session")
async def admin_client(client, admin) -> AsyncClient:
    client.cookies.update(_auth_cookie_for(admin.id))
    return client


@pytest_asyncio.fixture(loop_scope="session")
async def auth_client_factory(client):
    """Întoarce o funcție care setează cookie-ul de auth pentru un user dat."""

    def _set(user_obj: User) -> AsyncClient:
        client.cookies.clear()
        client.cookies.update(_auth_cookie_for(user_obj.id))
        return client

    return _set
