# Deployment — Statistic pe server (cu nginx dispecer)

Ghid pas cu pas pentru a pune aplicația pe un server Linux (ex: Ubuntu/Debian),
cu **un singur domeniu** și un **nginx pe host** care rutează totul.

## Cum arată arhitectura

```
                      INTERNET
                         │
                         ▼  app.domeniul-tau.ro :80 (apoi :443)
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

- Tot ce vine din afară intră prin **un singur** nginx (portul 80/443).
- Containerele Docker sunt legate **doar pe `127.0.0.1`** (prin `BIND_HOST=127.0.0.1:`)
  — nu sunt expuse direct pe internet.
- Dashboard-ul face cereri **relative** (`/api/...`) pe același domeniu, deci **fără
  CORS** și cookie-ul de sesiune merge curat (same-origin).

---

## 0. Ce afli pe server (comenzi de „recunoaștere")

Conectează-te pe server (`ssh user@IP_SERVER`) și află datele de care ai nevoie:

```bash
# IP-ul public al serverului (îl pui în DNS-ul domeniului):
curl -4 ifconfig.me ; echo

# Distribuția și versiunea:
cat /etc/os-release | grep PRETTY_NAME

# Ce e instalat deja (gol = trebuie instalat):
docker --version 2>/dev/null || echo "Docker LIPSEȘTE"
docker compose version 2>/dev/null || echo "Docker Compose LIPSEȘTE"
nginx -v 2>/dev/null || echo "nginx LIPSEȘTE"

# Porturi deja ocupate (verifică să fie libere 80, 8010, 5180, 5433):
sudo ss -tlnp | grep -E ':(80|443|8010|5180|5433)\b' || echo "porturile sunt libere"
```

> Notează **IP-ul public** — îl folosești la pasul 4 (DNS).

---

## 1. Instalează ce lipsește

```bash
# --- Docker + Docker Compose (plugin) ---
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER        # ca să rulezi docker fără sudo
# deconectează-te și reconectează-te (sau: newgrp docker) ca să se aplice

# --- nginx (dispecerul de pe host) ---
sudo apt update && sudo apt install -y nginx
sudo systemctl enable --now nginx
```

---

## 2. Adu codul și configurează `.env.prod`

```bash
# Clonează proiectul (sau copiază-l cu scp/rsync) într-un folder, ex:
git clone <repo-ul-tau> /opt/statistic
cd /opt/statistic

# Creează fișierul de producție din exemplu:
cp .env.prod.example .env.prod

# Generează un JWT_SECRET random și pune-l în .env.prod:
openssl rand -hex 32
```

Editează `.env.prod` (`nano .env.prod`) și completează:

| Variabilă | Pune | De ce |
|---|---|---|
| `BASE_URL` | `http://app.domeniul-tau.ro` | domeniul tău real (http cât timp nu ai TLS) |
| `FRONTEND_ORIGIN` | la fel ca `BASE_URL` | un singur domeniu |
| `JWT_SECRET` | output-ul de la `openssl rand -hex 32` | securitate sesiuni |
| `POSTGRES_PASSWORD` | parolă lungă random | securitate DB |
| `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` | datele tale de admin | primul login |
| `VITE_API_URL` | **gol** | cereri relative same-origin |
| `BIND_HOST` | `127.0.0.1:` | porturile doar pe localhost |
| `COOKIE_SECURE` | `false` (acum) → `true` (după HTTPS) | cookie pe HTTPS |

---

## 3. Pornește containerele

```bash
docker compose --env-file .env.prod up -d --build
```

> `--env-file .env.prod` spune lui Docker Compose să folosească valorile de
> producție (inclusiv la **build**-ul frontend-ului, unde `VITE_API_URL` gol e cusut
> în bundle ca să facă cereri relative).

Verifică:

