# Operare 3 — Deployment (producție)

Cum pui „Statistic" pe un server Linux (ex. Ubuntu/Debian) sub **un singur SUBDOMENIU**, cu un **nginx dispecer** pe host care rutează totul. Pentru pornire locală vezi [01-pornire-locala.md](01-pornire-locala.md).

> **Placeholder:** peste tot în docs și config folosim subdomeniul de exemplu **`app.exemplu.ro`**. Când ai subdomeniul real (îl furnizează proprietarul mai târziu), înlocuiește-l peste tot. Vezi tabelul de mai jos.

---

## 0. Valori pe care TREBUIE să le completezi

Toate se pun în `.env.prod` (copiat din `.env.prod.example`), plus subdomeniul în `deploy/nginx/statistic.conf`.

| Ce înlocuiești | Unde | Cu ce |
|---|---|---|
| `app.exemplu.ro` | `.env.prod` (`BASE_URL`, `FRONTEND_ORIGIN`), `deploy/nginx/statistic.conf` (`server_name`), certbot `-d` | **subdomeniul real** furnizat de proprietar |
| `JWT_SECRET` | `.env.prod` | output-ul de la `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | `.env.prod` | parolă lungă random (`openssl rand -hex 24`) |
| `FIRST_ADMIN_EMAIL` | `.env.prod` | emailul tău de admin |
| `FIRST_ADMIN_PASSWORD` | `.env.prod` | parolă tare (schimbă-o și din UI după login) |
| `COOKIE_SECURE` | `.env.prod` | `false` pe HTTP → `true` DUPĂ activarea HTTPS |
| `BASE_URL` / `FRONTEND_ORIGIN` schema | `.env.prod` | `http://` pe început → `https://` DUPĂ certbot |
| `ANTHROPIC_API_KEY` (opțional) | `.env.prod` | cheia Anthropic dacă vrei feature-ul AI (altfel lasă gol) |

Rămân **neschimbate** (deja corecte pentru producție): `VITE_API_URL=` (gol), `BIND_HOST=127.0.0.1:`, porturile interne (`8010`/`5180`/`5433`).

---

## Cum arată arhitectura

```
                      INTERNET
                         │
                         ▼  app.exemplu.ro :80 (apoi :443)
                ┌──────────────────────┐
                │   nginx pe HOST      │   ← "dispecerul"
                │   (system, nu Docker)│
                └─────────┬────────────┘
            /api /auth /px│/l /q /health /docs        / (restul)
                          ▼                            ▼
              127.0.0.1:8010 backend          127.0.0.1:5180 frontend
                 (FastAPI/uvicorn)               (nginx intern + React build)
                          │
                          ▼
                 127.0.0.1:5433 db (PostgreSQL)
```

- Tot ce vine din afară intră prin **un singur** nginx (80/443).
- Containerele sunt legate **doar pe `127.0.0.1`** (prin `BIND_HOST=127.0.0.1:`) — nu sunt expuse direct pe internet.
- Dashboard-ul face cereri **relative** (`/api/...`) pe același subdomeniu → **fără CORS**, cookie same-origin curat.
- Backend-ul (`assert_secure()` în `backend/app/config.py`) **refuză să pornească** în producție dacă `JWT_SECRET` sau `FIRST_ADMIN_PASSWORD` au rămas valorile default.

---

## 1. Recunoaștere pe server

```bash
curl -4 ifconfig.me ; echo                       # IP-ul public (pentru DNS)
cat /etc/os-release | grep PRETTY_NAME           # distribuția
docker --version 2>/dev/null || echo "Docker LIPSEȘTE"
docker compose version 2>/dev/null || echo "Docker Compose LIPSEȘTE"
nginx -v 2>/dev/null || echo "nginx LIPSEȘTE"
sudo ss -tlnp | grep -E ':(80|443|8010|5180|5433)\b' || echo "porturile sunt libere"
```

> Notează **IP-ul public** — îl folosești la pasul 5 (DNS).

---

## 2. Instalează ce lipsește

```bash
# Docker + Compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER        # docker fără sudo (reconectează-te după)

# nginx (dispecerul de pe host)
sudo apt update && sudo apt install -y nginx
sudo systemctl enable --now nginx
```

---

## 3. Codul + `.env.prod`

```bash
git clone <repo-ul-tau> /opt/statistic
cd /opt/statistic
cp .env.prod.example .env.prod
openssl rand -hex 32                  # generează JWT_SECRET (copiază output-ul)
openssl rand -hex 24                  # generează POSTGRES_PASSWORD
nano .env.prod                        # completează valorile din tabelul de la pasul 0
```

Editează `.env.prod` conform tabelului de la **pasul 0**. Cât timp ești pe HTTP: `BASE_URL`/`FRONTEND_ORIGIN` cu `http://` și `COOKIE_SECURE=false`.

**Preflight** (verifică că nu au rămas valori default periculoase):

```bash
bash deploy/preflight.sh
```

Rulează-l până vezi „Preflight OK". (E doar-citire, nu modifică nimic.)

---

## 4. Pornește containerele

```bash
docker compose --env-file .env.prod up -d --build
```

> `--env-file .env.prod` folosește valorile de producție inclusiv la **build**-ul frontend-ului (unde `VITE_API_URL` gol e cusut în bundle pentru cereri relative). `restart: unless-stopped` e deja setat pe toate serviciile → repornesc singure după reboot.

Verifică:

