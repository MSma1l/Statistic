# 📘 Documentația aplicației „Statistic"

> Documentație funcțională: ce face aplicația, cum e construită și cum o folosești.

---

## 1. Ce este Statistic

**Statistic** este o mini-platformă personală de analytics și tracking, cu două funcții mari:

| # | Funcție | La ce folosește |
|---|---------|-----------------|
| 1 | **Pixel de analytics** | Un script JS pe care îl pui pe site-urile tale. Vede vizualizări, click-uri, scroll, surse de trafic și generează un **heatmap** (harta de click-uri). E ideea din spatele „Meta Pixel", dar a ta. |
| 2 | **Linkuri scurte & QR coduri** | Creezi linkuri personalizate (`/l/slug-ul-tau`) și QR coduri permanente. Vezi câți oameni au intrat, separat pe scanări QR vs click-uri pe link. |

În plus: autentificare (pe invitație, fără înregistrare publică) și un **guard de securitate** care blochează tentativele de SQL injection și XSS la fiecare cerere.

---

## 2. Arhitectura pe scurt

Trei servicii, pornite împreună cu Docker Compose:

```
┌─────────────────┐      ┌──────────────────┐      ┌────────────────┐
│   FRONTEND      │      │     BACKEND      │      │   POSTGRESQL   │
│  React + Vite   │─────▶│    FastAPI       │─────▶│   (date)       │
│  (nginx :80)    │ HTTP │   (uvicorn :8000)│ SQL  │                │
│  host :5180     │      │   host :8010     │      │  host :5433    │
└─────────────────┘      └──────────────────┘      └────────────────┘
        ▲                         ▲
        │ dashboard               │ /px/t.js  (scriptul de tracking)
        │                         │ /px/collect (primește evenimente)
   utilizatorul              │ /l/{slug}, /q/{slug} (redirect-uri)
                            site-urile tale + vizitatorii lor
```

- **Frontend** = dashboard-ul (ce vezi tu în browser).
- **Backend** = creierul: API, primește evenimentele de la pixel, face redirect-urile, generează QR-uri.
- **PostgreSQL** = baza de date unde se stochează tot.

> Notă: porturile `8010 / 5180 / 5433` au fost alese ca să nu se bată cu alte proiecte care rulau deja la tine în Docker. Standard ar fi `8000 / 5173 / 5432`. Le poți schimba din `.env`.

---

## 3. Cum pornești aplicația

```bash
# 1. Configurarea (o singură dată)
cp .env.example .env
#    Editează .env și schimbă cel puțin JWT_SECRET și FIRST_ADMIN_PASSWORD.

# 2. Pornire (build + run)
docker compose up --build

# 3. Oprire
docker compose down
#    (Adaugă -v ca să ștergi și datele din baza de date.)
```

Acces după pornire:

| Ce | URL |
|----|-----|
| Dashboard | <http://localhost:5180> |
| API + Swagger (documentație interactivă) | <http://localhost:8010/docs> |
| Cont inițial | `admin@statistic.app` / `admin1234` (din `.env`) |

---

## 4. Funcția 1 — Pixelul de analytics

### 4.1 Fluxul complet

```
1. Creezi un „Site" în dashboard           →  primești o cheie (site_key)
2. Copiezi snippet-ul                        →  îl pui în <head> pe site-ul tău
3. Vizitatorii intră pe site                 →  t.js trimite evenimente la /px/collect
4. Backend salvează evenimentele             →  în tabela `events`
5. Dashboard interoghează și afișează        →  KPI, grafice, heatmap
```

### 4.2 Snippet-ul

În dashboard → **Site-uri** → deschizi un site → copiezi:

```html
<script async src="http://localhost:8010/px/t.js" data-site="CHEIA_TA"></script>
```

Îl pui în `<head>`-ul oricărui site. Atât. De acum site-ul e urmărit.

### 4.3 Ce urmărește automat

| Eveniment | Când | Ce date salvează |
|-----------|------|------------------|
| `pageview` | la încărcarea paginii + la navigare SPA | pagina, referrer-ul, sesiunea |
| `click` | la orice click | selectorul CSS al elementului, textul lui, **poziția x/y în procente** (pentru heatmap) |
| `scroll` | la 25/50/75/100% scroll | adâncimea atinsă |
| `custom` | când chemi tu `window.statistic(...)` | numele + orice date trimiți |

