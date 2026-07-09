# 01 — Stack tehnologic & configurare

> Acest fișier descrie tehnologiile folosite de backend (cu rolul fiecărei dependențe) și toate variabilele de configurare din `app/config.py` și `.env.example`.

Vezi și: [model de date](02-model-de-date.md) · [endpoint-uri](03-api-endpoints.md) · [securitate](04-securitate.md).

---

## 1. Stack tehnologic

Backend-ul rulează **Python 3.12** (imaginea Docker `python:3.12-slim`), pe un server **ASGI async** de la un capăt la altul: FastAPI + SQLAlchemy async + asyncpg. Nu există cod sincron blocant pe calea cererii.

### Dependențe (din `requirements.txt`)

| Pachet | Versiune | Rol în proiect |
|--------|----------|----------------|
| `fastapi` | 0.115.6 | Framework-ul web/API (routing, validare, OpenAPI/Swagger la `/docs`). |
| `uvicorn[standard]` | 0.34.0 | Serverul ASGI care rulează aplicația. |
| `sqlalchemy[asyncio]` | 2.0.36 | ORM async (stil 2.0, `Mapped`/`mapped_column`). Toate query-urile sunt parametrizate. |
| `asyncpg` | 0.30.0 | Driverul PostgreSQL async folosit de SQLAlchemy. |
| `pydantic` | 2.10.4 | Validarea schemelor de intrare/ieșire (DTO-uri din `app/schemas`). |
| `pydantic-settings` | 2.7.0 | Citirea configurării din `.env` / variabile de mediu (`Settings`). |
| `passlib[argon2]` | 1.7.4 | Hash-uirea parolelor cu **argon2**. |
| `pyjwt` | 2.10.1 | Semnarea/verificarea tokenurilor JWT (HS256). |
| `slowapi` | 0.1.9 | Rate limiting (login, ingestie). |
| `bleach` | 6.2.0 | Sanitizarea textelor introduse de utilizator (anti-XSS la stocare). |
| `qrcode[pil]` | 8.0 | Generarea QR-urilor (PNG prin Pillow; SVG construit manual). |
| `python-multipart` | 0.0.20 | Parsarea upload-urilor `multipart/form-data` (galerie, capturi de pagină). |
| `email-validator` | 2.2.0 | Validarea `EmailStr` la crearea de utilizatori. |
| `user-agents` | 2.2.0 | Detectarea tipului de device (desktop/mobil/tabletă/bot) din user-agent. |
| `anthropic` | 0.69.0 | SDK-ul Claude. **Declarat, dar NEUTILIZAT încă** — vezi [05-strat-ai-cro.md](05-strat-ai-cro.md). |

### Componente cheie ale aplicației

| Fișier | Rol |
|--------|-----|
| `app/main.py` | Construiește `FastAPI`, înregistrează middleware-urile (guard, CORS), rate-limiter-ul, routerele și `lifespan`-ul (creare tabele + migrări idempotente + seed admin). |
| `app/database.py` | `create_async_engine` (cu `pool_pre_ping`, `pool_size=10`, `max_overflow=20`, `pool_recycle=1800`), `async_sessionmaker` și dependența `get_db` care face commit/rollback automat. |
| `app/config.py` | Clasa `Settings` (pydantic-settings) + `get_settings()` memoizat. |
| `app/seed.py` | Creează admin-ul inițial dacă nu există niciun utilizator. |

