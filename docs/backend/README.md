# Documentația BACKEND — „Statistic"

> Documentație tehnică modulară a backend-ului: API-ul FastAPI care primește evenimentele de la pixel, face redirect-urile de linkuri/QR, generează QR-uri și servește dashboard-ul cu date agregate. Pentru documentația funcțională (ce face aplicația, cum o folosești) vezi [indexul documentației](../README.md).

---

## Ce este backend-ul

Backend-ul „Statistic" este o aplicație **FastAPI async** (Python 3.12) care acoperă două funcții mari:

1. **Pixel de analytics** — servește scriptul de tracking (`/px/t.js`), primește evenimentele (`/px/collect`) și le agregă în rapoarte (KPI, timeserie, heatmap, scroll map, sesiuni, funnel implicit, campanii UTM).
2. **Linkuri scurte & QR trackuibile** — slug permanent, destinație editabilă, redirect (`/l/{slug}` = click, `/q/{slug}` = scanare), generare QR (PNG/SVG, cu logo opțional).

Peste ambele: **autentificare pe invitație** (JWT în cookie httpOnly), **permisiuni granulare** per utilizator, un **guard SQLi/XSS** la fiecare cerere și un **strat AI/CRO în lucru** (schelet de configurare + prompturi, fără integrarea reală încă).

---

## Harta pe scurt

```
                 ┌───────────────────────── FastAPI (app/main.py) ─────────────────────────┐
                 │  lifespan: create_all + migrări idempotente + seed admin                 │
   HTTP  ───────▶│  Middleware: SecurityGuard (SQLi/XSS + headers) → CORS                   │
                 │  Rate limit: slowapi (login 10/min, collect 120/min)                     │
                 │                                                                          │
                 │  Routere (app/api/):                                                     │
                 │   auth · sites · analytics · admin_settings · links · gallery ·          │
                 │   collect (pixel) · redirect                                             │
                 └──────────────────────────────────┬───────────────────────────────────────┘
                                                    │  SQLAlchemy 2.0 async (asyncpg)
                                                    ▼
                                            PostgreSQL (9 tabele)
```

---

## Structura fișierelor

```
backend/
├── Dockerfile, .dockerignore, requirements.txt
└── app/
    ├── main.py            # aplicația FastAPI + lifespan + migrări + routere
    ├── config.py          # Settings (pydantic-settings), citite din .env
    ├── database.py        # engine async, sessionmaker, Base, get_db
    ├── seed.py            # crearea admin-ului inițial
    ├── static/t.js        # scriptul de tracking servit la /px/t.js
    ├── models/            # modele ORM (9 tabele)
    ├── schemas/           # DTO-uri Pydantic (validare I/O)
    ├── api/               # routerele HTTP
    └── core/              # securitate, guard, sanitizare, QR, setări AI
```

---

## Index al documentației

| # | Fișier | Ce acoperă |
|---|--------|------------|
| 1 | [01-stack-si-config.md](01-stack-si-config.md) | Stack tehnologic detaliat + toate variabilele de configurare (`app/config.py`, `.env.example`) |
| 2 | [02-model-de-date.md](02-model-de-date.md) | Cele 9 tabele câmp cu câmp, relații, indexuri + migrările idempotente din `main.py` |
| 3 | [03-api-endpoints.md](03-api-endpoints.md) | Referință completă a celor ~49 de endpoint-uri, grupate pe module |
| 4 | [04-securitate.md](04-securitate.md) | Guard SQLi/XSS, JWT în cookie httpOnly, argon2, rate-limiting, bleach, security headers, IP hashing, timing-safe login |
| 5 | [05-strat-ai-cro.md](05-strat-ai-cro.md) | Starea stratului AI/CRO în lucru: ce există (config, prompturi, `funnel_steps`, router `admin_settings`) vs ce lipsește (integrare Anthropic, endpoint de analiză, endpoint-uri funnels) |

---

## De reținut (particularități)

- **Fără Alembic.** Schema se creează cu `Base.metadata.create_all` la pornire, iar coloanele adăugate ulterior se aplică prin `ALTER TABLE ... IF NOT EXISTS` idempotent din `main.py`. Vezi [02-model-de-date.md](02-model-de-date.md#migrări-idempotente).
- **Fără teste automate** și **fără migrări reale** (Alembic) în proiect la momentul acestei documentații.
- **AI declarat, dar neintegrat.** `anthropic==0.69.0` e în `requirements.txt`, cheia și modelul sunt în config, prompturile sunt în `core/app_settings.py`, dar **nu există încă niciun apel real către Anthropic** și niciun endpoint de analiză/funnels. Detalii în [05-strat-ai-cro.md](05-strat-ai-cro.md).
