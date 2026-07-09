# 01 — Stack tehnologic și structura proiectului

> Acest fișier descrie tehnologiile din care e construit frontend-ul, fișierele de
> configurare (Vite, Tailwind, TypeScript, Docker/nginx) și cum e organizat folderul `src/`.

Pentru pagini vezi [`02-pagini.md`](02-pagini.md), pentru componente și `lib/` vezi
[`03-componente-si-lib.md`](03-componente-si-lib.md), pentru rutare vezi
[`04-rutare-si-permisiuni.md`](04-rutare-si-permisiuni.md).

---

## 1. Stack-ul pe scurt

| Domeniu | Tehnologie | Versiune | Rol |
|---------|-----------|----------|-----|
| UI / framework | **React** | 18.3 | biblioteca de componente |
| Limbaj | **TypeScript** | 5.7 | tipare statice peste JavaScript |
| Bundler / dev server | **Vite** | 6.0 | build rapid + hot reload |
| Rutare | **react-router-dom** | 6.28 | rute SPA, lazy-loading, guards |
| Server-state | **@tanstack/react-query** | 5.62 | fetch, cache, invalidare a datelor de la API |
| HTTP client | **axios** | 1.7 | cereri către backend (cu cookie de sesiune) |
| Stilizare | **TailwindCSS** | 3.4 | utilitare CSS + componente `@layer` |
| Grafice | **recharts** | 2.15 | grafice (linie, arie, bare) |
| Iconițe | **lucide-react** | 0.469 | set de iconițe SVG |
| Deploy | **Docker + nginx** | node:20 / nginx:1.27 | build static, servit de nginx |

**Ce NU folosește** (intenționat):
- **Fără Redux / Zustand / Context pentru date de server.** Tot server-state-ul e gestionat
  de React Query. Singurul Context global este cel de autentificare
  ([`AuthProvider`](03-componente-si-lib.md#3-libauthtsx--contextul-de-autentificare)).
- **Fără librărie de UI kit** (MUI, Chakra etc.). Componentele sunt scrise manual cu Tailwind.
- **Fără teste.** Nu există nicio dependență de testare în `package.json` (fără Vitest/Jest/RTL).

---

## 2. Model mental: cum „gândește" aplicația datele

Aproape fiecare pagină urmează același tipar:

```
useQuery(...)  →  axios GET /api/...  →  cache React Query  →  randare
useMutation(...) → axios POST/PATCH/DELETE → onSuccess: invalidateQueries → refetch automat
```

- **Citire** = `useQuery` cu un `queryKey` (cheie de cache) și un `queryFn` (funcția axios).
- **Scriere** = `useMutation`; la succes se cheamă `qc.invalidateQueries(...)` ca datele
  afișate să se reîmprospăteze automat.
- **Stare locală de UI** (formulare, ce tab e activ, ce interval de zile e selectat) = `useState`
  simplu, nu store global.

Configurarea globală a React Query e în [`main.tsx`](../../frontend/src/main.tsx):

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // nu reîncarcă la fiecare revenire în tab
      retry: 1,                    // o singură reîncercare la eroare
      staleTime: 30_000,           // datele rămân „proaspete" 30s (analytics se schimbă lent)
    },
  },
});
```

---

## 3. Fișierele de configurare

### `package.json`
Definește dependențele de mai sus și scripturile:

| Script | Comandă reală | Efect |
|--------|---------------|-------|
| `dev` | `vite` | dev server cu hot reload |
| `build` | `tsc && vite build` | verifică tipurile, apoi generează `dist/` |
| `preview` | `vite preview` | servește local build-ul de producție |

`"type": "module"` → tot proiectul folosește ESM (import/export).

### `vite.config.ts`
- Plugin **`@vitejs/plugin-react`**.
- Dev server pe **port 5173**, `host: true` (accesibil din rețea / container).
- **`manualChunks`** — separă librăriile grele în chunk-uri proprii, pentru cache mai bun
  și un chunk inițial mai mic:
  - `recharts` într-un chunk separat (se descarcă doar când deschizi o pagină cu grafice);
  - `react-vendor` = `react` + `react-dom` + `react-router-dom`.

### `tsconfig.json`
- `strict: true` (tipare stricte), `jsx: "react-jsx"`, target `ES2020`.
- `moduleResolution: "bundler"`, `noEmit: true` (Vite se ocupă de emitere).
- `noUnusedLocals: false` / `noUnusedParameters: false` — variabilele nefolosite nu dau eroare.

### `tailwind.config.js`
- Scanează `index.html` + `src/**/*.{ts,tsx}`.
- Definește paleta **`brand`** (albastru, `50`→`900`, principal `brand-600 = #1f47f5`) —
  folosită peste tot pentru butoane, accente, linkuri, grafice.
- Font principal: **Inter** (încărcat din Google Fonts în `index.html`).