Eveniment custom din codul tău:

```js
window.statistic("adaugat_in_cos", { produs: "tricou", pret: 99 });
```

### 4.4 Ce vezi în dashboard (pagina site-ului)

- **KPI**: vizualizări, vizitatori unici, sesiuni, click-uri.
- **Grafic în timp**: evoluția vizualizărilor și click-urilor.
- **Pagini populare** și **cele mai apăsate elemente**.
- **Surse de trafic** (referrer) și **dispozitive** (desktop/mobil/tabletă).
- **Heatmap**: alegi o pagină și vezi unde apasă oamenii (albastru = puține click-uri, roșu = multe).

### 4.5 Identitate anonimă

Pixelul **nu colectează date personale**. Generează:
- `visitor_id` — în `localStorage` (același vizitator între vizite).
- `session_id` — în `sessionStorage` (resetat la închiderea tab-ului).

---

## 5. Funcția 2 — Linkuri scurte & QR

### 5.1 Conceptul cheie: slug permanent, destinație editabilă

Fiecare element are un **slug** care **nu se schimbă niciodată** (ex. `promo-vara`). Asta înseamnă:
- Link scurt stabil: `http://localhost:8010/l/promo-vara`
- QR cod stabil (encodează `http://localhost:8010/q/promo-vara`)
- **Poți schimba oricând destinația** fără să reprintezi QR-ul. De aici „QR pe viață".

### 5.2 Creare

