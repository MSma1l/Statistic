# 02 — Modelul de date

> Cele 9 tabele ORM (`app/models/`) câmp cu câmp, relațiile, indexurile și lista migrărilor idempotente rulate la pornire din `main.py`. Toate modelele moștenesc `Base` (declarativă, din `app/database.py`).

Vezi și: [stack & config](01-stack-si-config.md) · [endpoint-uri](03-api-endpoints.md) · [strat AI/CRO](05-strat-ai-cro.md).

---

## Diagrama relațiilor

```
users ──┬──< sites ──┬──< events                 (evenimente pixel)
        │            ├──< page_snapshots          (capturi de pagină pt. heatmap)
        │            └──< funnel_steps            (trepte de conversie definite)
        │
        ├──< tracked_links ──< link_visits        (click-uri / scanări QR)
        │        └── logo_image_id ─► gallery_images (SET NULL)
        │
        └──< gallery_images                        (imagini personale; logo QR)

app_settings   (tabel independent cheie→valoare JSON, setări globale de admin)
```

`< ` = relație unu-la-mulți. Toate FK-urile către `users` și `sites` folosesc `ON DELETE CASCADE`; `logo_image_id` folosește `ON DELETE SET NULL` (ștergerea unui logo nu strică linkul).

---

## 1. `users` — conturi (`models/user.py`)

Conturi pe invitație (fără signup public). Adminul are implicit toate capabilitățile.

| Câmp | Tip | Constrângeri / default | Rol |
|------|-----|------------------------|-----|
| `id` | int | PK | Identificator. |
| `email` | str(255) | unic, indexat, not null | Login-ul (stocat lowercase). |
| `full_name` | str(255) | not null, default `""` | Nume afișat. |
| `password_hash` | str(255) | not null | Hash argon2 (nu se stochează parola în clar). |
| `is_admin` | bool | not null, default `false` | Drepturi de admin (toate capabilitățile + gestiune utilizatori & setări). |
| `can_sites` | bool | not null, default `true` | Capabilitate: zona Site-uri / Pixel. |
| `can_links` | bool | not null, default `true` | Capabilitate: linkuri scurte. |
| `can_qr` | bool | not null, default `true` | Capabilitate: QR coduri. |
| `is_active` | bool | not null, default `true` | Cont activ (inactiv → login/refuz 401/403). |
| `created_at` | datetime(tz) | not null, `server_default=now()` | Data creării. |

**Relații:** `sites` (1-N, cascade delete-orphan), `links` (1-N, cascade delete-orphan).

---

## 2. `sites` — site-uri urmărite (`models/site.py`)

| Câmp | Tip | Constrângeri / default | Rol |
|------|-----|------------------------|-----|
| `id` | int | PK | Identificator. |
| `site_key` | str(32) | unic, indexat, not null, default = `uuid4().hex` | Cheia publică de scriere din snippet (`data-site`). |
| `name` | str(255) | not null | Numele site-ului. |
| `domain` | str(255) | not null, default `""` | Domeniul (informativ). |
| `min_engagement_seconds` | int | not null, default `5` | Pragul de „atenție reală": vizitele sub atâtea secunde active nu se numără la timp mediu/engagement/bounce. Aplicat la interogare → retroactiv. |
| `owner_id` | int | FK `users.id` ON DELETE CASCADE, indexat, not null | Proprietarul. |
| `created_at` | datetime(tz) | not null, `server_default=now()` | Data creării. |

**Relații:** `owner` (N-1 spre `users`), `events` (1-N, cascade delete-orphan).

---

## 3. `events` — evenimente pixel (`models/event.py`)

Un rând per eveniment trimis de tracker: `pageview` / `click` / `scroll` / `custom` / `engagement`.

