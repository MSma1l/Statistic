# 04 — Rutare, guard-uri și permisiuni

> Cum decide frontend-ul ce pagini montează: fluxul de autentificare, rutele din `App.tsx`,
> guard-urile pe permisiuni, lazy-loading-ul și cum se sincronizează totul cu backend-ul.

Paginile sunt descrise în [`02-pagini.md`](02-pagini.md); contextul de auth și helperii `can`
în [`03-componente-si-lib.md`](03-componente-si-lib.md).

---

## 1. Lanțul de montare (`main.tsx`)

Ordinea provider-elor din [`main.tsx`](../../frontend/src/main.tsx) contează:

```
<React.StrictMode>
  <QueryClientProvider>     ← cache-ul React Query (server-state)
    <BrowserRouter>         ← rutare pe History API
      <AuthProvider>        ← starea de autentificare (user, login, logout)
        <App />             ← decide ce rute există
```

`AuthProvider` e sub `BrowserRouter`, deci componentele de auth pot naviga; și sub
`QueryClientProvider`, deci pot folosi query-uri dacă e nevoie.

---

## 2. Guard-ul de autentificare (`App.tsx`)

`App` citește `{ user, loading }` din `useAuth()` și decide în trei pași:

```
                 ┌─────────────────────────────┐
                 │ loading === true            │  → ecran „Se încarcă…"
                 │ (verific /auth/me la pornire)│    (nu decidem încă)
                 └──────────────┬──────────────┘
                               │ loading false
                 ┌──────────────▼──────────────┐
                 │ user === null                │  → doar /login
                 │ (neautentificat)             │    orice altă rută → redirect /login
                 └──────────────┬──────────────┘
                               │ user prezent
                 ┌──────────────▼──────────────┐
                 │ user autentificat            │  → <Layout/> + rutele permise
                 │                              │    orice rută necunoscută → redirect /
                 └─────────────────────────────┘
```

- **`loading`** previne „licărirea" ecranului de login înainte de a ști dacă sesiunea (cookie-ul)
  e validă. Vine din `refresh()` care cheamă `GET /auth/me` la montarea `AuthProvider`.
- Fără user, singura rută este `/login`; `path="*"` redirecționează acolo.
- Cu user, se montează `Layout` (sidebar + `Outlet`) și, în interiorul lui, rutele **filtrate
  prin permisiuni** (mai jos).

---

## 3. Rutele și guard-urile de permisiuni

Rutele private sunt randate **condiționat** — dacă userul nu are permisiunea, ruta pur și simplu
nu există în arborele React Router:

```tsx
<Route element={<Layout />}>
  <Route path="/" element={<Dashboard />} />                                  {/* mereu */}
  {can(user, "sites")   && <Route path="/sites"      element={<Sites />} />}
  {can(user, "sites")   && <Route path="/sites/:id"  element={<SiteDetail />} />}
  {canLinksArea(user)   && <Route path="/links"      element={<Links />} />}
  {canLinksArea(user)   && <Route path="/links/:id"  element={<LinkDetail />} />}
  {canLinksArea(user)   && <Route path="/gallery"    element={<Gallery />} />}
  {user.is_admin        && <Route path="/settings"   element={<Settings />} />}
  <Route path="*" element={<Navigate to="/" replace />} />
</Route>
```

Tabel rută → permisiune:

| Rută | Pagină | Condiție de montare |
|------|--------|---------------------|
| `/` | Dashboard | oricine e logat |
| `/sites`, `/sites/:id` | Sites, SiteDetail | `can(user, "sites")` |
| `/links`, `/links/:id` | Links, LinkDetail | `canLinksArea(user)` (`can_links` **sau** `can_qr`) |
| `/gallery` | Gallery | `canLinksArea(user)` |
| `/settings` | Settings | `user.is_admin` |
| `*` | — | redirect la `/` |

Helperii `can` și `canLinksArea` sunt definiți în
[`lib/api.ts`](03-componente-si-lib.md#1-libapits--client-http--tipuri). Regula cheie:
**adminul are toate capabilitățile** (`can` returnează `true` pentru admin indiferent de câmpuri).

**Efectul lui `path="*"` → `/`:** dacă un user fără `can_sites` tastează manual `/sites`, ruta nu
există, deci se aplică fallback-ul și e trimis la Dashboard. Astfel, ascunderea din meniu e
dublată de un guard real de rutare — nu poți ajunge pe o pagină interzisă prin URL direct.

---

## 4. Coerența meniu ↔ rute

[`Layout`](03-componente-si-lib.md#componenta-layouttsx) folosește **aceiași helperi**
(`can`, `canLinksArea`, `is_admin`) ca `App.tsx` pentru a decide ce linkuri arată în sidebar.
Astfel meniul și rutele nu pot diverge: ce nu e în meniu nu e nici rută montată, și invers.

---

## 5. Lazy-loading

Toate paginile sunt încărcate leneș cu `React.lazy` + `Suspense` în `App.tsx`:

```tsx
const SiteDetail = lazy(() => import("./pages/SiteDetail"));
// … la fel pentru toate paginile
<Suspense fallback={<Spinner />}> … </Suspense>
```

**De ce:** chunk-ul inițial (login + shell) rămâne mic; paginile grele (mai ales `SiteDetail`,
care aduce Recharts) se descarcă doar când sunt vizitate. Se completează cu `manualChunks` din
[`vite.config.ts`](01-stack-si-structura.md#viteconfigts) care izolează `recharts` și
`react-vendor` în fișiere separate, cache-uibile independent.

Pe durata descărcării unui chunk, `Suspense` afișează `Spinner`. Când `user` e `null`, există un
`Suspense` separat care înconjoară doar ruta de `Login`.

---

## 6. Sincronizarea cu backend-ul

Guard-urile din frontend sunt pentru **experiență** (UI curat), nu pentru securitate. Modelul
real este:

```
Frontend (can/canLinksArea/is_admin)  →  ascunde meniul & rutele  (comoditate)
Backend (dependency de permisiuni)    →  răspunde 403 dacă lipsește dreptul  (securitate reală)
```

- Câmpurile de permisiuni (`is_admin`, `can_sites`, `can_links`, `can_qr`) vin în obiectul
  `User` de la `GET /auth/me` și `POST /auth/login` — aceeași sursă de adevăr ca backend-ul.
- Chiar dacă cineva ar forța o rută sau ar chema direct un endpoint, **backend-ul impune
  permisiunile** și întoarce `403` fără dreptul necesar (vezi
  [`../backend/03-api-endpoints.md`](../backend/03-api-endpoints.md)).
- La schimbarea permisiunilor unui user din [Settings](02-pagini.md#settings), acel user vede
  efectul după un `refresh()` al contextului de auth (sau la următorul login), care re-aduce
  câmpurile `can_*` actualizate. Ascunderea/afișarea meniului și a rutelor se recalculează
  automat, pentru că `App` și `Layout` re-randează când `user` se schimbă.

**Presetările de permisiuni** din UI (Administrator, Tot, Doar site, Link+QR, Doar QR, Doar Link)
sunt doar combinații de bifaje (`can_sites` / `can_links` / `can_qr` / `is_admin`) trimise la
server; câmpurile și impunerea lor sunt descrise în
[`../backend/03-api-endpoints.md`](../backend/03-api-endpoints.md) și
[`../backend/02-model-de-date.md`](../backend/02-model-de-date.md).
</content>
