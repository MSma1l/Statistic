# Documentația Frontend — „Statistic"

> Documentație tehnică modulară pentru dashboard-ul (frontend-ul) aplicației Statistic:
> ce tehnologii folosește, cum e organizat codul, ce face fiecare pagină și componentă
> și cum funcționează rutarea și permisiunile.

Acest set de documente acoperă **doar frontend-ul** (folderul `frontend/`). Pentru imaginea
de ansamblu funcțională (ce face aplicația, backend, model de date, API), vezi
[indexul documentației](../README.md).

---

## Ce este frontend-ul

Frontend-ul este **dashboard-ul** pe care îl vezi în browser: o aplicație SPA (Single Page
Application) scrisă în **React + TypeScript**, construită cu **Vite** și servită static de
**nginx** într-un container Docker. Comunică cu backend-ul FastAPI exclusiv prin HTTP (axios),
folosind autentificare pe **cookie httpOnly** (sesiunea nu e stocată în JavaScript).

Are două zone funcționale mari, controlate prin permisiuni:

| Zonă | Pagini | Permisiune necesară |
|------|--------|---------------------|
| **Pixel / Analytics** | Site-uri, Detaliu site (KPI, grafice, heatmap, sesiuni) | `can_sites` |
| **Linkuri & QR** | Linkuri, Detaliu link, Galerie | `can_links` sau `can_qr` |
| **Administrare** | Utilizatori (creare conturi + permisiuni) | `is_admin` |

Plus paginile comune: **Login** (public) și **Tablou de bord** (accesibil oricui e logat).

---

## Index — citește în ordine

| # | Fișier | Ce acoperă |
|---|--------|------------|
| 1 | [`01-stack-si-structura.md`](01-stack-si-structura.md) | Stack-ul tehnologic (React 18, TS 5.7, Vite 6, React Query 5, axios, Tailwind, Recharts, lucide), fișierele de configurare și structura folderului `src/`. |
| 2 | [`02-pagini.md`](02-pagini.md) | Fiecare pagină din `src/pages/`: ce afișează, ce date cere de la API, ce acțiuni permite. |
| 3 | [`03-componente-si-lib.md`](03-componente-si-lib.md) | Componentele reutilizabile (`Layout`, `ui.tsx`, `HeatmapCanvas`, `HeatmapOverlay`, `JourneyModal`) și modulele din `lib/` (`api.ts`, `auth.tsx`, `accounts.ts`), inclusiv observațiile de securitate. |
| 4 | [`04-rutare-si-permisiuni.md`](04-rutare-si-permisiuni.md) | Rutarea din `App.tsx`, guard-urile pe autentificare și permisiuni, lazy-loading-ul și sincronizarea cu permisiunile din backend. |

---

## Rezumat vizual al arhitecturii frontend

```
                 ┌──────────────────────────────────────────────┐
                 │                 main.tsx                       │
                 │  QueryClientProvider → BrowserRouter →         │
                 │  AuthProvider → <App />                        │
                 └───────────────────────┬──────────────────────┘
                                         │
                          ┌──────────────▼──────────────┐
                          │            App.tsx           │
                          │  guard auth + guard permisiuni│
                          │  (lazy-loading pe pagini)     │
                          └──────┬───────────────┬───────┘
                                │  neautentificat │ autentificat
                          ┌──────▼──────┐   ┌─────▼─────────────────────┐
                          │  Login.tsx  │   │   Layout (sidebar + Outlet)│
                          └─────────────┘   │   ├─ Dashboard             │
                                            │   ├─ Sites / SiteDetail    │
                                            │   ├─ Links / LinkDetail    │
                                            │   ├─ Gallery               │
                                            │   └─ Settings (admin)      │
                                            └────────────────────────────┘
                                                        │
                                            lib/api.ts (axios, withCredentials)
                                                        │  HTTP + cookie
                                                        ▼
                                                 Backend FastAPI
```

---

## Comenzi rapide (din folderul `frontend/`)

| Comandă | Efect |
|---------|-------|
| `npm install` | instalează dependențele |
| `npm run dev` | server de dezvoltare Vite (port 5173, hot reload) |
| `npm run build` | verificare de tipuri (`tsc`) + build de producție în `dist/` |
| `npm run preview` | previzualizează build-ul de producție local |

Deploy-ul real se face prin `Dockerfile` (build cu Node → servire cu nginx). Vezi
[`01-stack-si-structura.md`](01-stack-si-structura.md#build--deploy).
</content>
</invoke>
