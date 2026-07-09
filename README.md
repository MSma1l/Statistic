# Statistic — Analytics & Tracking

Mini-platformă personală cu două funcții:

1. **Pixel de analytics** — un script JS pe care îl pui pe site-urile tale. Urmărește vizualizări, click-uri (cu **heatmap**), scroll și surse de trafic.
2. **Linkuri scurte & QR coduri** — linkuri personalizate (slug permanent, destinație editabilă) și QR coduri „pe viață", cu statistici de intrări (scanări vs click-uri).

Autentificare pe invitație (fără înregistrare publică) + **guard anti-SQLi/XSS** la fiecare request.

## 📚 Documentație

Punct de intrare: [`docs/README.md`](docs/README.md) — indexul master al întregii documentații (ansamblu, backend, frontend, operare, învățare & viziune).

Linkuri cheie:
- [`docs/01-viziune-si-idee.md`](docs/01-viziune-si-idee.md) — ideea produsului și conceptul „slug permanent, destinație editabilă".
- [`docs/02-arhitectura.md`](docs/02-arhitectura.md) — arhitectura de ansamblu (3 servicii, flux de date, porturi).
- [`docs/STARE-PROIECT.md`](docs/STARE-PROIECT.md) — ce e complet, în lucru și ce lipsește.
- [`docs/operare/01-pornire-locala.md`](docs/operare/01-pornire-locala.md) · [`02-verificare-si-testare.md`](docs/operare/02-verificare-si-testare.md) · [`03-deployment.md`](docs/operare/03-deployment.md) — pornire, testare, deploy.
- [`docs/INVATARE.md`](docs/INVATARE.md) — ghid de învățare pas cu pas.

## Stack

- **Backend:** Python · FastAPI · SQLAlchemy (async) · PostgreSQL
- **Frontend:** React + TypeScript · TailwindCSS · Recharts
- **Orchestrare:** Docker Compose

## Pornire rapidă

```bash
# 1. Copiază configurarea și ajusteaz-o (mai ales JWT_SECRET și parola de admin)
cp .env.example .env

# 2. Pornește tot (DB + backend + frontend)
docker compose up --build
```

- Dashboard: <http://localhost:5173>
- API + Swagger: <http://localhost:8000/docs>
- Login inițial: valorile din `.env` (implicit `admin@statistic.app` / `admin1234`)

## Cum folosești pixelul

1. În dashboard → **Site-uri** → creează un site.
2. Copiază snippet-ul afișat și pune-l în `<head>`-ul site-ului tău:
   ```html
   <script async src="http://localhost:8000/px/t.js" data-site="CHEIA_TA"></script>
   ```
3. Vizitează site-ul, dă click-uri → datele apar în pagina site-ului (KPI, grafice, heatmap).

Eveniment custom din codul tău: `window.statistic("nume_eveniment", { orice: "date" })`.

Pentru un test rapid local, deschide `examples/test.html` (înlocuiește cheia cu cea reală).

## Linkuri & QR

În **Linkuri & QR** creezi un element cu slug personalizat (ex. `promo-vara`):
- Link scurt: `http://localhost:8000/l/promo-vara`
- QR (descărcabil PNG/SVG) care duce la `http://localhost:8000/q/promo-vara`

Slug-ul nu se schimbă niciodată (QR valabil pe viață), dar destinația e editabilă oricând.

## Securitate

- Parole hash-uite cu **argon2**; sesiune prin JWT în cookie **httpOnly**.
- Middleware care scanează fiecare request și blochează tipare de **SQL injection / XSS**.
- Query-uri parametrizate (SQLAlchemy ORM), input sanitizat cu `bleach`, security headers + rate limiting la login.

## Producție

Deployment pe server cu **un singur domeniu** și **nginx dispecer** pe host
(rutează `/api`, `/auth`, `/px`, `/l`, `/q` spre backend, restul spre dashboard) —
ghid complet pas cu pas în [`docs/operare/03-deployment.md`](docs/operare/03-deployment.md).

Pe scurt:

```bash
cp .env.prod.example .env.prod          # completează domeniul, JWT_SECRET, parole
docker compose --env-file .env.prod up -d --build
sudo cp deploy/nginx/statistic.conf /etc/nginx/sites-available/statistic
sudo ln -s /etc/nginx/sites-available/statistic /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Esențial în `.env.prod`: `JWT_SECRET` random, `BASE_URL`/`FRONTEND_ORIGIN` = domeniul
real, `VITE_API_URL` **gol** (same-origin), `BIND_HOST=127.0.0.1:`, iar după HTTPS
(certbot) `COOKIE_SECURE=true`.
