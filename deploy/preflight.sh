#!/usr/bin/env bash
# =============================================================================
#  Statistic — PREFLIGHT de producție
# -----------------------------------------------------------------------------
#  Verifică (DOAR citește, nu modifică nimic) că .env.prod nu mai are valori
#  default periculoase înainte de deploy. Tipărește un raport ✓ / ✗.
#
#  Utilizare:
#      bash deploy/preflight.sh              # verifică ./.env.prod
#      bash deploy/preflight.sh /cale/.env.prod
#
#  Cod de ieșire: 0 dacă totul e OK, 1 dacă există cel puțin un ✗.
#  Idempotent și sigur: nu scrie, nu pornește nimic.
# =============================================================================
set -u

ENV_FILE="${1:-.env.prod}"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; BOLD='\033[1m'; NC='\033[0m'

fail=0
ok()   { printf "  ${GREEN}✓${NC} %s\n" "$1"; }
bad()  { printf "  ${RED}✗${NC} %s\n" "$1"; fail=1; }
warn() { printf "  ${YELLOW}!${NC} %s\n" "$1"; }

printf "${BOLD}Preflight producție — %s${NC}\n" "$ENV_FILE"

if [ ! -f "$ENV_FILE" ]; then
    printf "${RED}Nu găsesc %s. Copiază .env.prod.example în .env.prod și completează-l.${NC}\n" "$ENV_FILE"
    exit 1
fi

# Citește o variabilă din fișier (ultima definiție câștigă), fără a executa fișierul.
getvar() {
    grep -E "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE" 2>/dev/null \
        | tail -n1 | cut -d= -f2- | sed 's/[[:space:]]*$//'
}

JWT_SECRET="$(getvar JWT_SECRET)"
COOKIE_SECURE="$(getvar COOKIE_SECURE)"
VITE_API_URL="$(getvar VITE_API_URL)"
BIND_HOST="$(getvar BIND_HOST)"
POSTGRES_PASSWORD="$(getvar POSTGRES_PASSWORD)"
FIRST_ADMIN_PASSWORD="$(getvar FIRST_ADMIN_PASSWORD)"
BASE_URL="$(getvar BASE_URL)"
FRONTEND_ORIGIN="$(getvar FRONTEND_ORIGIN)"

echo
echo "── Secrete ──────────────────────────────────────────────"

# JWT_SECRET: nu default, non-gol, lungime rezonabilă (>=32).
case "$JWT_SECRET" in
    ""|"change-me-in-production"|"GENEREAZA_CU_openssl_rand_hex_32")
        bad "JWT_SECRET are încă valoare default/goală (rulează: openssl rand -hex 32)" ;;
    *)
        if [ "${#JWT_SECRET}" -lt 32 ]; then
            bad "JWT_SECRET e prea scurt (${#JWT_SECRET} caractere; recomandat >=32)"
        else
            ok "JWT_SECRET setat (${#JWT_SECRET} caractere)"
        fi ;;
esac

# Parola DB.
case "$POSTGRES_PASSWORD" in
    ""|"statistic"|"SCHIMBA_parola_asta_lunga_si_random")
        bad "POSTGRES_PASSWORD are încă valoare default/goală" ;;
    *)  ok "POSTGRES_PASSWORD schimbată" ;;
esac

# Parola admin inițială.
case "$FIRST_ADMIN_PASSWORD" in
    ""|"admin1234"|"SCHIMBA_parola_de_admin")
        bad "FIRST_ADMIN_PASSWORD are încă valoare default (schimb-o și din UI după login)" ;;
    *)  ok "FIRST_ADMIN_PASSWORD schimbată" ;;
esac

echo
echo "── Rețea / same-origin ──────────────────────────────────"

# VITE_API_URL trebuie gol (cereri relative, same-origin).
if [ -z "$VITE_API_URL" ]; then
    ok "VITE_API_URL gol (cereri relative same-origin, fără CORS)"
else
    bad "VITE_API_URL='$VITE_API_URL' — pe un singur subdomeniu trebuie GOL"
fi

# BIND_HOST trebuie 127.0.0.1: (containerele doar pe localhost).
if [ "$BIND_HOST" = "127.0.0.1:" ]; then
    ok "BIND_HOST=127.0.0.1: (containerele nu sunt expuse direct pe internet)"
else
    bad "BIND_HOST='$BIND_HOST' — trebuie '127.0.0.1:' în producție"
fi

echo
echo "── HTTPS / cookie ───────────────────────────────────────"

# Coerență COOKIE_SECURE vs schema URL.
is_https=0
case "$BASE_URL" in https://*) is_https=1;; esac

if [ "$COOKIE_SECURE" = "true" ]; then
    if [ "$is_https" -eq 1 ]; then
        ok "COOKIE_SECURE=true și BASE_URL pe https:// (corect pentru producție)"
    else
        bad "COOKIE_SECURE=true dar BASE_URL nu e https:// — nu te vei putea loga"
    fi
else
    if [ "$is_https" -eq 1 ]; then
        bad "BASE_URL e https:// dar COOKIE_SECURE=$COOKIE_SECURE — pune-l true"
    else
        warn "COOKIE_SECURE=$COOKIE_SECURE (OK cât timp ești pe HTTP; pune true DUPĂ certbot)"
    fi
fi

# Placeholder de subdomeniu rămas necompletat.
case "$BASE_URL$FRONTEND_ORIGIN" in
    *app.exemplu.ro*)
        warn "Încă folosești placeholder-ul app.exemplu.ro — înlocuiește-l cu subdomeniul real" ;;
esac

echo
echo "─────────────────────────────────────────────────────────"
if [ "$fail" -eq 0 ]; then
    printf "${GREEN}${BOLD}Preflight OK — poți face deploy.${NC}\n"
    exit 0
else
    printf "${RED}${BOLD}Preflight a găsit probleme (✗) — rezolvă-le înainte de deploy.${NC}\n"
    exit 1
fi