> **Nu există Alembic.** Schema se creează cu `Base.metadata.create_all`, iar coloanele adăugate ulterior prin `ALTER TABLE ... IF NOT EXISTS`. Detalii în [02-model-de-date.md](02-model-de-date.md#migrări-idempotente).

---

## 2. Configurarea (`app/config.py`)

Toate valorile se citesc din variabile de mediu / fișierul `.env` (`SettingsConfigDict(env_file=".env", extra="ignore")`). Instanța globală `settings` e memoizată cu `@lru_cache`.

### Variabile

| Variabilă | Tip | Default | Rol |
|-----------|-----|---------|-----|
| `DATABASE_URL` | str | `postgresql+asyncpg://statistic:statistic@db:5432/statistic` | DSN-ul async al PostgreSQL. |
| `JWT_SECRET` | str | `change-me-in-production` | Secretul de semnare a tokenurilor JWT. **Trebuie schimbat în producție.** |
| `JWT_ALGORITHM` | str | `HS256` | Algoritmul de semnare JWT. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | int | `10080` (7 zile) | Durata de valabilitate a tokenului (și `max_age`-ul cookie-ului). |
| `COOKIE_NAME` | str | `statistic_token` | Numele cookie-ului httpOnly cu tokenul. |
| `COOKIE_SECURE` | bool | `False` | `true` doar pe HTTPS (producție). Marchează cookie-ul `Secure`. |
| `IP_HASH_SALT` | str | `""` | Sarea pentru hash-ul de IP. Gol → derivă din `JWT_SECRET + "::ip"` (vezi `ip_salt`). |
| `BASE_URL` | str | `http://localhost:8000` | URL-ul backend-ului (API). Folosit și la detecția de producție și la `qr_url`. |
| `FRONTEND_ORIGIN` | str | `http://localhost:5173` | Originea dashboard-ului, pentru CORS. |
| `PUBLIC_BASE_URL` | str | `""` | Domeniul PUBLIC scurt și stabil pentru linkuri/QR/pixel. Gol → se folosește `BASE_URL` (vezi `public_url`). |
| `FIRST_ADMIN_EMAIL` | str | `admin@statistic.app` | Email-ul admin-ului creat la prima pornire. |
| `FIRST_ADMIN_PASSWORD` | str | `admin1234` | Parola admin-ului inițial. **Trebuie schimbată în producție.** |
| `GALLERY_MAX_BYTES` | int | `26214400` (25 MB) | Limita totală a galeriei de imagini per utilizator. |
| `ANTHROPIC_API_KEY` | str | `""` | Cheia API Claude. Gol → feature-ul AI e dezactivat grațios. **Secret: doar în `.env`.** |
| `AI_MODEL` | str | `claude-opus-4-8` | Modelul Claude folosit (configurabil din `.env`, nu la cald). |

### Proprietăți & metode derivate

| Membru | Ce face |
|--------|---------|
| `ip_salt` | Returnează `IP_HASH_SALT` sau, dacă e gol, `JWT_SECRET + "::ip"` (compatibil cu instalările existente). |
| `public_url` | `(PUBLIC_BASE_URL or BASE_URL)` fără `/` final — baza pentru snippet-ul pixel, `/l/…`, `/q/…`. |
| `ai_enabled` | `True` doar dacă `ANTHROPIC_API_KEY` e setată — folosit pentru dezactivarea grațioasă a AI. |
| `cors_origins` | Setul `{FRONTEND_ORIGIN, BASE_URL}`, fără valorile goale — originile permise la CORS. |
| `is_production()` | `True` când `COOKIE_SECURE` e `true` **sau** `BASE_URL` nu conține `localhost`. |
| `assert_secure()` | La pornire (în `lifespan`), în producție, ridică `RuntimeError` dacă `JWT_SECRET` e default/gol sau `FIRST_ADMIN_PASSWORD` e încă `admin1234`. Fail-fast anti-configurare-nesigură. |

> Notă: `ANTHROPIC_API_KEY`, `AI_MODEL`, `IP_HASH_SALT` și `GALLERY_MAX_BYTES` **nu apar încă în `.env.example`** — au default-uri sigure în `config.py`, dar dacă vrei AI activ trebuie să adaugi manual `ANTHROPIC_API_KEY` în `.env`.

---

## 3. `.env.example`

Fișierul de exemplu (`../../.env.example`, la rădăcina proiectului) acoperă și variabile de infrastructură/frontend, nu doar cele consumate direct de `Settings`:

| Variabilă | Consumator | Observație |
|-----------|------------|------------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Docker Compose (containerul DB) | Credențialele bazei; se reflectă în `DATABASE_URL`. |
| `POSTGRES_PORT` | Docker Compose | Portul DB pe host (intern e mereu 5432). |
| `BACKEND_PORT` / `FRONTEND_PORT` | Docker Compose | Porturile expuse pe host. |
| `JWT_SECRET` | backend (`Settings`) | Schimbă-l: `openssl rand -hex 32`. |
| `BASE_URL` | backend (`Settings`) | URL-ul API. |
| `PUBLIC_BASE_URL` | backend (`Settings`) | Domeniul scurt stabil pentru QR/linkuri/pixel. |
| `FRONTEND_ORIGIN` | backend (`Settings`) | CORS. |
| `COOKIE_SECURE` | backend (`Settings`) | `true` doar pe HTTPS. |
| `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` | backend (`seed.py`) | Adminul inițial. |
| `VITE_API_URL` | frontend (build) | URL-ul API folosit de dashboard. |
| `BIND_HOST` | Docker Compose | Prefix pentru a lega porturile doar pe `127.0.0.1` (producție în spatele nginx). |

> Variabilele AI (`ANTHROPIC_API_KEY`, `AI_MODEL`) și `IP_HASH_SALT` / `GALLERY_MAX_BYTES` pot fi adăugate în `.env` la nevoie; nu sunt în exemplu.
