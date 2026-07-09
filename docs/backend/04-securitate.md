# 04 — Securitate

> Mecanismele de securitate ale backend-ului: guard SQLi/XSS, autentificare JWT în cookie httpOnly, hash argon2, rate-limiting, sanitizare bleach, security headers, hashing de IP și login timing-safe. Filozofia e **defense-in-depth** — mai multe straturi independente.

Vezi și: [endpoint-uri](03-api-endpoints.md) · [model de date](02-model-de-date.md).

---

## Straturile de apărare (privire de ansamblu)

```
Request
  │
  ├─▶ SecurityGuardMiddleware   → scanează query + body (SQLi/XSS) → 400
  │                              → adaugă security headers pe răspuns
  ├─▶ CORS                       → doar originile permise, cu credențiale
  ├─▶ Rate limit (slowapi)       → login 10/min, /px/collect 120/min
  ├─▶ Auth (cookie httpOnly)     → JWT HS256; get_current_user / require_admin / require_cap
  │
  ▼ Handler
     ├─ SQLAlchemy ORM (query parametrizat)   ← apărarea principală anti-SQLi
     ├─ bleach clean_text() la stocare        ← anti-XSS persistent
     └─ hash_ip() pentru IP-uri               ← minimizare PII
```

---

## 1. Guard SQLi/XSS + security headers (`core/guard.py`)

`SecurityGuardMiddleware` este un middleware ASGI adăugat **primul** pe lanțul de execuție (în `main.py` e adăugat ultimul, deci rulează primul). Rol dublu:

### a) Detecția tiparelor malițioase

Scanează **query string-ul** și, pentru metodele cu corp (`POST/PUT/PATCH/DELETE`), **corpul cererii**. Valorile sunt `unquote`-ate înainte de potrivire (prinde și payload-uri URL-encodate). La potrivire → răspuns **400** cu `{"detail":"Cerere blocata de filtrul de securitate (SQLi/XSS)."}`.

**Tipare SQLi** (regex, case-insensitive): `UNION SELECT`, `SELECT ... FROM`, `INSERT INTO`, `DROP TABLE`, `DELETE FROM`, `UPDATE ... SET`, `OR <n>=<n>` (ex. `OR 1=1`), `' OR '1`, comentariu SQL la final (`--`/`#`), `; drop|delete|insert|update`.

**Tipare XSS** (regex): `<script`, `</script`, `javascript:`, handler-e inline `on\w+=` (onerror/onload/onclick), `<iframe`, `<img ... src ... onerror`, `document.cookie`.

### b) Excepții controlate

- **Prefixe „relaxate":** `/px/collect` — ingestia publică, unde textul unui buton poate conține caractere altfel blocate. Aici corpul **nu** e bufferizat/scanat (economie pe fiecare beacon); datele sunt validate & sanitizate separat la endpoint (`clean_text`, plafoane pe `props`).
- **Corpuri binare:** cererile `multipart/form-data` (upload de imagini/capturi) **nu** sunt scanate ca text (ar da false-pozitive); fișierele sunt validate la endpoint (content-type, Pillow `verify()`, limite de mărime).
- Corpul este re-injectat corect către handler-ul real (`wrapped_receive`), deci scanarea nu „consumă" cererea.

### c) Security headers

La fiecare răspuns (`wrapped_send`) se adaugă:

| Header | Valoare | Rol |
|--------|---------|-----|
| `X-Content-Type-Options` | `nosniff` | Interzice MIME-sniffing. |
| `X-Frame-Options` | `DENY` | Anti-clickjacking. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limitează scurgerea de referrer. |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Dezactivează API-uri sensibile. |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'` | Restrânge sursele de conținut. |

---

## 2. Autentificare JWT în cookie httpOnly

### Emiterea tokenului (`core/security.py`)

- `create_access_token(subject)` — JWT semnat **HS256** cu `JWT_SECRET`, payload `{sub, exp}`, expirare `ACCESS_TOKEN_EXPIRE_MINUTES` (implicit 7 zile).
- `decode_access_token(token)` — verifică semnătura/expirarea; la eșec returnează `None` (fără a arunca în afară).

### Cookie-ul (`api/auth.py` → `_set_auth_cookie`)

Tokenul se pune într-un cookie cu:

