# 📊 Starea proiectului

Ce e gata, ce e în lucru și ce lipsește — pe etape, ca proprietarul să știe exact unde se află proiectul. Legendă: ✅ COMPLET · 🟡 ÎN LUCRU · ⚪ LIPSEȘTE.

> **Notă de boot:** la un moment dat aplicația nu mai pornea din cauza unui import lipsă (`app.api.admin_settings`). Acest lucru a fost **reparat** prin crearea fișierului `backend/app/api/admin_settings.py` (GET/PUT setări globale). Boot-ul funcționează acum.

---

## Rezumat pe module

| Modul | Stare | Note |
|-------|:-----:|------|
| Autentificare (JWT + argon2, cookie httpOnly) | ✅ | login/logout/me. |
| Management utilizatori + permisiuni (RBAC) | ✅ | conturi pe invitație, presetări + bifaje fine, impuse și pe server (403). |
| Site-uri (pixel) — CRUD | ✅ | site_key, izolare per owner. |
| Analytics — modul complet | ✅ | vezi lista de mai jos. |
| Linkuri & QR (slug permanent, destinație editabilă) | ✅ | + QR PNG/SVG cu logo. |
| Galerie imagini (logo QR, cotă 25 MB) | ✅ | upload/listare/ștergere + bară de spațiu. |
| Pixel: `t.js` + `/px/collect` | ✅ | pageview/click/scroll/custom, UTM, durată. |
| Redirecturi `/l/{slug}` (click) și `/q/{slug}` (scanare) | ✅ | surse separate. |
| Securitate: guard SQLi/XSS, sanitizare, rate limiting, security headers | ✅ | middleware pe fiecare request. |
| Frontend: 8 pagini, rutare cu guards, lazy-loading | ✅ | Login, Dashboard, Sites, SiteDetail, Links, LinkDetail, Gallery, Settings. |
| Strat AI / CRO (consultant + gardian GDPR) | 🟡 | config + prompturi + router de settings există; integrarea reală lipsește. |
| Pâlnie de conversie (funnel) | 🟡 | model/tabel definit; fără endpoint-uri. |
| Teste automate | ⚪ | doar scriptul bash e2e; 0 teste unitare/e2e în cod. |
| Migrări reale (Alembic) | ⚪ | se folosește `create_all` + `ALTER ... IF NOT EXISTS`. |

---

## ✅ Complet — detaliat

### Backend
- **Auth:** JWT semnat (HS256) în cookie httpOnly, parole hash-uite cu **argon2**, `assert_secure()` refuză pornirea în producție cu secrete default.
- **Utilizatori & RBAC:** creare/editare/ștergere useri, flag-uri `can_sites` / `can_links` / `can_qr` + `is_admin`, izolare completă (fiecare user vede doar datele lui), permisiuni impuse pe server.
- **Site-uri:** CRUD complet, cheie de site pentru snippet, prag configurabil `min_engagement_seconds`.
- **Analytics — toate rapoartele:** `overview`, `summary`, `timeseries`, `top-pages`, `top-elements`, `breakdown`, `heatmap`, `paths`, `sessions`, `journey`, `engagement`, `scrollmap`, `campaigns`, `snapshot` (create/get/raw/delete).
- **Linkuri & QR:** listă/creare/detalii/editare/ștergere, `overview` agregat, `qr.png` / `qr.svg`, `stats`. Slug permanent, destinație editabilă, `kind` (link/qr), `logo_image_id`.
- **Galerie:** upload multipart, listare cu cotă (25 MB), raw, ștergere; QR cu logo folosește corecție de eroare ridicată.
- **Pixel:** `/px/t.js` servit + `/px/collect` primește evenimente (pageview, click cu x/y%, scroll, custom, UTM, durată).
- **Redirecturi:** `/l/{slug}` (source=link), `/q/{slug}` (source=qr).
- **Securitate:** middleware `SecurityGuardMiddleware` (blochează SQLi/XSS cu 400), sanitizare `bleach`, ORM parametrizat, rate limiting (slowapi), security headers, hash de IP cu sare separată.

### Frontend
- Toate cele **8 pagini** implementate, **rutare cu guards** (redirect la login + ascundere secțiuni fără permisiune), **lazy-loading**, comutare rapidă între conturi salvate local, heatmap desenat pe canvas cu overlay peste captura paginii.

---

## 🟡 În lucru — detaliat

### Strat AI / CRO (consultant + gardian GDPR)
**Există deja:**
- Config: `ANTHROPIC_API_KEY` și `AI_MODEL` în `config.py`, cu `ai_enabled` (dezactivare grațioasă dacă nu e cheie).
- Prompturi + reguli în `core/app_settings.py`: promptul consultantului CRO, promptul gardianului GDPR, reguli GDPR deterministe, praguri statistice (`min_sessions`, `min_conversions`).
- Router `api/admin_settings.py` (GET/PUT setări) — creat recent, editabile din admin fără redeploy.

**Lipsește:**
- Integrarea reală cu Anthropic (apelul efectiv la model).
- Endpoint-ul de analiză AI (care primește datele agregate și întoarce recomandările).
- Cablarea consultantului în flux (advisor → gardian → verdict).

> Viziunea completă a acestui strat: [AB-MARKETING-AI-VISION.md](AB-MARKETING-AI-VISION.md).

### Pâlnie de conversie (funnel)
- `models/funnel.py` (`funnel_steps`) — model și tabel **definite**.
- **Fără endpoint-uri** — funcționalitatea de pâlnie nu e încă expusă/utilizabilă.

---

## ⚪ Lipsește

- **Teste automate:** 0 teste unitare și 0 e2e în cod (backend și frontend). Singura acoperire e scriptul bash `examples/test_e2e.sh` (~51 de verificări end-to-end). Vezi [operare/02-verificare-si-testare.md](operare/02-verificare-si-testare.md).
- **Migrări reale (Alembic):** schema se creează cu `Base.metadata.create_all` + o listă de `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` idempotente în `main.py`. Funcțional, dar nu e un sistem de migrări versionate.
</content>