În **Linkuri & QR** → **Creează**:
- **Slug** — personalizat (litere mici, cifre, liniuțe).
- **Destinație** — unde redirecționează (http/https).
- **Nume** și **Locație** — ca să știi unde l-ai pus (ex. „Afiș stație autobuz").

### 5.3 Statistici (pagina linkului)

- Total intrări, **scanări QR** vs **click-uri pe link** (separate, pentru că QR-ul folosește ruta `/q/` și linkul `/l/`).
- Grafic de intrări în timp, dispozitive, surse.
- Descarci QR-ul ca **PNG** sau **SVG**.

---

## 6. Autentificare & securitate

| Mecanism | Detaliu |
|----------|---------|
| **Parole** | hash-uite cu **argon2** (nu se stochează niciodată în clar). |
| **Sesiune** | JWT pus într-un cookie **httpOnly** → JavaScript-ul din pagină nu poate citi tokenul (protecție anti furt prin XSS). |
| **Conturi pe invitație** | Nu există înregistrare publică. Adminul creează conturi din pagina *Utilizatori*. Fiecare user vede **doar datele lui**. |
| **Guard SQLi/XSS** | Un middleware scanează fiecare cerere (query + body) și **blochează cu 400** tipare de injection (`OR 1=1`, `UNION SELECT`, `<script>`, `javascript:` etc.). |
| **Query parametrizat** | Tot accesul la DB e prin SQLAlchemy ORM → fără concatenare de SQL → fără SQL injection clasic. |
| **Sanitizare** | Textele introduse (nume, descrieri) sunt curățate de HTML cu `bleach` înainte de stocare. |
| **Rate limiting** | Login limitat la 10/minut, ingestia la 120/minut (anti brute-force / spam). |
| **Security headers** | CSP, X-Frame-Options, X-Content-Type-Options etc. pe răspunsuri. |

---

## 7. Referință API (principalele endpoint-uri)

> Documentația interactivă completă: <http://localhost:8010/docs>

### Autentificare
| Metodă | Rută | Descriere |
|--------|------|-----------|
| POST | `/auth/login` | Login (setează cookie-ul). |
| POST | `/auth/logout` | Logout. |
| GET | `/auth/me` | Cine sunt eu. |
| GET | `/auth/users` | Listă utilizatori (admin). |
| POST | `/auth/users` | Creează utilizator (admin). |
| DELETE | `/auth/users/{id}` | Șterge utilizator (admin). |

### Site-uri (pixel)
| Metodă | Rută | Descriere |
|--------|------|-----------|
| GET/POST | `/api/sites` | Listă / creare site. |
| GET/PATCH/DELETE | `/api/sites/{id}` | Detalii / editare / ștergere. |
| GET | `/api/analytics/{id}/summary` | KPI. |
| GET | `/api/analytics/{id}/timeseries` | Date pentru grafic. |
| GET | `/api/analytics/{id}/top-pages` | Pagini populare. |
| GET | `/api/analytics/{id}/top-elements` | Elemente apăsate. |
| GET | `/api/analytics/{id}/breakdown` | Referrer + dispozitive. |
| GET | `/api/analytics/{id}/heatmap?path=...` | Puncte pentru heatmap. |

### Linkuri & QR
| Metodă | Rută | Descriere |
|--------|------|-----------|
| GET/POST | `/api/links` | Listă / creare. |
| GET/PATCH/DELETE | `/api/links/{id}` | Detalii / editare / ștergere. |
| GET | `/api/links/{id}/stats` | Statistici. |
| GET | `/api/links/{id}/qr.png` / `qr.svg` | Imaginea QR. |

### Public (fără autentificare)
| Metodă | Rută | Descriere |
|--------|------|-----------|
| GET | `/px/t.js` | Scriptul de tracking. |
| POST | `/px/collect` | Primește evenimentele de la pixel. |
| GET | `/l/{slug}` | Redirect link (sursă = click). |
| GET | `/q/{slug}` | Redirect QR (sursă = scanare). |

---

## 8. Modelul de date

```
users ──┬──< sites ──< events          (un user are mai multe site-uri, fiecare cu evenimente)
        └──< tracked_links ──< link_visits   (un user are mai multe linkuri, fiecare cu vizite)
```

| Tabel | Rol | Câmpuri cheie |
|-------|-----|---------------|
| `users` | conturi | email, password_hash (argon2), is_admin |
| `sites` | site-uri urmărite | site_key (cheia din snippet), owner_id |
| `events` | evenimente pixel | type, path, x_pct/y_pct, visitor_id, session_id |
| `tracked_links` | linkuri/QR | slug (unic, permanent), destination_url, location_label |
| `link_visits` | intrări pe linkuri | source (link/qr), device_type, ip_hash |

---

## 9. Configurare (`.env`)

| Variabilă | Ce face |
|-----------|---------|
| `POSTGRES_USER/PASSWORD/DB` | credențialele bazei de date |
| `POSTGRES_PORT` | portul DB pe host (intern e mereu 5432) |
| `BACKEND_PORT` / `FRONTEND_PORT` | porturile pe host |
| `JWT_SECRET` | **secret pentru semnarea tokenurilor — schimbă-l!** |
| `BASE_URL` | URL-ul public al backend-ului (intră în snippet, linkuri, QR) |
| `FRONTEND_ORIGIN` | originea dashboard-ului (pentru CORS) |
| `COOKIE_SECURE` | `true` doar pe HTTPS (producție) |
| `FIRST_ADMIN_EMAIL/PASSWORD` | adminul creat automat la prima pornire |

---

## 10. Probleme frecvente

| Simptom | Cauză / soluție |
|---------|-----------------|
| `port is already allocated` la pornire | Alt proces/container folosește portul. Schimbă portul în `.env` și `docker compose up -d`. |
| Nu pot face login | Verifică emailul/parola din `.env`. Dacă ai schimbat adminul după prima pornire, fă `docker compose down -v` (șterge DB) și pornește din nou. |
| Pixelul nu trimite date | Verifică în Console-ul browserului dacă `t.js` s-a încărcat și că `data-site` e cheia corectă. |
| Heatmap gol | Trebuie cel puțin un `click` pe pagina selectată; alege pagina din dropdown. |
| QR-ul nu apare în dashboard | Imaginea vine de la backend cu cookie-ul de sesiune — trebuie să fii logat. |

---

## 11. Trecerea în producție (rezumat)

1. În `.env`: `JWT_SECRET` random (`openssl rand -hex 32`), `COOKIE_SECURE=true`, `BASE_URL`/`FRONTEND_ORIGIN` cu domeniul real.
2. Pune un reverse proxy (nginx/Traefik) cu HTTPS în fața serviciilor.
3. Ideal, servește dashboard-ul și API-ul sub același domeniu (ex. `app.domeniu.ro` și `app.domeniu.ro/api`) ca să simplifici cookie-urile.
4. Fă backup periodic la volumul `db_data`.
```
