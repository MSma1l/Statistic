# 🚀 Deploy pe serverul cu `nginx_proxy` comun

Ghid EXACT pentru serverul tău (Ubuntu + Docker + proxy comun `nginx_proxy` pe rețeaua `shared-network` + Let's Encrypt webroot). Diferă de [`03-deployment.md`](03-deployment.md) (model generic cu nginx pe host) — **pentru serverul tău folosește ACEST fișier**.

> Model confirmat: proxy-ul public `nginx_proxy` (din `/root/nginx-proxy`) rutează fiecare subdomeniu către containerul aplicației prin `shared-network`. Statistic se integrează la fel ca `balloonsbreeze` & co.

## Arhitectură pe acest server

```
Internet → ufw(80/443) → nginx_proxy → (shared-network) → statistic_frontend:80
                                                 │ dispecer intern (frontend/nginx.conf)
                                                 ├─ /api /auth /px /l /q /health → statistic_backend:8000
                                                 └─ restul → SPA React
   statistic_backend → statistic_db   (rețea privată statistic_internal, FĂRĂ porturi pe host)
```

Fișiere folosite: `docker-compose.prod.yml`, `.env.prod`, `frontend/nginx.conf` (dispecerul, deja în imagine), `deploy/nginx-proxy/statistic.conf` (vhost-ul de pus în proxy).

---

## Valori de completat (când ai subdomeniul)

| Unde | Ce |
|------|----|
| `.env.prod` → `BASE_URL`, `FRONTEND_ORIGIN` | `http://statistica.tbs.md` (apoi `https://` după cert) |
| `deploy/nginx-proxy/statistic.conf` → `server_name` + căile certului | `statistica.tbs.md` real |
| DNS | A-record `statistica.tbs.md` → IP-ul serverului |
| `.env.prod` → `COOKIE_SECURE` | `false` pe HTTP → `true` după HTTPS |

Secretele (`JWT_SECRET`, `POSTGRES_PASSWORD`, `FIRST_ADMIN_PASSWORD`) sunt deja generate în `.env.prod` (local, gitignored). Transferă `.env.prod` pe server (scp), NU prin git.

---

## Pași de deploy

### 1. Adu codul pe server
```bash
cd /root   # sau unde ții proiectele
git clone <repo-ul-Statistic> statistic && cd statistic
# transferă .env.prod de pe mașina ta (are secretele):
#   scp .env.prod root@IP:/root/statistic/.env.prod
```

### 2. Completează subdomeniul în .env.prod și verifică
```bash
# editează BASE_URL / FRONTEND_ORIGIN cu http://statistica.tbs.md
bash deploy/preflight.sh    # trebuie ✓ pe secrete/rețea (COOKIE_SECURE=false e OK în faza HTTP)
```

### 3. Pornește stiva (pe shared-network, fără porturi pe host)
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml ps      # db healthy, backend & frontend up
```
> `shared-network` există deja pe server. Dacă nu: `docker network create shared-network`.

### 4. Adaugă vhost-ul în proxy — FAZA 1 (HTTP, pentru emiterea certului)
```bash
# copiază vhost-ul și pune subdomeniul real
cp deploy/nginx-proxy/statistic.conf /root/nginx-proxy/conf.d/statistic.conf
sed -i 's/app.exemplu.ro/statistica.tbs.md/g' /root/nginx-proxy/conf.d/statistic.conf
# (lasă doar blocul FAZA 1 activ — e deja singurul necomentat)
docker exec nginx_proxy nginx -t && docker exec nginx_proxy nginx -s reload
```
Verifică pe HTTP: `curl -I http://statistica.tbs.md/health` → 200. Deschide `http://statistica.tbs.md` în browser și loghează-te (admin din `.env.prod`).

### 5. Emite certificatul Let's Encrypt (webroot, ca la celelalte apps)
```bash
docker run --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /root/nginx-proxy/certbot/www:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d statistica.tbs.md --email turcan.play@gmail.com --agree-tos --no-eff-email
```

### 6. Activează HTTPS — FAZA 2
```bash
# în /root/nginx-proxy/conf.d/statistic.conf:
#   comentează blocul FAZA 1, decomentează blocul FAZA 2 (80 redirect + 443 ssl)
docker exec nginx_proxy nginx -t && docker exec nginx_proxy nginx -s reload
```
Apoi în `.env.prod`: `BASE_URL`/`FRONTEND_ORIGIN` → `https://statistica.tbs.md`, `COOKIE_SECURE=true`, și reîncarcă backend-ul:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend
```
Verifică: `https://statistica.tbs.md` se deschide cu lacăt, login funcționează.

---

## Update la o versiune nouă
```bash
cd /root/statistic && git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Backup
```bash
# baza de date
docker exec statistic_db pg_dump -U statistic statistic > backup-$(date +%F).sql
# de salvat periodic și: /root/nginx-proxy, /etc/letsencrypt
```

## Depanare
- `curl http://statistica.tbs.md/health` merge dar browserul nu → verifică DNS (A-record → IP).
- 502 în proxy → containerul `statistic_frontend` e up? e pe `shared-network`? (`docker inspect statistic_frontend --format '{{json .NetworkSettings.Networks}}'`).
- Login nu ține sesiunea pe HTTPS → `COOKIE_SECURE=true` + `https://` în `BASE_URL`/`FRONTEND_ORIGIN`.