### `src/index.css`
Pe lângă directivele `@tailwind`, definește **clasele de componentă** reutilizate în tot codul,
prin `@layer components`:

| Clasă | Rol |
|-------|-----|
| `.card` | card alb cu colțuri rotunjite, bordură și umbră |
| `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-danger` | variantele de buton |
| `.input` | input/select/textarea standard |
| `.label` | etichetă de formular |

> Când vezi în cod `className="card"` sau `className="btn-primary"`, definiția lor este aici,
> nu în componenta respectivă.

### `index.html`
Punctul de intrare HTML: `<div id="root">` + `preconnect`/`link` către Google Fonts (Inter)
+ `<script type="module" src="/src/main.tsx">`. Limba paginii: `lang="ro"`.

### `src/vite-env.d.ts`
Declară tipul variabilei de mediu `VITE_API_URL` pe `import.meta.env`, ca TypeScript să o
recunoască (vezi [`api.ts`](03-componente-si-lib.md#1-libapits--client-http--tipuri)).

---

## 4. Structura folderului `src/`

```
src/
├── main.tsx              # bootstrap: QueryClient + Router + AuthProvider + <App/>
├── App.tsx               # rutare + guard-uri (auth + permisiuni) + lazy-loading
├── index.css             # Tailwind + clasele de componentă (.card, .btn-*, .input…)
├── vite-env.d.ts         # tipuri pentru import.meta.env
│
├── lib/                  # logică fără UI  → vezi 03-componente-si-lib.md
│   ├── api.ts            #   client axios + tipuri (User, Site, TrackedLink…) + helperi
│   ├── auth.tsx          #   Context de autentificare (AuthProvider, useAuth)
│   └── accounts.ts       #   conturi salvate în localStorage (login rapid / switch)
│
├── components/           # componente reutilizabile  → vezi 03-componente-si-lib.md
│   ├── Layout.tsx        #   shell-ul aplicației (sidebar + Outlet)
│   ├── ui.tsx            #   piese mici (PageHeader, StatCard, EmptyState, Spinner, CopyButton)
│   ├── HeatmapCanvas.tsx #   randare heatmap pe <canvas>
│   ├── HeatmapOverlay.tsx#   heatmap suprapus peste pagina reală (iframe) sau captură
│   └── JourneyModal.tsx  #   modal cu traseul unui vizitator dintr-o sesiune
│
└── pages/                # o pagină per rută  → vezi 02-pagini.md
    ├── Login.tsx
    ├── Dashboard.tsx
    ├── Sites.tsx
    ├── SiteDetail.tsx    # cea mai complexă pagină (~626 linii)
    ├── Links.tsx
    ├── LinkDetail.tsx
    ├── Gallery.tsx
    └── Settings.tsx      # administrare utilizatori (admin)
```

**Nu există** folder `store/` (nu se folosește un state manager global) și nici folder de
teste. Convenția e simplă: `lib/` = logică pură, `components/` = piese reutilizabile,
`pages/` = ecrane legate 1:1 la rute.

---

## 5. Build & deploy

Deploy-ul este un **build multi-stage Docker** (`frontend/Dockerfile`):

```
┌─ Stage 1: build (node:20-alpine) ──────────────┐
│  npm install                                    │
│  npm run build   →  /app/dist  (fișiere statice)│
│  ARG VITE_API_URL injectat la build             │
└─────────────────────┬──────────────────────────┘
                      │ copiază dist/
┌─────────────────────▼──────────────────────────┐
│  Stage 2: serve (nginx:1.27-alpine)             │
│  dist/ → /usr/share/nginx/html                  │
│  nginx.conf → /etc/nginx/conf.d/default.conf    │
│  EXPOSE 80                                       │
└─────────────────────────────────────────────────┘
```

Punct important: **`VITE_API_URL` se fixează la momentul build-ului** (nu la runtime), pentru că
Vite inlinează variabilele `VITE_*` în bundle. Vezi cum e citită în
[`api.ts`](03-componente-si-lib.md#1-libapits--client-http--tipuri).

### `nginx.conf`
Configurație tipică de SPA:
- `try_files $uri $uri/ /index.html;` → orice rută necunoscută servește `index.html`, ca
  React Router să preia navigarea pe client (altfel un refresh pe `/sites/5` ar da 404).
- Cache de 7 zile pentru assets statice (`js|css|png|jpg|svg|woff2`…).

> Notă: nginx-ul din acest container servește doar fișierele statice. În producție se pune
> de obicei un reverse-proxy în față care rutează `/api` către backend — vezi
> [`../operare/03-deployment.md`](../operare/03-deployment.md) și nota despre `VITE_API_URL=""` (same-origin) din
> [`03-componente-si-lib.md`](03-componente-si-lib.md#1-libapits--client-http--tipuri).
</content>
