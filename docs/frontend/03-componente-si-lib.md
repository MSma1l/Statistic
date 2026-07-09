# 03 — Componente reutilizabile și modulele `lib/`

> Acest fișier descrie „cutia de unelte" a frontend-ului: componentele din `src/components/`
> (reutilizate de pagini) și modulele din `src/lib/` (logică fără UI — client HTTP, autentificare,
> conturi locale). Include și **observațiile de securitate** reale ale codului.

Paginile care le folosesc sunt în [`02-pagini.md`](02-pagini.md); rutarea în
[`04-rutare-si-permisiuni.md`](04-rutare-si-permisiuni.md).

---

# Partea A — `lib/` (logică fără UI)

## 1. `lib/api.ts` — client HTTP + tipuri

Modulul central: creează instanța axios și definește tipurile partajate.

**Instanța axios.**
```ts
export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export const api = axios.create({ baseURL: API_URL, withCredentials: true });
```
- `withCredentials: true` → trimite și primește **cookie-ul de sesiune** (httpOnly) la fiecare
  cerere. Așa funcționează autentificarea, fără a atinge tokenul din JavaScript.
- Se folosește **`??`** (nu `||`) intenționat: un string **gol** e valid și înseamnă
  „same-origin" (cereri relative `/api/...`, rezolvate de reverse-proxy în producție). Doar
  variabila **nesetată** (`undefined`) cade pe fallback-ul local `http://localhost:8000`.
- `API_URL` e exportat și folosit direct pentru URL-uri de imagini/blob-uri care nu trec prin
  axios (ex. `<img src={`${API_URL}/api/gallery/{id}/raw`}>` în Gallery/Links/LinkDetail).

**Tipurile exportate** (interfețe TypeScript folosite în tot codul):

| Tip | Rol / câmpuri cheie |
|-----|---------------------|
| `User` | `id, email, full_name, is_admin, can_sites, can_links, can_qr, is_active, created_at` |
| `Site` | `id, site_key, name, domain, min_engagement_seconds, created_at, snippet?` |
| `TrackedLink` | `id, slug, destination_url, name, description, location_label, kind ("link"\|"qr"), logo_image_id, is_active, short_url, qr_url, total_visits` |
| `GalleryImage` | `id, filename, content_type, size_bytes, created_at` |
| `GalleryList` | `images: GalleryImage[], used_bytes, limit_bytes` |

**Helperi de permisiuni** (folosiți de guards și de meniu — vezi
[`04`](04-rutare-si-permisiuni.md)):
```ts
can(user, "sites" | "links" | "qr")  // adminul are TOT; altfel citește câmpul respectiv
canLinksArea(user)                    // true dacă are can_links SAU can_qr (zona Linkuri/QR/Galerie)
```

**Helperi de formatare / erori:**
- `formatBytes(n)` → `"512 B"`, `"1.5 KB"`, `"2.34 MB"`.
- `formatDuration(seconds)` → `"45s"`, `"1m 23s"`, `"2h 5m"`.
- `extractError(err, fallback)` → scoate mesajul din răspunsul FastAPI (`detail` string sau
  primul `detail[].msg` la erorile de validare), altfel returnează `fallback`. Folosit peste tot
  ca să arate erori lizibile în locul unor mesaje generice.

---

## 2. `lib/auth.tsx` — contextul de autentificare

Singurul Context React global. Expune starea de autentificare întregii aplicații.

**`AuthProvider`** (montat în [`main.tsx`](../../frontend/src/main.tsx)) ține:

| Câmp | Tip | Rol |
|------|-----|-----|
| `user` | `User \| null` | userul curent (sau null dacă neautentificat) |
| `loading` | `boolean` | `true` până se verifică sesiunea la pornire |
| `login(email, password)` | `Promise<void>` | `POST /auth/login`, setează `user` |
| `logout()` | `Promise<void>` | `POST /auth/logout`, golește `user` |
| `refresh()` | `Promise<void>` | `GET /auth/me`, resincronizează `user` |

La montare (`useEffect`), `refresh()` cheamă `GET /auth/me`: dacă cookie-ul e valid → `user`
populat; altfel → `null`. `loading` devine `false` la final (indiferent de rezultat) — App
folosește acest flag ca să nu afișeze nimic până nu știe dacă ești logat.

**`useAuth()`** — hook-ul de consum; aruncă eroare dacă e folosit în afara `AuthProvider`.

> `refresh` e util după modificări de permisiuni: readuce câmpurile `can_*` actualizate.

---

## 3. `lib/accounts.ts` — conturi salvate local (OBSERVAȚIE DE SECURITATE)

Gestionează lista de conturi „ținute minte" pentru **login rapid / comutare între conturi**
pe același dispozitiv. Stochează în `localStorage`, cheia `statistic_accounts`, max **10 conturi**.

| Funcție | Efect |
|---------|-------|
| `getSavedAccounts()` | citește lista (array de `{ email, password, name? }`) |
| `saveAccount(acc)` | adaugă/actualizează un cont (deduplică pe email, îl pune primul) |
| `removeAccount(email)` | șterge un cont din listă |

### ⚠️ Riscul de securitate (documentat onest)

