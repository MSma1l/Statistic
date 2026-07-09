# 03 — Referință API

> Referință completă a endpoint-urilor backend, grupate pe module. Pentru fiecare: metodă, rută, ce cere, ce returnează, permisiunea necesară și rate-limit-ul (unde există). Documentația interactivă live: `{BASE_URL}/docs`.

Vezi și: [model de date](02-model-de-date.md) · [securitate](04-securitate.md) · [strat AI/CRO](05-strat-ai-cro.md).

---

## Convenții

- **Autentificare:** prin cookie httpOnly `statistic_token` (JWT). Dependența `get_current_user` returnează 401 dacă lipsește/e invalid.
- **Permisiuni** (`app/api/deps.py`):
  - `require_admin` — doar admin (403 altfel).
  - `require_cap("sites"|"links"|"qr")` — capabilitatea respectivă (adminul le are pe toate).
  - `require_links_area` — cel puțin una dintre `links` sau `qr`.
- **Parametrul `days`** (rapoarte): întreg, `1..365`, default `30`.
- **Owner-scoping:** toate resursele sunt filtrate pe `owner_id == user.id`; accesul la o resursă străină întoarce **404** (nu 403, ca să nu dezvăluie existența).
- Total: **~49 endpoint-uri** în 9 module.

---

## 1. Auth — `/auth` (`api/auth.py`)

| Metodă | Rută | Cere | Returnează | Permisiune | Note |
|--------|------|------|------------|------------|------|
| POST | `/auth/login` | `LoginRequest` `{email, password}` | `UserOut` + setează cookie-ul | public | **Rate limit 10/min**. Timing-safe (verifică un hash-momeală când user-ul nu există). |
| POST | `/auth/logout` | — | `{detail}` + șterge cookie-ul | autentificat implicit (șterge cookie-ul) | — |
| GET | `/auth/me` | — | `UserOut` | autentificat | Cine sunt eu. |
| GET | `/auth/users` | — | `list[UserOut]` | admin | Listă utilizatori. |
| POST | `/auth/users` | `UserCreate` | `UserOut` (201) | admin | 409 dacă email-ul există. |
| PATCH | `/auth/users/{user_id}` | `UserPermissionsUpdate` | `UserOut` | admin | 400 dacă adminul își retrage propriile drepturi; 404 dacă user inexistent. |
| DELETE | `/auth/users/{user_id}` | — | 204 | admin | 400 la ștergerea propriului cont; 404 dacă inexistent. |

**`LoginRequest`:** `email` (str, 3–255), `password` (str, 1–128).
**`UserCreate`:** `email` (EmailStr), `full_name` (≤255), `password` (6–128), `is_admin`, `can_sites`, `can_links`, `can_qr` (bool, default `true` pentru capabilități).
**`UserPermissionsUpdate`:** toate opționale — `is_admin`, `can_sites`, `can_links`, `can_qr`, `is_active`.
**`UserOut`:** `id, email, full_name, is_admin, can_sites, can_links, can_qr, is_active, created_at`.

---

## 2. Sites — `/api/sites` (`api/sites.py`)

Router protejat global cu `require_cap("sites")`.

| Metodă | Rută | Cere | Returnează | Permisiune |
|--------|------|------|------------|------------|
| GET | `/api/sites` | — | `list[SiteOut]` | cap. `sites` |
| POST | `/api/sites` | `SiteCreate` `{name, domain?}` | `SiteWithSnippet` (201) | cap. `sites` |
| GET | `/api/sites/{site_id}` | — | `SiteWithSnippet` | cap. `sites` (owner) |
| PATCH | `/api/sites/{site_id}` | `SiteUpdate` | `SiteOut` | cap. `sites` (owner) |
| DELETE | `/api/sites/{site_id}` | — | 204 | cap. `sites` (owner) |

**`SiteCreate`:** `name` (1–255), `domain` (≤255, default `""`).
**`SiteUpdate`:** `name?`, `domain?`, `min_engagement_seconds?` (int, 0–600).
**`SiteOut`:** `id, site_key, name, domain, min_engagement_seconds, created_at`.
**`SiteWithSnippet`:** `SiteOut` + `snippet` (tag-ul `<script>` gata de copiat, folosind `public_url`).
Numele/domeniul sunt trecute prin `clean_text` (bleach) la creare/editare.

---

## 3. Analytics — `/api/analytics` (`api/analytics.py`)

Router protejat global cu `require_cap("sites")`. Toate rutele `/{site_id}/…` verifică proprietatea (404 altfel). Modulul cel mai mare.

### Agregate & rapoarte

