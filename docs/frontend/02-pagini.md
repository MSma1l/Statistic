# 02 — Paginile aplicației (`src/pages/`)

> Fiecare pagină din `src/pages/` corespunde unei rute și unui ecran. Pentru fiecare descriem:
> **ce afișează**, **ce date cere de la API** (endpoint-urile) și **ce acțiuni permite**.

Rutele și guard-urile care controlează accesul la aceste pagini sunt descrise separat în
[`04-rutare-si-permisiuni.md`](04-rutare-si-permisiuni.md). Componentele folosite (StatCard,
HeatmapOverlay, JourneyModal etc.) sunt în [`03-componente-si-lib.md`](03-componente-si-lib.md).

Legendă coloană „Metodă → endpoint": toate cererile trec prin instanța axios din
[`lib/api.ts`](03-componente-si-lib.md#1-libapits--client-http--tipuri) (cu cookie de sesiune).

---

## Harta paginilor

| Pagină | Rută | Acces | Complexitate |
|--------|------|-------|--------------|
| [Login](#login) | `/login` | public | mică |
| [Dashboard](#dashboard) | `/` | orice user logat | medie |
| [Sites](#sites) | `/sites` | `can_sites` | mică |
| [SiteDetail](#sitedetail) | `/sites/:id` | `can_sites` | **mare (~626 linii)** |
| [Links](#links) | `/links` | `can_links` sau `can_qr` | medie |
| [LinkDetail](#linkdetail) | `/links/:id` | `can_links` sau `can_qr` | medie |
| [Gallery](#gallery) | `/gallery` | `can_links` sau `can_qr` | mică |
| [Settings](#settings) | `/settings` | `is_admin` | medie |

---

## Login

Fișier: `src/pages/Login.tsx` · Rută: `/login` (singura rută publică).

**Ce afișează.** Un card centrat cu logo-ul „Statistic", formular email + parolă și o bifă
„Ține minte acest cont pe acest dispozitiv". Dacă există conturi salvate local, apare deasupra
o listă de **„Conturi salvate"** cu buton de login-cu-un-click pentru fiecare și un „X" de uitare.

**Date / acțiuni.**
- Login prin `login()` din [`useAuth`](03-componente-si-lib.md#3-libauthtsx--contextul-de-autentificare)
  → `POST /auth/login` (setează cookie httpOnly).
- Dacă bifa „ține minte" e activă, la succes salvează contul (email + parolă) local prin
  `saveAccount()` din [`accounts.ts`](03-componente-si-lib.md#4-libaccountsts--conturi-salvate-local-observație-de-securitate).
- Conturile salvate sunt citite cu `getSavedAccounts()`, șterse cu `removeAccount()`.
- Erorile se afișează inline (card roșu) prin `extractError()`.

> Observație de securitate: parolele conturilor „ținute minte" se stochează **în clar** în
> `localStorage`. Detalii și riscuri în
> [`03`](03-componente-si-lib.md#4-libaccountsts--conturi-salvate-local-observație-de-securitate).

---

## Dashboard

Fișier: `src/pages/Dashboard.tsx` · Rută: `/` · Acces: orice utilizator logat.

**Ce afișează.** Privire de ansamblu pe **ultimele 30 de zile**, împărțită în două taburi
(afișate doar cele la care userul are acces):

### Tab „Pixel" (necesită `can_sites`)
- 4 carduri KPI: **Site-uri, Vizualizări, Vizitatori unici, Click-uri**.
- Grafic de arie **„Trafic în timp"** (vizualizări + click-uri, Recharts `AreaChart`).
- **Site-uri de top** (listă clicabilă). Apăsând un site, în cardul din dreapta apar
  **Paginile de top** ale acelui site + un buton mare „Vezi toată statistica site-ului"
  care duce la [SiteDetail](#sitedetail).

### Tab „Linkuri & QR" (necesită `can_links` sau `can_qr`)
- 4 carduri KPI: **Linkuri & QR, Total intrări, Click-uri link, Scanări QR**.
- Grafic de arie **„Intrări pe linkuri (în timp)"**.
- Două liste: **Top Linkuri** și **Top QR coduri** (clicabile → LinkDetail).
- **„Unde s-au deschis cel mai mult"** — clasament după locație (`RankList` cu bare).

**Date (React Query).**

| Query | Endpoint | Condiție |
|-------|----------|----------|
| `pixel-overview` | `GET /api/analytics/overview?days=30` | `can_sites` |
| `sites` | `GET /api/sites` | `can_sites` (fallback pentru numărul de site-uri) |
| `links-overview` | `GET /api/links/overview?days=30` | `can_links` sau `can_qr` |
| `site-top-pages` | `GET /api/analytics/{id}/top-pages?days=30` | doar după selectarea unui site |

Tabul activ inițial e „pixel" dacă userul are `can_sites`, altfel „links". Dacă are o singură
zonă, comutatorul de taburi nu apare.

---

## Sites

Fișier: `src/pages/Sites.tsx` · Rută: `/sites` · Acces: `can_sites`.

**Ce afișează.** Lista site-urilor urmărite, ca grid de carduri (nume, domeniu, primele
caractere din `site_key`). Fiecare card e link către [SiteDetail](#sitedetail). Dacă nu există
site-uri, un `EmptyState`.

**Acțiuni.** Butonul „Site nou" deschide un formular inline (Nume obligatoriu, Domeniu opțional)
→ `POST /api/sites`. La succes invalidează cache-ul `["sites"]` și închide formularul.

**Date.** `GET /api/sites` (query `["sites"]`).

---

## SiteDetail

Fișier: `src/pages/SiteDetail.tsx` · Rută: `/sites/:id` · Acces: `can_sites`.
**Cea mai complexă pagină** (~626 linii). Agregă ~10 endpoint-uri de analytics pentru un site.

**Selector de interval.** Buton-grup **7 / 30 / 90 zile** (`days`, implicit 30) — parametru
`?days=` trimis la aproape toate query-urile de mai jos; schimbarea lui reîncarcă totul.

**Structura ecranului (de sus în jos):**

1. **Antet + editare inline** — nume, domeniu și **„Prag atenție (sec)"** (`min_engagement_seconds`,
   vizitele sub acest timp activ nu se numără la timpul mediu). Editare prin creion → `PATCH /api/sites/{id}`.
   Buton de **ștergere** (cu `confirm()`) → `DELETE /api/sites/{id}` → revine la `/sites`.
2. **Cod de instalare (snippet)** — `<script>`-ul de pus în `<head>`, cu
   [`CopyButton`](03-componente-si-lib.md#componentele-din-uitsx).
3. **6 carduri KPI** — Vizualizări, Vizitatori unici, Sesiuni, Click-uri, Timp mediu/pagină
   (`formatDuration`), Bounce rate.
4. **Evoluție în timp** — `LineChart` cu vizualizări + click-uri.
5. **Pagini populare** și **Cele mai apăsate elemente** (`RankList` cu bare).
6. **Surse de trafic** (referrers, `RankList`) și **Dispozitive** (`BarChart`).
7. **Sesiuni & vizitatori** — tabel cu o linie per sesiune (când, landing, sursă/UTM, device,
   pagini, click-uri, timp activ). Click pe o linie deschide
   [`JourneyModal`](03-componente-si-lib.md#componenta-journeymodaltsx) — traseul complet al acelui vizitator.
8. **Timp mediu pe pagină** (engagement) și **Campanii (UTM)** — două liste.
9. **Atenție pe pagină (scroll)** — selectezi o pagină → o „curbă" de scroll (`ScrollCurve`)
   care arată câte sesiuni ajung la fiecare adâncime (25/50/75/100%).
10. **Hartă de click-uri (heatmap)** — selectezi o pagină → randează
    [`HeatmapOverlay`](03-componente-si-lib.md#componenta-heatmapoverlaytsx) (heatmap peste pagina reală/captură).

**Date (React Query) — toate cu `?days={days}`:**

| Query | Endpoint | Note |
|-------|----------|------|
| `site` | `GET /api/sites/{id}` | detaliile site-ului + `snippet` |
| `summary` | `GET /api/analytics/{id}/summary` | cele 6 KPI |
| `ts` | `GET /api/analytics/{id}/timeseries` | graficul de evoluție |
| `pages` | `GET /api/analytics/{id}/top-pages` | pagini populare + surse pentru selectorul de scroll |
| `elements` | `GET /api/analytics/{id}/top-elements` | elemente apăsate |
| `breakdown` | `GET /api/analytics/{id}/breakdown` | referrers + devices |
| `paths` | `GET /api/analytics/{id}/paths` | pagini pentru selectorul de heatmap (cu nr. click-uri) |
| `heatmap` | `GET /api/analytics/{id}/heatmap?path=…` | activ doar când e aleasă o pagină |
| `sessions` | `GET /api/analytics/{id}/sessions` | tabelul de sesiuni |
| `engagement` | `GET /api/analytics/{id}/engagement` | timp mediu pe pagină |
| `campaigns` | `GET /api/analytics/{id}/campaigns` | campanii UTM |
| `scrollmap` | `GET /api/analytics/{id}/scrollmap?path=…` | activ doar când e aleasă o pagină |

Query-urile `heatmap` și `scrollmap` folosesc `enabled: !!path` — nu se cheamă până nu selectezi
o pagină, ca să nu se irosească cereri.

---

## Links

Fișier: `src/pages/Links.tsx` · Rută: `/links` · Acces: `can_links` sau `can_qr`.

**Ce afișează.** Lista de linkuri/QR ca rânduri-card: iconiță (QR sau link), nume + slug,
badge de tip (`Link`/`QR`), badge `inactiv` dacă e cazul, URL-ul scurt, destinația, locația,
numărul total de intrări și un [`CopyButton`](03-componente-si-lib.md#componentele-din-uitsx)
pentru link. Fiecare rând duce la [LinkDetail](#linkdetail).

**Acțiuni — formular „Creează".**
- **Tip**: Link scurt / QR cod — dar butoanele de tip sunt filtrate după permisiuni
  (`can_links` arată „link", `can_qr` arată „QR"). Tipul implicit e „link" dacă are `can_links`.
- Câmpuri: **Slug** (obligatoriu, permanent), **Destinație** (obligatoriu), **Nume**, **Locație**.
- Dacă tipul e **QR**, apare un selector de **logo din galerie** (imaginile din
  [Gallery](#gallery); „Fără" = fără logo). Dacă galeria e goală, link către pagina Galerie.
- Trimitere → `POST /api/links` (invalidează `["links"]`).

**Date.** `GET /api/links` (`["links"]`) + `GET /api/gallery` (`["gallery"]`, pentru logo-uri).

---

## LinkDetail

Fișier: `src/pages/LinkDetail.tsx` · Rută: `/links/:id` · Acces: `can_links` sau `can_qr`.

**Ce afișează.**
- Titlu (nume/slug) + URL scurt cu `CopyButton`.
- 3 carduri KPI: **Total intrări, Scanări QR, Click-uri link** (QR și link sunt numărate separat,
  pentru că folosesc rute diferite `/q/` vs `/l/`).
- **Card QR** — imaginea QR mare (`GET /api/links/{id}/qr.png`, cu logo dacă e setat). Butoane:
  **Copiază imaginea** (în clipboard prin `ClipboardItem`; fallback `alert()` dacă browserul
  nu permite), **Descarcă PNG**, **Descarcă SVG** (`GET /api/links/{id}/qr.{png,svg}` ca blob).
- **Card Editează** — nume, locație, destinație (slug-ul rămâne pe viață), descriere, tip
  (Link/QR), bifa **Activ**, selector logo din galerie.
- **Grafic „Intrări în timp"** (`BarChart`).

**Acțiuni / date.**

| Operație | Endpoint | Note |
|----------|----------|------|
| citire link | `GET /api/links/{id}` | populează formularul de editare |
| statistici | `GET /api/links/{id}/stats` | KPI + timeseries |
| galerie | `GET /api/gallery` | pentru selectorul de logo |
| salvare | `PATCH /api/links/{id}` | dacă `logo_image_id === null` trimite `clear_logo: true`, altfel `logo_image_id` |
| ștergere | `DELETE /api/links/{id}` | cu `confirm()`, revine la `/links` |

La salvare, un contor `qrVersion` se incrementează și e adăugat ca `?v=` la URL-ul imaginii QR,
pentru a forța reîncărcarea imaginii (evită cache-ul browserului după schimbarea logo-ului).

---

## Gallery

Fișier: `src/pages/Gallery.tsx` · Rută: `/gallery` · Acces: `can_links` sau `can_qr`.

**Ce afișează.** Imaginile utilizatorului (logo-uri pentru QR), ca grid. Sus, o **bară de
utilizare a spațiului** (`used / limit`, formatat cu `formatBytes`) care devine roșie peste 90%.
**Limită: 25 MB** în total per cont. Dacă e goală, `EmptyState`.

**Acțiuni / date.**
- `GET /api/gallery` → listă + `used_bytes` + `limit_bytes` (`["gallery"]`).
- „Încarcă imagine" → input file ascuns (`accept="image/*"`) → `POST /api/gallery` (multipart).
  Erorile (ex. limită depășită) se afișează prin `extractError`.
- Ștergere per imagine (buton pe hover, cu `confirm()`) → `DELETE /api/gallery/{id}`.
- Fiecare imagine se afișează din `GET /api/gallery/{id}/raw`.

---

## Settings

Fișier: `src/pages/Settings.tsx` · Rută: `/settings` · Acces: `is_admin`. Titlu în UI: **„Utilizatori"**.

**Ce afișează.** Administrarea conturilor (pe invitație — fără înregistrare publică). Listă de
utilizatori cu avatar (scut pentru admin), nume, email și **badge-uri de permisiuni**
(`admin` / `site` / `link` / `QR` / `fără acces`).

**Editor de permisiuni** (`PermissionEditor`, refolosit la creare și editare):
- Rând de **presetări** rapide (butoane): Administrator, Tot (premium), Doar site (pixel),
  Link + QR, Doar QR, Doar Link. Presetul activ e evidențiat.
- Bifaje fine: **Administrator, Site-uri/Pixel, Linkuri, QR coduri**.

**Acțiuni / date.**

| Operație | Endpoint | Note |
|----------|----------|------|
| listă useri | `GET /auth/users` | `["users"]` |
| creare | `POST /auth/users` | email + nume + parolă (min. 6) + permisiuni |
| editare permisiuni | `PATCH /auth/users/{id}` | doar permisiunile |
| ștergere | `DELETE /auth/users/{id}` | cu `confirm()` |

Pe propriul cont (`u.id === me.id`) butoanele de editare/ștergere sunt ascunse (nu te poți edita
sau șterge singur). Permisiunile sunt impuse **și pe server**; vezi
[`04-rutare-si-permisiuni.md`](04-rutare-si-permisiuni.md#sincronizarea-cu-backend-ul).
</content>
