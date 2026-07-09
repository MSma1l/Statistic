# 3. Structura proiectului

Harta completă a folderelor din rădăcină, cu ce conține fiecare. Pentru arhitectura logică vezi [02-arhitectura.md](02-arhitectura.md).

---

## Arbore de ansamblu

```
Statistic/
├── docker-compose.yml        # orchestrarea celor 3 servicii (db, backend, frontend)
├── .env.example              # configurare LOCALĂ (copiază → .env)
├── .env.prod.example         # configurare de PRODUCȚIE (copiază → .env.prod)
├── .gitignore
├── README.md                 # prezentare + pornire rapidă + linkuri spre docs/
│
├── backend/                  # serverul FastAPI
├── frontend/                 # dashboard-ul React
├── deploy/                   # config de deploy (nginx dispecer pe host)
├── examples/                 # pagini de test + scriptul e2e
└── docs/                     # toată documentația (începe cu docs/README.md)
```

---

## `backend/` — serverul FastAPI

```
backend/
├── Dockerfile
├── requirements.txt
└── app/
    ├── main.py               # aplicația FastAPI: middleware, routere, migrări idempotente, health
    ├── config.py             # setări din variabile de mediu (JWT, URL-uri, AI, galerie)
    ├── database.py           # engine async SQLAlchemy + sesiune + Base
    ├── seed.py               # creează adminul inițial la prima pornire
    │
    ├── api/                  # routerele (endpoint-urile)
    │   ├── auth.py           #   login/logout, management useri + permisiuni (RBAC)
    │   ├── sites.py          #   CRUD site-uri (pixel)
    │   ├── analytics.py      #   toate rapoartele: summary, timeseries, heatmap, paths...
    │   ├── links.py          #   CRUD linkuri/QR + imaginea QR + statistici
    │   ├── gallery.py        #   upload/listare/ștergere imagini (logo QR), cotă 25 MB
    │   ├── collect.py        #   /px/t.js (scriptul) + /px/collect (ingestia evenimentelor)
    │   ├── redirect.py       #   /l/{slug} (click) și /q/{slug} (scanare)
    │   ├── admin_settings.py #   GET/PUT setări globale editabile (prompturi AI, praguri)
    │   └── deps.py           #   dependențe comune: user curent, require_admin
    │
    ├── core/                 # logică transversală
    │   ├── guard.py          #   middleware SQLi/XSS + security headers + rate limiter
    │   ├── security.py       #   hash parole (argon2), JWT, cookie
    │   ├── sanitize.py       #   curățare HTML cu bleach
    │   ├── qrgen.py          #   generare QR (PNG/SVG) cu logo în centru
    │   └── app_settings.py   #   default-uri + acces la setările editabile (prompturi AI, reguli GDPR, praguri)
    │
    ├── models/               # tabelele (SQLAlchemy)
    │   ├── user.py           #   users (email, hash argon2, is_admin, can_sites/links/qr)
    │   ├── site.py           #   sites (site_key, owner_id, min_engagement_seconds)
    │   ├── event.py          #   events (type, path, x/y_pct, visitor/session, utm, duration)
    │   ├── link.py           #   tracked_links + link_visits
    │   ├── gallery.py        #   gallery_images (binar + metadate)
    │   ├── setting.py        #   app_settings (chei/valori JSON editabile)
    │   ├── snapshot.py       #   page_snapshots (captură pagină pentru overlay heatmap)
    │   └── funnel.py         #   funnel_steps (model definit; FĂRĂ endpoint-uri încă)
    │
    └── schemas/              # modele Pydantic (validare request/response)
        ├── auth.py  event.py  gallery.py  link.py  site.py
```

---

## `frontend/` — dashboard-ul React

```
frontend/
├── Dockerfile                # build Vite → servit de nginx
├── nginx.conf                # config nginx intern (SPA fallback)
├── index.html
├── package.json / package-lock.json
├── vite.config.ts  tsconfig.json  tailwind.config.js  postcss.config.js
└── src/
    ├── main.tsx              # bootstrap React
    ├── App.tsx               # rutarea + guards + lazy-loading pagini
    ├── index.css
    ├── pages/                # cele 8 pagini
    │   ├── Login.tsx
    │   ├── Dashboard.tsx
    │   ├── Sites.tsx  SiteDetail.tsx
    │   ├── Links.tsx  LinkDetail.tsx
    │   ├── Gallery.tsx
    │   └── Settings.tsx
    ├── components/
    │   ├── Layout.tsx           # shell: bară laterală, navigație, comutare cont
    │   ├── HeatmapCanvas.tsx    # desenarea heatmap-ului
    │   ├── HeatmapOverlay.tsx   # suprapunerea peste captura paginii
    │   ├── JourneyModal.tsx     # călătoria unui vizitator
    │   └── ui.tsx               # componente UI reutilizabile
    └── lib/
        ├── api.ts              # clientul HTTP către backend
        ├── auth.tsx            # context de autentificare
        └── accounts.ts         # conturi salvate local + comutare rapidă
```

---

## `deploy/` — deploy pe server

```
deploy/
└── nginx/
    └── statistic.conf        # nginx DISPECER pe host: rutează /api /auth /px /l /q spre
                              # backend și restul spre frontend, sub un singur domeniu
```

Folosit în [operare/03-deployment.md](operare/03-deployment.md).

---

## `examples/` — teste & demo

```
examples/
├── test.html                 # pagină demo cu pixelul (înlocuiești CHEIA_TA)
├── landing.html              # landing de exemplu
└── test_e2e.sh               # test automat end-to-end (~51 verificări)
```

Folosite în [operare/02-verificare-si-testare.md](operare/02-verificare-si-testare.md).

---

## `docs/` — documentația

```
docs/
├── README.md                 # INDEX MASTER (începe de aici)
├── 01-viziune-si-idee.md
├── 02-arhitectura.md
├── 03-structura-proiect.md   # (acest fișier)
├── STARE-PROIECT.md          # ce e gata / în lucru / lipsește
├── INVATARE.md               # ghid educativ
├── AB-MARKETING-AI-VISION.md # viziunea AI
├── operare/
│   ├── 01-pornire-locala.md
│   ├── 02-verificare-si-testare.md
│   └── 03-deployment.md
├── backend/                  # documentația detaliată a backend-ului
└── frontend/                 # documentația detaliată a frontend-ului
```
</content>
