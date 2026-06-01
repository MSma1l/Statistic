#!/usr/bin/env bash
# =============================================================
#  Test automat end-to-end pentru aplicația Statistic
#  Rulează: bash examples/test_e2e.sh
#  (Aplicația trebuie să fie pornită: docker compose up -d)
# =============================================================

BASE="${BASE_URL:-http://localhost:8010}"
FRONT="${FRONT_URL:-http://localhost:5180}"
EMAIL="${ADMIN_EMAIL:-admin@statistic.app}"
PASS_PW="${ADMIN_PASSWORD:-admin1234}"
JAR=$(mktemp)
JAR2=$(mktemp)

pass=0; fail=0
GREEN=$'\e[32m'; RED=$'\e[31m'; DIM=$'\e[2m'; B=$'\e[1m'; N=$'\e[0m'

check() { # nume, asteptat, primit
  if [ "$2" = "$3" ]; then
    echo "  ${GREEN}✓${N} $1"; pass=$((pass+1))
  else
    echo "  ${RED}✗${N} $1  ${DIM}(asteptat: $2, primit: $3)${N}"; fail=$((fail+1))
  fi
}
contains() { # nume, text, ce-cautam
  if printf '%s' "$2" | grep -q "$3"; then
    echo "  ${GREEN}✓${N} $1"; pass=$((pass+1))
  else
    echo "  ${RED}✗${N} $1  ${DIM}(nu am gasit: $3)${N}"; fail=$((fail+1))
  fi
}
sc() { curl -s -o /dev/null -w "%{http_code}" "$@"; }            # doar status code
ct() { curl -s -o /dev/null -w "%{content_type}" "$@"; }          # content-type
rd() { curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "$@"; }

echo "${B}== STATISTIC :: TEST END-TO-END ==${N}  (backend: $BASE)"

# ---------------------------------------------------------------
echo "${B}[1] Sănătate & frontend${N}"
check "Backend /health -> 200" 200 "$(sc $BASE/health)"
check "Frontend servit -> 200" 200 "$(sc $FRONT/)"
check "Tracker t.js -> 200" 200 "$(sc $BASE/px/t.js)"
contains "t.js are tip JavaScript" "$(ct $BASE/px/t.js)" "javascript"

# ---------------------------------------------------------------
echo "${B}[2] Autentificare${N}"
LOGIN=$(curl -s -c $JAR -X POST $BASE/auth/login -H "Content-Type: application/json" \
        -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS_PW\"}")
contains "Login corect întoarce userul" "$LOGIN" "\"email\""
check "Login cu parolă greșită -> 401" 401 \
  "$(sc -X POST $BASE/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"gresit\"}")"
check "/auth/me cu cookie -> 200" 200 "$(sc -b $JAR $BASE/auth/me)"
check "/auth/me FĂRĂ cookie -> 401" 401 "$(sc $BASE/auth/me)"
check "Acces nepermis (site-uri fără login) -> 401" 401 "$(sc $BASE/api/sites)"

# ---------------------------------------------------------------
echo "${B}[3] Guard de securitate (SQLi / XSS)${N}"
check "SQLi în login blocat -> 400" 400 \
  "$(sc -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"email":"a@a.com","password":"x'"'"' OR 1=1 --"}')"
check "XSS în nume site blocat -> 400" 400 \
  "$(sc -b $JAR -X POST $BASE/api/sites -H 'Content-Type: application/json' -d '{"name":"<script>alert(1)</script>"}')"
check "UNION SELECT în query blocat -> 400" 400 \
  "$(sc -b $JAR "$BASE/api/sites?q=1%20UNION%20SELECT%20password%20FROM%20users")"

# ---------------------------------------------------------------
echo "${B}[4] Pixel: site + ingestie + analytics${N}"
SITE=$(curl -s -b $JAR -X POST $BASE/api/sites -H "Content-Type: application/json" \
       -d '{"name":"E2E Test Site","domain":"e2e.test"}')