| Atribut | Valoare | De ce |
|---------|---------|-------|
| `httponly` | `True` | JavaScript-ul din pagină nu-l poate citi → protecție dacă apare un XSS. |
| `secure` | `settings.COOKIE_SECURE` | `true` pe HTTPS (producție). |
| `samesite` | `lax` | Reduce riscul CSRF. |
| `max_age` | `ACCESS_TOKEN_EXPIRE_MINUTES * 60` | Aliniat la expirarea tokenului. |
| `path` | `/` | Valabil pe tot API-ul. |

`POST /auth/logout` face `delete_cookie`.

### Verificarea la cereri (`api/deps.py`)

- `get_current_user` — citește tokenul din cookie (`Cookie(alias=COOKIE_NAME)`), îl decodează, încarcă userul; 401 dacă lipsește/invalid/inactiv.
- `require_admin` — 403 dacă `is_admin` e fals.
- `has_cap(user, cap)` — adminul are toate capabilitățile; altfel citește `can_<cap>`.
- `require_cap(cap)` / `require_links_area` — dependențe care impun capabilitatea pe server (403), nu doar ascund în UI.

---

## 3. Parole cu argon2 (`core/security.py`)

- `pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")`.
- `hash_password` / `verify_password` — parola nu se stochează niciodată în clar; doar hash-ul argon2 ajunge în `users.password_hash`.

---

## 4. Login timing-safe (`api/auth.py`)

Pentru a nu dezvălui prin timp de răspuns ce email-uri există (enumerare prin timing):

- La pornirea modulului se calculează un **hash-momeală** `_DUMMY_HASH`.
- Dacă user-ul **nu** există, se apelează totuși `verify_password(payload.password, _DUMMY_HASH)` — se cheltuie același timp ca o verificare reală — apoi se întoarce 401 cu același mesaj generic („Email sau parolă greșite").
- User existent dar parolă greșită → același 401 generic. Cont inactiv → 403 „Cont dezactivat".

---

## 5. Rate limiting (slowapi)

`limiter = Limiter(key_func=get_remote_address)` (`core/guard.py`), înregistrat în `main.py` cu handler-ul de `RateLimitExceeded`.

| Endpoint | Limită | Motiv |
|----------|--------|-------|
| `POST /auth/login` | `10/minute` | Anti brute-force pe parole. |
| `POST /px/collect` | `120/minute` | Anti spam/flood pe ingestie. |

---

## 6. Sanitizare la stocare — bleach (`core/sanitize.py`)

`clean_text(value)` folosește `bleach.clean(value, tags=[], attributes={}, strip=True)` — **elimină complet orice HTML/markup**. Aplicat la stocarea textelor introduse de utilizator:

- `sites`: `name`, `domain`.
- `tracked_links`: `name`, `description`, `location_label`.
- `events` (ingestie): `element_text`, iar `_clean_utm` curăță parametrii UTM.

Împreună cu escaparea automată din React (frontend), acoperă XSS-ul persistent (stored).

---

## 7. Hashing de IP (`core/security.py`)

`hash_ip(ip)` — IP-urile vizitatorilor de linkuri/QR **nu** se stochează brut. Se salvează `sha256(ip + ip_salt)` trunchiat la 32 de caractere (`link_visits.ip_hash`). Sarea (`settings.ip_salt`) vine din `IP_HASH_SALT` sau derivă din `JWT_SECRET + "::ip"`. IP-ul clientului se ia din `X-Forwarded-For` (primul) sau din `request.client.host`.

---

## 8. Alte măsuri

- **Query parametrizat peste tot** — accesul la DB e exclusiv prin SQLAlchemy ORM (fără concatenare de SQL); apărarea principală anti-SQLi (guard-ul e stratul suplimentar).
- **CORS cu origine explicită** — `allow_origins=settings.cors_origins`, `allow_credentials=True` (necesar pentru cookie-ul de sesiune).
- **Fail-fast de configurare** — `settings.assert_secure()` la pornire refuză producția cu `JWT_SECRET` default sau `FIRST_ADMIN_PASSWORD=admin1234`.
- **Owner-scoping consecvent** — resursele altui utilizator întorc 404 (nu dezvăluie existența).
- **Ingestie „silențioasă"** — `/px/collect` răspunde 204 și la payload invalid / site inexistent, ca să nu ofere informații atacatorilor.
- **Plafoane anti-DoS de stocare** — `props` la ingestie: max 25 chei, valori simple, max 2048 bytes serializat; batch max 50 evenimente; upload-uri limitate (galerie 25 MB/user, capturi 8 MB).