```bash
docker compose ps                 # toate 3 (db, backend, frontend) = Up/healthy
curl -s http://127.0.0.1:8010/health     # => {"status":"ok"}
curl -sI http://127.0.0.1:5180/ | head -1 # => HTTP/1.1 200 OK
```

Dacă rebuild-ezi mai târziu după ce schimbi `.env.prod`, rulează din nou aceeași
comandă cu `up -d --build` (frontend-ul trebuie **rebuild-at** ca să prindă noul
`VITE_API_URL`/domeniu).

---

## 4. Pointează domeniul spre server (DNS)

La registrarul/DNS-ul domeniului, adaugă un record **A**:

```
Tip: A     Nume: app (sau @)     Valoare: IP_PUBLIC_AL_SERVERULUI     TTL: 300
```

Verifică propagarea (poate dura câteva minute):

```bash
dig +short app.domeniul-tau.ro      # trebuie să returneze IP-ul serverului
```

---

## 5. Configurează nginx dispecerul (host)

```bash
# 1) Editează domeniul în fișier (înlocuiește app.domeniul-tau.ro):
nano deploy/nginx/statistic.conf

# 2) Activează-l:
sudo cp deploy/nginx/statistic.conf /etc/nginx/sites-available/statistic
sudo ln -s /etc/nginx/sites-available/statistic /etc/nginx/sites-enabled/

# (opțional) dezactivează site-ul default ca să nu intercepteze:
sudo rm -f /etc/nginx/sites-enabled/default

# 3) Testează sintaxa și reîncarcă:
sudo nginx -t && sudo systemctl reload nginx
```

Acum verifică din afară (de pe laptopul tău):

```
http://app.domeniul-tau.ro/            -> dashboard, login cu admin-ul din .env.prod
http://app.domeniul-tau.ro/health      -> {"status":"ok"}
http://app.domeniul-tau.ro/docs        -> Swagger
```

> Dacă vezi pagina default de nginx, ai uitat să dezactivezi `sites-enabled/default`
> sau `server_name` nu se potrivește cu domeniul.

---

## 6. Activează HTTPS (după ce pasul 5 merge pe HTTP)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.domeniul-tau.ro
# alege redirect 80 -> 443 când întreabă. Certbot îți rescrie automat fișierul nginx.
```

Apoi treci aplicația pe HTTPS — editează `.env.prod`:

```
BASE_URL=https://app.domeniul-tau.ro
FRONTEND_ORIGIN=https://app.domeniul-tau.ro
COOKIE_SECURE=true
```

și **rebuild** (ca să se actualizeze linkurile/snippet-ul și bundle-ul):

```bash
docker compose --env-file .env.prod up -d --build
```

Reînnoirea certificatului e automată (certbot pune un timer). Verifici cu:
`sudo certbot renew --dry-run`.

---

## Operare zilnică (cheat-sheet)

```bash
cd /opt/statistic

# Loguri în timp real:
docker compose logs -f backend
sudo tail -f /var/log/nginx/statistic.error.log

# Repornește / oprește:
docker compose --env-file .env.prod restart
docker compose --env-file .env.prod down

# Update după un git pull:
git pull && docker compose --env-file .env.prod up -d --build

# Backup bază de date:
docker compose exec db pg_dump -U statistic statistic > backup_$(date +%F).sql

# Restore:
cat backup_2026-01-01.sql | docker compose exec -T db psql -U statistic -d statistic
```

---

## Checklist final de securitate

- [ ] `JWT_SECRET` și `POSTGRES_PASSWORD` random (nu valorile din exemplu)
- [ ] `COOKIE_SECURE=true` după ce ai HTTPS
- [ ] `BIND_HOST=127.0.0.1:` (containerele nu sunt expuse direct)
- [ ] Firewall: deschis doar 22 (SSH), 80, 443 — ex: `sudo ufw allow 22,80,443/tcp && sudo ufw enable`
- [ ] `.env.prod` **NU** e în git (e ignorat — vezi `.gitignore`)
- [ ] Parola de admin schimbată după primul login
```