| Metodă | Rută | Parametri | Returnează |
|--------|------|-----------|------------|
| GET | `/api/analytics/overview` | `days` | Agregat peste TOATE site-urile userului: `sites_count, pageviews, clicks, visitors, sessions, top_sites[], top_pages[], timeseries[]`. |
| GET | `/api/analytics/{site_id}/summary` | `days` | KPI per site: `pageviews, clicks, visitors, sessions, avg_seconds, bounce_rate, days`. Bounce & timp mediu sunt engagement-aware (folosesc `min_engagement_seconds`). |
| GET | `/api/analytics/{site_id}/timeseries` | `days` | `[{day, pageviews, clicks}]` (pe zi). |
| GET | `/api/analytics/{site_id}/top-pages` | `days`, `limit` (1–50, def. 10) | `[{path, views}]`. |
| GET | `/api/analytics/{site_id}/top-elements` | `days`, `limit` (1–50, def. 10) | `[{selector, text, clicks}]` (cele mai apăsate elemente). |
| GET | `/api/analytics/{site_id}/breakdown` | `days` | `{referrers[], devices[]}`. |
| GET | `/api/analytics/{site_id}/heatmap` | `path` (obligatoriu, ≤1024), `days` | `{path, points[{x,y}], count, doc_w, doc_h}` (max 5000 puncte). |
| GET | `/api/analytics/{site_id}/paths` | `days` | `[{path, clicks}]` — paginile cu cel puțin un click (selector heatmap). |
| GET | `/api/analytics/{site_id}/sessions` | `days`, `limit` (1–200, def. 50) | Sesiuni recente cu rezumat: `session_id, visitor_id, first_seen, last_seen, duration_s, active_s, pageviews, clicks, device, landing, referrer, utm_source, utm_campaign`. |
| GET | `/api/analytics/{site_id}/journey` | `session_id` (obligatoriu, ≤64) | Traseul cronologic al unei sesiuni: `[{at, type, path, text, selector, scroll_depth, duration_s, referrer, props}]` (max 2000). |
| GET | `/api/analytics/{site_id}/engagement` | `days`, `limit` (1–100, def. 15) | Per pagină: `[{path, views, avg_seconds}]`. |
| GET | `/api/analytics/{site_id}/scrollmap` | `path` (obligatoriu), `days` | `{path, base_sessions, curve:[{depth, sessions, pct}]}` pentru 25/50/75/100%. |
| GET | `/api/analytics/{site_id}/campaigns` | `days`, `limit` (1–100, def. 20) | Breakdown UTM: `[{source, medium, campaign, sessions, pageviews}]`. |

### Captură pagină (fundal heatmap) — `/{site_id}/snapshot`

| Metodă | Rută | Cere | Returnează |
|--------|------|------|------------|
| POST | `/api/analytics/{site_id}/snapshot` | `path` (query), `file` (multipart) | `{has, size_bytes, content_type}`. Upsert (înlocuiește captura veche a paginii). Doar PNG/JPEG/WEBP, max 8 MB. |
| GET | `/api/analytics/{site_id}/snapshot` | `path` (query) | `{has}` sau `{has, content_type, size_bytes, created_at}`. |
| GET | `/api/analytics/{site_id}/snapshot/raw` | `path` (query) | Imaginea (bytes); 404 dacă nu există. |
| DELETE | `/api/analytics/{site_id}/snapshot` | `path` (query) | 204. |

---

## 4. Admin-settings — `/api/admin/settings` (`api/admin_settings.py`)

Router protejat global cu `require_admin`. Expune setările globale editabile (tabela `app_settings`). Detalii despre chei/valori în [05-strat-ai-cro.md](05-strat-ai-cro.md).

| Metodă | Rută | Cere | Returnează | Permisiune |
|--------|------|------|------------|------------|
| GET | `/api/admin/settings` | — | `list[dict]` — toate cheile cunoscute cu valoarea efectivă (DB sau default) + `{key, value, kind, description, is_default, updated_at}`. | admin |
| PUT | `/api/admin/settings/{key}` | `{value}` (text/număr/listă) | 204 | admin. 404 dacă `key` e necunoscută. |

---

## 5. Links — `/api/links` (`api/links.py`)

Router protejat global cu `require_links_area`. Filtrarea per tip respectă capabilitățile: cine are doar `qr` vede/creează doar `kind="qr"` etc.

| Metodă | Rută | Cere / Parametri | Returnează | Permisiune |
|--------|------|------------------|------------|------------|
| GET | `/api/links` | — | `list[LinkWithUrls]` (cu `total_visits`) | zona links/qr, filtrat pe tip |
| POST | `/api/links` | `LinkCreate` | `LinkWithUrls` (201) | tip verificat: `qr`→cap.qr, `link`→cap.links; 409 slug duplicat |
| GET | `/api/links/overview` | `days` | Agregat: `links_count, total, scans, clicks, top_links[], top_qr[], by_location[], timeseries[]` | zona links/qr |
| GET | `/api/links/{link_id}` | — | `LinkWithUrls` | owner + tip permis |
| PATCH | `/api/links/{link_id}` | `LinkUpdate` | `LinkWithUrls` | owner |
| DELETE | `/api/links/{link_id}` | — | 204 | owner |
| GET | `/api/links/{link_id}/qr.png` | — | Imagine PNG (cu logo dacă e setat) | owner |
| GET | `/api/links/{link_id}/qr.svg` | — | Imagine SVG (vectorial, logo încorporat) | owner |
| GET | `/api/links/{link_id}/stats` | `days` | `{total, scans, clicks, timeseries[], devices[], referrers[]}` | owner |

