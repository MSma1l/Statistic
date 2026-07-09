# Operare 1 — Pornire locală

Cum pornești „Statistic" pe calculatorul tău cu Docker Compose: configurare, comenzi, acces și probleme frecvente. Pentru deploy pe server vezi [03-deployment.md](03-deployment.md).

---

## Cerințe

- **Docker** + **Docker Compose** (plugin). Verifică: `docker --version` și `docker compose version`.

---

## Pornire în 3 pași

```bash
# 1. Configurarea (o singură dată)
cp .env.example .env
#    Editează .env și schimbă cel puțin JWT_SECRET și FIRST_ADMIN_PASSWORD.

# 2. Pornire (build + run)
docker compose up --build

# 3. Oprire
docker compose down
#    Adaugă -v ca să ștergi și datele din baza de date (reset complet).
```

---

## Acces după pornire

> Porturile de mai jos sunt cele **implicite din `.env.example`** (standard `8000 / 5173 / 5432`). Dacă le-ai mutat (ex. `8010 / 5180 / 5433`), folosește valorile tale.

| Ce | URL |
|----|-----|
| Dashboard | <http://localhost:5173> |
| API + Swagger (documentație interactivă) | <http://localhost:8000/docs> |
| Health-check | <http://localhost:8000/health> → `{"status":"ok"}` |
| Cont inițial | valorile din `.env` (implicit `admin@statistic.app` / `admin1234`) |

---

## Configurare (`.env`)

| Variabilă | Ce face |
|-----------|---------|
| `POSTGRES_USER/PASSWORD/DB` | credențialele bazei de date |
| `POSTGRES_PORT` | portul DB pe host (intern e mereu 5432) |
| `BACKEND_PORT` / `FRONTEND_PORT` | porturile pe host |
| `JWT_SECRET` | **secret pentru semnarea tokenurilor — schimbă-l!** (`openssl rand -hex 32`) |
| `BASE_URL` | URL-ul backend-ului (API) |
| `PUBLIC_BASE_URL` | **domeniul scurt, stabil** pentru linkuri/QR/pixel. Setează-l o dată și nu-l mai schimba → QR-urile printate rămân valide pe viață. Gol = folosește `BASE_URL`. |
| `FRONTEND_ORIGIN` | originea dashboard-ului (pentru CORS) |
| `VITE_API_URL` | URL-ul API folosit de dashboard la **build**. Local: backend-ul direct. Gol = cereri relative (producție, same-origin). |
| `COOKIE_SECURE` | `true` doar pe HTTPS (producție) |
| `FIRST_ADMIN_EMAIL/PASSWORD` | adminul creat automat la prima pornire |
| `BIND_HOST` | prefix pentru a lega porturile doar pe localhost (producție). Local: gol. |
| `ANTHROPIC_API_KEY` / `AI_MODEL` | (opțional) strat AI; gol = AI dezactivat grațios, restul merge normal. |

---

## Primii pași în aplicație

1. **Login** la dashboard cu adminul din `.env`.
2. **Pixel:** Site-uri → creează un site → copiază snippet-ul → pune-l în `<head>`:
   ```html
   <script async src="http://localhost:8000/px/t.js" data-site="CHEIA_TA"></script>
   ```
   Eveniment custom din codul tău: `window.statistic("nume_eveniment", { orice: "date" })`.
3. **Linkuri & QR:** Linkuri & QR → creează un element cu slug (ex. `promo-vara`) → link `.../l/promo-vara`, QR care duce la `.../q/promo-vara`.

Pentru un test rapid, deschide `examples/test.html` (înlocuiește cheia). Vezi [02-verificare-si-testare.md](02-verificare-si-testare.md).

---

## Probleme frecvente

| Simptom | Cauză / soluție |
|---------|-----------------|
| `port is already allocated` la pornire | Alt proces/container folosește portul. Schimbă portul în `.env` și `docker compose up -d`. |
| Nu pot face login | Verifică emailul/parola din `.env`. Dacă ai schimbat adminul după prima pornire, fă `docker compose down -v` (șterge DB) și pornește din nou. |
| Pixelul nu trimite date | În Console-ul browserului verifică dacă `t.js` s-a încărcat și că `data-site` e cheia corectă. |
| Heatmap gol | Trebuie cel puțin un `click` pe pagina selectată; alege pagina din dropdown. |
| QR-ul nu apare în dashboard | Imaginea vine de la backend cu cookie-ul de sesiune — trebuie să fii logat. |

### Unde te uiți dacă ceva nu merge

```bash
docker compose ps              # toate 3 trebuie să fie "Up" (db: healthy)
docker compose logs backend    # erori din backend
docker compose logs frontend   # erori din frontend
docker compose restart         # repornire rapidă
```
</content>