```bash
docker compose ps                          # toate 3 = Up/healthy
curl -s http://127.0.0.1:8010/health       # => {"status":"ok"}
curl -sI http://127.0.0.1:5180/ | head -1  # => HTTP/1.1 200 OK
```

Rebuild după orice schimbare în `.env.prod`: rulează din nou `up -d --build` (frontend-ul trebuie rebuild-at ca să prindă noul `VITE_API_URL`/subdomeniu).

---

## 5. DNS

Adaugă un record **A** la registrarul domeniului, pentru subdomeniu:

```
Tip: A   Nume: app (subdomeniul)   Valoare: IP_PUBLIC_AL_SERVERULUI   TTL: 300
```

```bash
dig +short app.exemplu.ro      # trebuie să returneze IP-ul serverului
```

---

## 6. nginx dispecerul (host)

```bash
nano deploy/nginx/statistic.conf     # înlocuiește app.exemplu.ro cu subdomeniul real
sudo cp deploy/nginx/statistic.conf /etc/nginx/sites-available/statistic
sudo ln -s /etc/nginx/sites-available/statistic /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # (opțional) dezactivează default-ul
sudo nginx -t && sudo systemctl reload nginx
```

Verifică din afară:

```
http://app.exemplu.ro/         -> dashboard, login cu admin-ul din .env.prod
http://app.exemplu.ro/health   -> {"status":"ok"}
http://app.exemplu.ro/docs     -> Swagger
```

> Dacă vezi pagina default de nginx: ai uitat să dezactivezi `sites-enabled/default` sau `server_name` nu se potrivește.

---

## 7. HTTPS (după ce pasul 6 merge pe HTTP)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.exemplu.ro    # alege redirect 80 -> 443
```

certbot rescrie automat `statistic.conf` (adaugă blocul `listen 443 ssl`, certificatele și redirect-ul). Apoi în `.env.prod`:

```
BASE_URL=https://app.exemplu.ro
FRONTEND_ORIGIN=https://app.exemplu.ro
COOKIE_SECURE=true
```

și **rebuild**:

```bash
bash deploy/preflight.sh                              # acum trebuie "Preflight OK"
docker compose --env-file .env.prod up -d --build
```

Reînnoirea certificatului e automată; verifici cu `sudo certbot renew --dry-run`.

**HSTS (recomandat, DOAR pe HTTPS):** după ce HTTPS merge stabil, adaugă în blocul server 443 (creat de certbot):

```
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

apoi `sudo nginx -t && sudo systemctl reload nginx`.

---

## 8. Firewall

```bash
sudo ufw allow 22,80,443/tcp
sudo ufw enable
```

Porturile interne (8010/5180/5433) nu se deschid — sunt legate pe `127.0.0.1`, deci inaccesibile din afară oricum.

---

## Backup & restore DB

Volumul `db_data` ține toată baza. Fă backup regulat (ideal din cron).

```bash
cd /opt/statistic

# BACKUP (dump logic, comprimat, cu dată în nume):
docker exec -t statistic_db pg_dump -U statistic -d statistic \
  | gzip > /opt/statistic/backups/db_$(date +%F_%H%M).sql.gz

# RESTORE (atenție: suprascrie datele curente):
gunzip -c /opt/statistic/backups/db_2026-01-01_0300.sql.gz \
  | docker exec -i statistic_db psql -U statistic -d statistic
```

> `statistic_db` = `container_name` din `docker-compose.yml`. Backup-urile `*.sql` sunt în `.gitignore`.

Cron zilnic la 03:00 (exemplu):

```bash
mkdir -p /opt/statistic/backups
( crontab -l 2>/dev/null; echo '0 3 * * * docker exec -t statistic_db pg_dump -U statistic -d statistic | gzip > /opt/statistic/backups/db_$(date +\%F).sql.gz' ) | crontab -
```

---

## Update la o versiune nouă

```bash
cd /opt/statistic
docker exec -t statistic_db pg_dump -U statistic -d statistic | gzip > backups/db_pre_update_$(date +%F_%H%M).sql.gz   # backup întâi!
git pull
bash deploy/preflight.sh
docker compose --env-file .env.prod up -d --build     # rebuild + restart doar ce s-a schimbat
docker compose ps
curl -s http://127.0.0.1:8010/health
```

---

## Operare zilnică (cheat-sheet)

```bash
cd /opt/statistic

# Loguri:
docker compose logs -f backend
sudo tail -f /var/log/nginx/statistic.error.log

# Restart / stop:
docker compose --env-file .env.prod restart
docker compose --env-file .env.prod down
```

---

## Checklist final de securitate

- [ ] `JWT_SECRET` random cu `openssl rand -hex 32` (nu `change-me-in-production`)
- [ ] `POSTGRES_PASSWORD` și `FIRST_ADMIN_PASSWORD` schimbate din valorile din exemplu
- [ ] `bash deploy/preflight.sh` afișează „Preflight OK"
- [ ] `COOKIE_SECURE=true` + `BASE_URL`/`FRONTEND_ORIGIN` pe `https://` după certbot
- [ ] `BIND_HOST=127.0.0.1:` (containerele nu sunt expuse direct)
- [ ] `VITE_API_URL=` gol (cereri relative same-origin, fără CORS)
- [ ] Firewall: doar 22, 80, 443 (`sudo ufw allow 22,80,443/tcp && sudo ufw enable`)
- [ ] HSTS activat în nginx după ce HTTPS e stabil
- [ ] `.env.prod` **NU** e în git (e ignorat)
- [ ] Backup DB automat (cron `pg_dump`) și testat un restore
- [ ] Parola de admin schimbată din UI după primul login