**`LinkCreate`:** `slug` (1–64, regex `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`), `destination_url` (http/https, ≤2048), `name` (≤255), `description` (≤2000), `location_label` (≤255), `kind` (`link`|`qr`, default `link`), `logo_image_id?`.
**`LinkUpdate`:** toate opționale + `clear_logo` (bool → pune logo pe null), `is_active?`.
**`LinkOut`:** `id, slug, destination_url, name, description, location_label, kind, logo_image_id, is_active, created_at`.
**`LinkWithUrls`:** `LinkOut` + `short_url` (`{public_url}/l/{slug}`), `qr_url` (`{BASE_URL}/api/links/{id}/qr.png`), `total_visits`.
Logo-ul e validat că aparține userului; textele trec prin `clean_text`.

---

## 6. Gallery — `/api/gallery` (`api/gallery.py`)

Router protejat global cu `require_links_area`. Cotă totală per utilizator: `GALLERY_MAX_BYTES` (25 MB).

| Metodă | Rută | Cere | Returnează | Permisiune |
|--------|------|------|------------|------------|
| GET | `/api/gallery` | — | `GalleryList` `{images[], used_bytes, limit_bytes}` | zona links/qr |
| POST | `/api/gallery` | `file` (multipart) | `GalleryImageOut` (201) | zona links/qr |
| GET | `/api/gallery/{image_id}/raw` | — | Conținutul imaginii (`Cache-Control: private`) | owner |
| DELETE | `/api/gallery/{image_id}` | — | 204 | owner |

**Validări upload:** content-type trebuie să înceapă cu `image/` (400); fișier gol → 400; depășirea cotei → 413 (cu spațiul rămas); Pillow `verify()` confirmă că e o imagine reală → 400 altfel.
**`GalleryImageOut`:** `id, filename, content_type, size_bytes, created_at` (fără binar).

---

## 7. Collect / Pixel — `/px` (`api/collect.py`)

Public. Prefixul `/px/collect` e „relaxat" în guard (vezi [04-securitate.md](04-securitate.md)).

| Metodă | Rută | Cere | Returnează | Note |
|--------|------|------|------------|------|
| GET | `/px/t.js` | — | Scriptul de tracking (`application/javascript`, `Cache-Control: public, max-age=3600`) | public |
| POST | `/px/collect` | `CollectPayload` (body `text/plain`, parsat manual) | 204 mereu | public. **Rate limit 120/min**. |

**`CollectPayload`:** `site` (site_key, 8–32), `visitor_id` (≤64), `events` (`list[EventIn]`, max 50).
**`EventIn`:** `type`, `path`, `referrer`, `element_selector`, `element_text`, `x_pct`, `y_pct`, `viewport_w/h`, `doc_w` (0–100k), `doc_h` (0–1M), `scroll_depth`, `duration_ms` (0–86.4M), `utm_source/medium/campaign`, `session_id`, `props`.
**Comportament defensiv:** payload invalid → 204 (nu 4xx); site inexistent → 204 (nu dezvăluie); tipurile în afara `{pageview, click, scroll, custom, engagement}` devin `custom`; `element_text` e sanitizat, UTM-urile curățate, `props` plafonate (max 25 chei, 2048 bytes).

---

## 8. Redirect — `/l` și `/q` (`api/redirect.py`)

Public. Înregistrează o `LinkVisit` și face redirect 302.

| Metodă | Rută | Sursă înregistrată | Returnează |
|--------|------|--------------------|------------|
| GET | `/l/{slug}` | `source="link"` (click) | 302 către `destination_url` |
| GET | `/q/{slug}` | `source="qr"` (scanare) | 302 către `destination_url` |

Slug inexistent sau link inactiv → redirect 302 la `/`. IP-ul e stocat doar ca hash (`hash_ip`), device-ul e detectat din user-agent.

---

## 9. Health — `/health` (`main.py`)

| Metodă | Rută | Returnează |
|--------|------|------------|
| GET | `/health` | `{"status": "ok"}` (public, pentru probe/monitorizare) |

---

## Endpoint-uri care NU există (încă)

Deși modelul `funnel_steps` și configurarea AI există, **nu există** endpoint-uri pentru funnels (CRUD trepte) sau pentru analiza AI/CRO. Detalii și ce lipsește în [05-strat-ai-cro.md](05-strat-ai-cro.md).