| Câmp | Tip | Constrângeri / default | Rol |
|------|-----|------------------------|-----|
| `id` | int | PK | Identificator. |
| `site_id` | int | FK `sites.id` ON DELETE CASCADE, indexat, not null | Site-ul sursă. |
| `type` | str(32) | not null | Tipul evenimentului. |
| `path` | str(1024) | not null, default `""` | Pathname-ul paginii (fără query). |
| `referrer` | str(1024) | not null, default `""` | Referrer-ul. |
| `element_selector` | str(512) | not null, default `""` | Selector CSS al elementului apăsat (click). Pentru `custom` NUMELE eventului ajunge în `element_text`. |
| `element_text` | Text | not null, default `""` | Textul elementului apăsat / numele eventului custom. |
| `x_pct` | float | nullable | Poziția X a click-ului, % din lățimea documentului (heatmap). |
| `y_pct` | float | nullable | Poziția Y a click-ului, % din înălțime (heatmap). |
| `viewport_w` | int | nullable | Lățimea viewport-ului. |
| `viewport_h` | int | nullable | Înălțimea viewport-ului. |
| `doc_w` | int | nullable | Lățimea completă a documentului la click (aliniere heatmap). |
| `doc_h` | int | nullable | Înălțimea completă a documentului la click. |
| `scroll_depth` | int | nullable | Adâncimea scroll (25/50/75/100) sau scroll-ul MAXIM la `engagement`. |
| `duration_ms` | int | nullable | Timpul ACTIV petrecut pe pagină (ms), trimis cu `engagement`. |
| `utm_source` | str(128) | nullable | Atribuire campanie (UTM). |
| `utm_medium` | str(128) | nullable | Atribuire campanie (UTM). |
| `utm_campaign` | str(128) | nullable | Atribuire campanie (UTM). |
| `visitor_id` | str(64) | not null, default `""`, indexat | Identitate anonimă persistentă (localStorage). |
| `session_id` | str(64) | not null, default `""` | Sesiune anonimă (sessionStorage). |
| `user_agent` | str(512) | not null, default `""` | User-agent-ul brut. |
| `device_type` | str(32) | not null, default `""` | `desktop` / `mobile` / `tablet` / `bot` / `unknown`. |
| `props` | JSONB | nullable | Proprietăți libere (eventuri custom; sanitizate & plafonate la ingestie). |
| `created_at` | datetime(tz) | not null, `server_default=now()`, indexat | Momentul evenimentului. |

**Indexuri (`__table_args__`):**

| Index | Coloane | Scop |
|-------|---------|------|
| `ix_events_site_created` | `site_id, created_at` | Filtrare pe site + interval. |
| `ix_events_site_path` | `site_id, path` | Rapoarte pe pagină. |
| `ix_events_site_type` | `site_id, type` | Filtrare pe tip. |
| `ix_events_site_type_created` | `site_id, type, created_at` | Index principal — acoperă filtrul comun tuturor rapoartelor. |
| `ix_events_site_visitor_created` | `site_id, visitor_id, created_at` | Reconstrucția traseului unui vizitator. |
| `ix_events_site_session` | `site_id, session_id` | Reconstrucția sesiunilor. |

---

## 4. `tracked_links` — linkuri scurte / QR (`models/link.py`)

