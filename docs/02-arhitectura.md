# 2. Arhitectura de ansamblu

Cum e construită aplicația la nivel înalt: cele trei servicii, cum circulă datele, ce porturi folosește. Pentru detalii de implementare vezi [`docs/backend/`](backend/) și [`docs/frontend/`](frontend/).

---

## Cele 3 servicii

Aplicația e pornită împreună cu Docker Compose și are trei containere:

| Serviciu | Tehnologie | Rol |
|----------|-----------|-----|
| **frontend** | React + Vite + TailwindCSS, servit de nginx | Dashboard-ul — ce vezi tu în browser. |
| **backend** | FastAPI (uvicorn), SQLAlchemy async | Creierul: API, primește evenimentele pixel, face redirecturile, generează QR-uri. |
| **db** | PostgreSQL 16 | Baza de date unde se stochează tot. |

---

## Diagrama fluxului de date

```
┌─────────────────┐      ┌──────────────────┐      ┌────────────────┐
│   FRONTEND      │      │     BACKEND      │      │   POSTGRESQL   │
│  React + Vite   │─────▶│    FastAPI       │─────▶│   (date)       │
│  (nginx :80)    │ HTTP │   (uvicorn :8000)│ SQL  │                │
│  host :5180     │      │   host :8010     │      │  host :5433    │
└─────────────────┘      └──────────────────┘      └────────────────┘
        ▲                         ▲
        │ dashboard               │ /px/t.js     (scriptul de tracking)
        │                         │ /px/collect  (primește evenimente)
   utilizatorul                   │ /l/{slug}, /q/{slug} (redirecturi)
                                  │
                          site-urile tale + vizitatorii lor
```

---

## Porturile

Portul intern al fiecărui container e cel standard; pe host au fost mutate ca să nu se bată cu alte proiecte care rulau deja în Docker. Le poți schimba din `.env`.

| Serviciu | Port standard (intern) | Port pe host (implicit local) | Variabilă `.env` |
|----------|:---:|:---:|---|
| backend | 8000 | **8010** | `BACKEND_PORT` |
| frontend | 5173 / 80 | **5180** | `FRONTEND_PORT` |
| db | 5432 | **5433** | `POSTGRES_PORT` |

> În documentele de operare porturile apar ca `8010 / 5180 / 5433` (valorile mutate). Dacă rulezi pe cele standard, ajustează URL-urile corespunzător.

---

## Drumul unei cereri

### A) Un vizitator intră pe un site urmărit (pixel → collect → DB → dashboard)

```
1. Vizitatorul deschide pagina ta        →  <script src=".../px/t.js" data-site="CHEIA">
2. t.js observă pageview/click/scroll    →  POST .../px/collect  (JSON cu eveniment)
3. Backend validează + sanitizează        →  scrie rândul în tabela `events`
4. Tu deschizi pagina site-ului           →  GET /api/analytics/{id}/summary, /heatmap, ...
5. Dashboard-ul desenează KPI + heatmap   →  din agregările returnate de backend
```

### B) Cineva scanează un QR sau dă click pe un link scurt

```
1. Scanare QR    →  GET /q/{slug}   (source = qr)
   Click link    →  GET /l/{slug}   (source = link)
2. Backend caută slug-ul, scrie un rând în `link_visits`, apoi 302 → destinație
3. Tu vezi în dashboard: total intrări, separate pe scanări QR vs click-uri
```

---

## Autentificare & CORS (pe scurt)

- Sesiunea = JWT într-un cookie **httpOnly** (JavaScript-ul din pagină nu-l poate citi).
- Local, dashboard-ul și API-ul sunt pe origini diferite → **CORS** cu credențiale, origine explicită.
- În producție, un **nginx dispecer** rutează totul sub un singur domeniu → same-origin, fără CORS. Vezi [operare/03-deployment.md](operare/03-deployment.md).

Detalii despre securitate (guard SQLi/XSS, rate limiting, argon2, RBAC) în [`docs/backend/`](backend/).

---

## Unde citești mai departe

- **Backend** (API, modele, module) → [`docs/backend/`](backend/)
- **Frontend** (pagini, rutare, componente) → [`docs/frontend/`](frontend/)
- **Harta folderelor** → [03-structura-proiect.md](03-structura-proiect.md)
- **Ce e gata / în lucru** → [STARE-PROIECT.md](STARE-PROIECT.md)
</content>