KEY=$(printf '%s' "$SITE" | grep -o '"site_key":"[a-f0-9]*"' | head -1 | sed 's/"site_key":"//;s/"//')
SID=$(printf '%s' "$SITE" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
contains "Site creat are snippet" "$SITE" "px/t.js"
[ -n "$KEY" ] && { echo "  ${DIM}site_key=$KEY  id=$SID${N}"; pass=$((pass+1)); echo "  ${GREEN}✓${N} site_key extras"; } \
              || { echo "  ${RED}✗${N} nu am putut crea site"; fail=$((fail+1)); }

check "Ingestie evenimente -> 204" 204 "$(sc -X POST $BASE/px/collect -H 'Content-Type: text/plain' \
  -d "{\"site\":\"$KEY\",\"visitor_id\":\"v1\",\"events\":[
       {\"type\":\"pageview\",\"path\":\"/acasa\",\"session_id\":\"s1\"},
       {\"type\":\"pageview\",\"path\":\"/produs\",\"session_id\":\"s1\"},
       {\"type\":\"click\",\"path\":\"/acasa\",\"element_selector\":\"button#buy\",\"element_text\":\"Cumpara\",\"x_pct\":40.5,\"y_pct\":22.1,\"session_id\":\"s1\"},
       {\"type\":\"click\",\"path\":\"/acasa\",\"element_selector\":\"a.menu\",\"element_text\":\"Meniu\",\"x_pct\":12.0,\"y_pct\":8.0,\"session_id\":\"s1\"}]}")"

SUM=$(curl -s -b $JAR "$BASE/api/analytics/$SID/summary?days=30")
contains "Summary: 2 pageviews" "$SUM" '"pageviews":2'
contains "Summary: 2 click-uri" "$SUM" '"clicks":2'
contains "Summary: 1 vizitator" "$SUM" '"visitors":1'
contains "Top-pages conține /acasa" "$(curl -s -b $JAR "$BASE/api/analytics/$SID/top-pages?days=30")" "/acasa"
contains "Top-elements conține 'Cumpara'" "$(curl -s -b $JAR "$BASE/api/analytics/$SID/top-elements?days=30")" "Cumpara"
contains "Breakdown are sectiunea devices" "$(curl -s -b $JAR "$BASE/api/analytics/$SID/breakdown?days=30")" "devices"
contains "Heatmap /acasa are 2 puncte" "$(curl -s -b $JAR "$BASE/api/analytics/$SID/heatmap?days=30&path=/acasa")" '"count":2'

# ---------------------------------------------------------------
echo "${B}[5] Linkuri & QR${N}"
SLUG="e2e-test-link"
# curățăm un eventual rest de la o rulare anterioară
OLD=$(curl -s -b $JAR $BASE/api/links | grep -o "\"id\":[0-9]*,\"slug\":\"$SLUG\"" | grep -o '[0-9]*' | head -1)
[ -n "$OLD" ] && curl -s -b $JAR -X DELETE $BASE/api/links/$OLD >/dev/null

LINK=$(curl -s -b $JAR -X POST $BASE/api/links -H "Content-Type: application/json" \
       -d "{\"slug\":\"$SLUG\",\"destination_url\":\"https://example.com/oferta\",\"name\":\"E2E\",\"location_label\":\"Test\"}")
LID=$(printf '%s' "$LINK" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
contains "Link creat are short_url" "$LINK" "/l/$SLUG"
check "Slug duplicat -> 409" 409 "$(sc -b $JAR -X POST $BASE/api/links -H 'Content-Type: application/json' \
  -d "{\"slug\":\"$SLUG\",\"destination_url\":\"https://x.com\"}")"
check "Slug invalid (cu spații) -> 422" 422 "$(sc -b $JAR -X POST $BASE/api/links -H 'Content-Type: application/json' \
  -d '{"slug":"slug invalid!","destination_url":"https://x.com"}')"

contains "Redirect /l/ -> 302 spre destinație" "$(rd $BASE/l/$SLUG)" "302 https://example.com/oferta"
contains "Redirect /q/ -> 302 spre destinație" "$(rd $BASE/q/$SLUG)" "302 https://example.com/oferta"
STATS=$(curl -s -b $JAR "$BASE/api/links/$LID/stats")
contains "Stats: 1 scanare QR" "$STATS" '"scans":1'
contains "Stats: 1 click link" "$STATS" '"clicks":1'
contains "QR PNG e imagine" "$(ct -b $JAR $BASE/api/links/$LID/qr.png)" "image/png"
contains "QR SVG e imagine" "$(ct -b $JAR $BASE/api/links/$LID/qr.svg)" "svg"

# ---------------------------------------------------------------
echo "${B}[6] Izolare între utilizatori${N}"
U2="e2e-user@test.com"
curl -s -b $JAR -X POST $BASE/auth/users -H "Content-Type: application/json" \
  -d "{\"email\":\"$U2\",\"full_name\":\"E2E User\",\"password\":\"parola123\"}" >/dev/null
curl -s -c $JAR2 -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d "{\"email\":\"$U2\",\"password\":\"parola123\"}" >/dev/null
SITES_U2=$(curl -s -b $JAR2 $BASE/api/sites)
check "Userul 2 NU vede site-urile adminului (listă goală)" "[]" "$SITES_U2"
check "Userul 2 NU poate accesa site-ul adminului -> 404" 404 "$(sc -b $JAR2 $BASE/api/sites/$SID)"
check "Userul 2 NU e admin (creare user) -> 403" 403 \
  "$(sc -b $JAR2 -X POST $BASE/auth/users -H 'Content-Type: application/json' -d '{"email":"x@x.com","password":"123456"}')"

# ---------------------------------------------------------------
echo "${B}[7] Curățenie (ștergem datele de test)${N}"
check "Ștergere link -> 204" 204 "$(sc -b $JAR -X DELETE $BASE/api/links/$LID)"
check "Ștergere site -> 204" 204 "$(sc -b $JAR -X DELETE $BASE/api/sites/$SID)"
# ștergem userul 2 (luăm id-ul din lista de utilizatori)
UID2=$(curl -s -b $JAR $BASE/auth/users | grep -o "{[^}]*$U2[^}]*}" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
[ -n "$UID2" ] && check "Ștergere user 2 -> 204" 204 "$(sc -b $JAR -X DELETE $BASE/auth/users/$UID2)"

rm -f $JAR $JAR2
# ---------------------------------------------------------------
echo ""
echo "${B}== REZULTAT: ${GREEN}$pass trecute${N}${B}, $([ $fail -gt 0 ] && echo "$RED")$fail eșuate${N} =="
[ $fail -eq 0 ] && echo "${GREEN}${B}TOTUL FUNCȚIONEAZĂ ✓${N}" || echo "${RED}${B}Sunt erori — vezi mai sus.${N}"
exit $fail