Slug permanent + destinație editabilă („QR pe viață").

| Câmp | Tip | Constrângeri / default | Rol |
|------|-----|------------------------|-----|
| `id` | int | PK | Identificator. |
| `slug` | str(64) | unic, indexat, not null | Slug permanent (validat: litere mici, cifre, liniuțe). |
| `destination_url` | str(2048) | not null | Destinația redirect-ului (http/https). |
| `name` | str(255) | not null, default `""` | Nume. |
| `description` | Text | not null, default `""` | Descriere. |
| `location_label` | str(255) | not null, default `""` | Unde e plasat (ex. „Afiș stație"). |
| `kind` | str(16) | not null, default `link` | `link` sau `qr` (organizatoric; ambele au și link, și QR). |
| `logo_image_id` | int | FK `gallery_images.id` ON DELETE SET NULL, nullable | Logo opțional în centrul QR-ului. |
| `is_active` | bool | not null, default `true` | Activ/inactiv (inactiv → redirect la `/`). |
| `owner_id` | int | FK `users.id` ON DELETE CASCADE, indexat, not null | Proprietarul. |
| `created_at` | datetime(tz) | not null, `server_default=now()` | Data creării. |

**Relații:** `owner` (N-1), `visits` (1-N, cascade delete-orphan).

---

## 5. `link_visits` — intrări pe linkuri (`models/link.py`)

| Câmp | Tip | Constrângeri / default | Rol |
|------|-----|------------------------|-----|
| `id` | int | PK | Identificator. |
| `link_id` | int | FK `tracked_links.id` ON DELETE CASCADE, indexat, not null | Linkul vizitat. |
| `source` | str(16) | not null, default `link` | `link` (click) sau `qr` (scanare). |
| `referrer` | str(1024) | not null, default `""` | Referrer. |
| `user_agent` | str(512) | not null, default `""` | User-agent brut. |
| `device_type` | str(32) | not null, default `""` | Tip device. |
| `ip_hash` | str(64) | not null, default `""` | IP-ul stocat DOAR ca hash SHA-256 trunchiat (fără PII brut). |
| `created_at` | datetime(tz) | not null, `server_default=now()`, indexat | Momentul vizitei. |

**Index:** `ix_visits_link_created` (`link_id, created_at`).

---

## 6. `gallery_images` — imagini personale / logo QR (`models/gallery.py`)

Binarul e stocat direct în DB (`LargeBinary`).

| Câmp | Tip | Constrângeri / default | Rol |
|------|-----|------------------------|-----|
| `id` | int | PK | Identificator. |
| `owner_id` | int | FK `users.id` ON DELETE CASCADE, indexat, not null | Proprietarul. |
| `filename` | str(255) | not null, default `""` | Numele fișierului. |
| `content_type` | str(64) | not null, default `image/png` | MIME. |
| `size_bytes` | int | not null, default `0` | Mărimea (pentru cota de 25 MB/utilizator). |
| `data` | LargeBinary | not null | Conținutul binar al imaginii. |
| `created_at` | datetime(tz) | not null, `server_default=now()` | Data încărcării. |

---

## 7. `page_snapshots` — capturi de pagină pentru heatmap (`models/snapshot.py`)

O singură captură per `(site, path)` — se înlocuiește la reîncărcare.

| Câmp | Tip | Constrângeri / default | Rol |
|------|-----|------------------------|-----|
| `id` | int | PK | Identificator. |
| `site_id` | int | FK `sites.id` ON DELETE CASCADE, indexat, not null | Site-ul. |
| `path` | str(1024) | not null, default `""` | Pagina capturată. |
| `content_type` | str(64) | not null, default `image/png` | MIME (PNG/JPEG/WEBP). |
| `width` | int | nullable | Lățimea imaginii. |
| `height` | int | nullable | Înălțimea imaginii. |
| `size_bytes` | int | not null, default `0` | Mărimea. |
| `data` | LargeBinary | not null | Conținutul binar. |
| `created_at` | datetime(tz) | not null, `server_default=now()` | Data încărcării. |

**Constrângere:** `uq_snapshot_site_path` — unic pe `(site_id, path)`.

---

## 8. `funnel_steps` — trepte de conversie (`models/funnel.py`)

Modelează pâlnia de conversie per site (număr variabil de trepte). **Modelul există, dar nu are încă niciun endpoint** — vezi [05-strat-ai-cro.md](05-strat-ai-cro.md).

| Câmp | Tip | Constrângeri / default | Rol |
|------|-----|------------------------|-----|
| `id` | int | PK | Identificator. |
| `site_id` | int | FK `sites.id` ON DELETE CASCADE, indexat, not null | Site-ul. |
| `position` | int | not null, default `0` | Ordinea treptei în pâlnie. |
| `kind` | str(16) | not null, default `page` | `page` (atingerea unui path) sau `custom_event` (un event `window.statistic`). |
| `value` | str(1024) | not null, default `""` | Pentru `page`: path-ul; pentru `custom_event`: numele eventului (se potrivește pe `Event.element_text`). |
| `label` | str(255) | not null, default `""` | Etichetă afișată. |
| `is_conversion` | bool | not null, default `false`, `server_default="false"` | Marchează treptele care înseamnă „conversie finală". |
| `created_at` | datetime(tz) | not null, `server_default=now()` | Data creării. |

**Relație:** `site` (N-1).

---

## 9. `app_settings` — setări globale de admin (`models/setting.py`)

Tabel independent cheie→valoare JSON (schema setărilor e definită în cod, în `core/app_settings.py`). Motivul: prompturile AI, regulile GDPR și pragurile trebuie editabile din browser, fără redeploy.

| Câmp | Tip | Constrângeri / default | Rol |
|------|-----|------------------------|-----|
| `key` | str(128) | PK | Cheia setării (ex. `ai.advisor_prompt`). |
| `value` | Text | not null, default `""` | Valoarea serializată JSON (text/număr/listă). |
| `updated_at` | datetime(tz) | not null, `server_default=now()`, `onupdate=now()` | Ultima modificare. |

> Dacă nu există rând pentru o cheie, se folosește default-ul din cod (`DEFAULTS` din `core/app_settings.py`). Cheile necunoscute sunt respinse.

---

## Migrări idempotente

Nu există **Alembic**. La pornire, în `lifespan` (`app/main.py`):

1. `Base.metadata.create_all` creează tabelele care lipsesc.
2. Se rulează, în ordine, lista `_MIGRATIONS` — instrucțiuni `ALTER TABLE ... IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, care adaugă coloane/indexuri apărute ulterior **fără a pierde date** (rularea repetată e sigură).
3. `seed_admin()` creează admin-ul inițial dacă nu există niciun utilizator.

Lista curentă din `main.py`:

| # | Instrucțiune | Ce adaugă |
|---|--------------|-----------|
| 1 | `ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'link'` | Tipul link/QR. |
| 2 | `ALTER TABLE tracked_links ADD COLUMN IF NOT EXISTS logo_image_id INTEGER REFERENCES gallery_images(id) ON DELETE SET NULL` | Logo QR. |
| 3 | `ALTER TABLE users ADD COLUMN IF NOT EXISTS can_sites BOOLEAN NOT NULL DEFAULT true` | Permisiune site-uri. |
| 4 | `ALTER TABLE users ADD COLUMN IF NOT EXISTS can_links BOOLEAN NOT NULL DEFAULT true` | Permisiune linkuri. |
| 5 | `ALTER TABLE users ADD COLUMN IF NOT EXISTS can_qr BOOLEAN NOT NULL DEFAULT true` | Permisiune QR. |
| 6 | `ALTER TABLE events ADD COLUMN IF NOT EXISTS duration_ms INTEGER` | Timp activ pe pagină. |
| 7 | `ALTER TABLE events ADD COLUMN IF NOT EXISTS utm_source VARCHAR(128)` | Atribuire UTM. |
| 8 | `ALTER TABLE events ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(128)` | Atribuire UTM. |
| 9 | `ALTER TABLE events ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(128)` | Atribuire UTM. |
| 10 | `CREATE INDEX IF NOT EXISTS ix_events_site_visitor_created ON events (site_id, visitor_id, created_at)` | Traseu vizitator. |
| 11 | `CREATE INDEX IF NOT EXISTS ix_events_site_session ON events (site_id, session_id)` | Sesiuni. |
| 12 | `ALTER TABLE sites ADD COLUMN IF NOT EXISTS min_engagement_seconds INTEGER NOT NULL DEFAULT 5` | Prag engagement. |
| 13 | `ALTER TABLE events ADD COLUMN IF NOT EXISTS doc_w INTEGER` | Lățime document (heatmap). |
| 14 | `ALTER TABLE events ADD COLUMN IF NOT EXISTS doc_h INTEGER` | Înălțime document (heatmap). |
| 15 | `CREATE INDEX IF NOT EXISTS ix_events_site_type_created ON events (site_id, type, created_at)` | Index principal al rapoartelor. |

> Tabelele `funnel_steps` și `app_settings` sunt create direct de `create_all` (nu prin ALTER), fiind modele complete.