Structura `SavedAccount` conține câmpul **`password`**, iar acesta este stocat **în CLAR** în
`localStorage`. Autorul notează explicit riscul într-un comentariu în capul fișierului:

> „Notă de securitate: parola e stocată local în browser. Folosește această opțiune doar pe un
> dispozitiv personal, nu pe unul partajat."

**De ce e o problemă:** `localStorage` e citibil de orice JavaScript rulat pe origine (inclusiv
un eventual XSS) și persistă pe disc necriptat. Cine are acces la browser/profil vede parolele.

**Unde apare în UI:**
- [Login](02-pagini.md#login): bifa „Ține minte acest cont" + lista „Conturi salvate".
- [Layout](#componenta-layouttsx): butonul „Schimbă cont" folosește parola salvată pentru
  re-login silențios.

**Recomandări de îmbunătățire** (nu implementate): a nu stoca parola deloc (doar emailul pentru
autocompletare), sau a folosi un token de „remember-me" revocabil emis de server în loc de parolă.

---

# Partea B — `components/` (piese de UI)

## Componenta `Layout.tsx`

Shell-ul aplicației pentru zona autentificată: **sidebar** (stânga) + zona de conținut cu
`<Outlet />` (unde React Router randează pagina curentă).

- **Meniul** afișează linkurile în funcție de permisiuni (`can`, `canLinksArea`):
  Tablou de bord (mereu) · Site-uri (Pixel) `can_sites` · Linkuri & QR + Galerie
  (`can_links`/`can_qr`) · Utilizatori (`is_admin`). Iconițe din `lucide-react`, stil activ
  prin `NavLink`.
- **Zona de cont** (jos): nume + email, buton **„Schimbă cont"** (apare doar dacă există alte
  conturi salvate) care face re-login prin `login()` cu parola din
  [`accounts.ts`](#3-libaccountsts--conturi-salvate-local-observație-de-securitate); la eșec
  afișează un **`alert()` nativ**. Buton **„Delogare"** → `logout()`.

## Componentele din `ui.tsx`

Piese mici, fără logică de date, folosite peste tot:

| Componentă | Rol |
|-----------|-----|
| `PageHeader` | titlu + subtitlu + slot de acțiune (dreapta) |
| `StatCard` | card de KPI (etichetă + valoare mare + iconiță) |
| `EmptyState` | card centrat pentru „nimic aici încă" |
| `Spinner` | text „Se încarcă…" centrat |
| `CopyButton` | copiază un text în clipboard (`navigator.clipboard`), arată „Copiat!" 1.5s |

## Componenta `HeatmapCanvas.tsx`

Randează un heatmap pe un `<canvas>` din puncte `{ x, y }` (procente 0–100).

**Algoritm:** (1) desenează pentru fiecare punct un gradient radial în alpha (acumulare de
densitate); (2) reparcurge pixelii și recolorează după intensitate cu o **paletă
albastru → verde → galben → roșu** (`palette(t)`), amplificând alpha ×3.5 pentru vizibilitate.
Props: `points`, `width`, `height`, `radius`, `className`. Se re-desenează la orice schimbare
a acestora (`useEffect`).

## Componenta `HeatmapOverlay.tsx`

Suprapune `HeatmapCanvas` **peste pagina reală**, cu două moduri (comutator):

- **Live** — încarcă pagina ta reală într-un `<iframe>` scalat la lățimea containerului. URL-ul
  e editabil și reținut local per (site, pagină) în `localStorage` (`st_preview_url_{id}_{path}`).
  Măsurile de siguranță: `sandbox="allow-scripts allow-same-origin"`, `referrerPolicy="no-referrer"`,
  `pointerEvents: none`; acceptă **doar `http(s)`** în `src` (blochează `javascript:`/`data:`);
  adaugă `?_st_preview=1` ca tracker-ul tău să se dezactiveze pe previzualizare.
- **Imagine** — încarcă o captură (screenshot) a paginii, peste care se desenează heatmap-ul.
  Upload/înlocuire/ștergere prin `POST`/`DELETE /api/analytics/{id}/snapshot?path=…`.

Include o **legendă** (culori → câte click-uri/zonă, cu praguri derivate din densitatea maximă)
și folosește un `ResizeObserver` (hook intern `useElementSize`) pentru scalare responsivă.
Este randat de [SiteDetail](02-pagini.md#sitedetail); primește `data` (punctele) ca prop.

## Componenta `JourneyModal.tsx`

Modal care afișează **traseul complet al unui vizitator** dintr-o sesiune, ca timeline vertical.

- Date: `GET /api/analytics/{siteId}/journey?session_id=…` (query `["journey", siteId, sessionId]`).
- Fiecare eveniment e „tradus" în limbaj de marketing prin `describe()`, cu iconiță și text:
  `pageview` → „A vizitat …", `click` → „A dat click pe …", `scroll` → „A derulat până la N%",
  `engagement` → „A stat Xm Ys pe …", altele → „Eveniment …".
- Se deschide din tabelul de sesiuni al [SiteDetail](02-pagini.md#sitedetail) (click pe o linie),
  se închide pe click în fundal sau pe „X".
</content>
