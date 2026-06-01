# 🎓 Ghid de învățare — cum e construit „Statistic"

> Documentație educativă. Îți explic **de ce** și **cum** am scris fiecare parte, cu sintaxa explicată pas cu pas. Dacă citești de sus în jos, înțelegi tot proiectul.

**Cum să folosești ghidul:** ai lângă tine fișierele din proiect și citește explicația pentru fiecare. Conceptele noi sunt marcate cu 💡.

---

## Cuprins
1. [Imaginea de ansamblu](#1-imaginea-de-ansamblu)
2. [Backend — Python + FastAPI](#2-backend--python--fastapi)
3. [Baza de date — SQLAlchemy & PostgreSQL](#3-baza-de-date)
4. [Securitatea explicată](#4-securitatea-explicată)
5. [Pixelul (t.js) — JavaScript pur](#5-pixelul-tjs)
6. [Frontend — React + TypeScript](#6-frontend--react--typescript)
7. [Docker — cum se leagă tot](#7-docker)
8. [Concepte transversale](#8-concepte-transversale)
9. [Exerciții ca să înveți mai departe](#9-exerciții)

---

## 1. Imaginea de ansamblu

Un proiect web modern are aproape mereu 3 piese:
- **Frontend** — ce vede omul (React).
- **Backend** — logica + API (FastAPI).
- **Bază de date** — unde se țin datele (PostgreSQL).

Ele comunică prin **HTTP** (frontend → backend) și prin **SQL** (backend → DB). Docker le împachetează pe toate ca să pornească cu o comandă.

Structura folderelor:
```
backend/app/
  main.py        ← punctul de intrare (creează aplicația)
  config.py      ← citește setările din mediu
  database.py    ← conexiunea la DB
  models/        ← cum arată tabelele (clase Python)
  schemas/       ← validarea datelor care intră/ies (Pydantic)
  core/          ← securitate (parole, JWT, guard)
  api/           ← rutele (endpoint-urile)
  static/t.js    ← scriptul de tracking
frontend/src/
  pages/         ← paginile (Login, Dashboard, ...)
  components/     ← bucăți reutilizabile (Layout, butoane...)
  lib/           ← cod ajutător (api, autentificare)
```

> 💡 **Regula de aur:** *separation of concerns* — fiecare fișier face un singur lucru. Modelele descriu datele, schemele le validează, rutele le expun. Așa codul rămâne ușor de citit.

---

## 2. Backend — Python + FastAPI

### 2.1 Ce e FastAPI

FastAPI e un framework Python pentru API-uri. Scrii funcții normale, le pui un „decorator" deasupra, și devin endpoint-uri HTTP.

```python
@router.get("/health")
async def health():
    return {"status": "ok"}
```

Linie cu linie:
- `@router.get("/health")` — 💡 un **decorator**: spune „funcția de mai jos răspunde la `GET /health`".
- `async def` — 💡 funcție **asincronă**. Poate „aștepta" operații lente (DB, rețea) fără să blocheze serverul. Înăuntru folosești `await`.
- `return {...}` — FastAPI transformă automat dicționarul în **JSON**.

### 2.2 Citirea setărilor — `config.py`

```python
class Settings(BaseSettings):
    JWT_SECRET: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
```

- `Settings(BaseSettings)` — 💡 **moștenire**: clasa noastră preia puteri de la `BaseSettings` (din pydantic-settings), care **citește automat variabilele de mediu**. Dacă există `JWT_SECRET` în mediu, îl ia; altfel folosește valoarea implicită.
- `JWT_SECRET: str` — 💡 **type hint**: spunem că e text. Pydantic verifică tipul.

```python
@lru_cache
def get_settings() -> Settings:
    return Settings()
```
- `@lru_cache` — 💡 memorează rezultatul. Setările se citesc **o singură dată**, nu la fiecare apel.

### 2.3 O rută reală — login (`api/auth.py`)

```python
@router.post("/login", response_model=UserOut)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest, response: Response,
                db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email sau parolă greșite")
    _set_auth_cookie(response, user.id)
    return user
```

Ce se întâmplă:
- `payload: LoginRequest` — 💡 FastAPI vede tipul `LoginRequest` (o schemă Pydantic) și **automat** citește JSON-ul din cerere, îl validează și îl pune în `payload`. Dacă lipsește parola → eroare 422, nici nu intri în funcție.
- `db: AsyncSession = Depends(get_db)` — 💡 **Dependency Injection**. „Am nevoie de o sesiune de DB." FastAPI cheamă `get_db()` și îți dă rezultatul. Nu trebuie să-ți faci tu conexiunea.
- `await db.execute(select(User).where(...))` — interoghează DB. `select(User).where(User.email == ...)` se traduce în `SELECT * FROM users WHERE email = ...`, dar **parametrizat** (vezi securitatea).
- `result.scalar_one_or_none()` — ia un singur rezultat sau `None`.
- `verify_password(...)` — compară parola dată cu hash-ul din DB.
- `raise HTTPException(401, ...)` — 💡 oprești execuția și trimiți un cod HTTP de eroare.
- `response_model=UserOut` — 💡 garantează că răspunsul are **exact** forma `UserOut` (fără să scape, de ex., `password_hash`).

### 2.4 Protejarea rutelor — `api/deps.py`

```python
async def get_current_user(db=Depends(get_db),
                           token: str | None = Cookie(default=None, alias=settings.COOKIE_NAME)):
    if not token:
        raise HTTPException(401, "Neautentificat")
    user_id = decode_access_token(token)
    ...
    return user
```
- `Cookie(...)` — 💡 spune lui FastAPI „ia valoarea din cookie-ul cu numele dat". Așa luăm tokenul din cookie-ul httpOnly.
- Orice rută care scrie `user = Depends(get_current_user)` devine **protejată**: dacă nu ești logat, primești 401 automat.

```python
async def require_admin(user=Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(403, "Necesită drepturi de admin")
    return user
```
- 💡 **Dependențe în lanț**: `require_admin` depinde de `get_current_user`. Refolosim logica fără s-o copiem.

### 2.5 Izolarea datelor între utilizatori

Peste tot unde citim ceva al unui user, filtrăm după proprietar:
```python
select(Site).where(Site.owner_id == user.id)
```
Și la accesarea unui singur obiect verificăm proprietarul:
```python
if not site or site.owner_id != user.id:
    raise HTTPException(404, "Site inexistent")
```
> 💡 Returnăm **404** (nu 403) ca să nu dezvăluim că obiectul există, dar e al altcuiva.

---

## 3. Baza de date

### 3.1 Modelele — `models/` (un tabel = o clasă)

```python
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    sites: Mapped[list["Site"]] = relationship(back_populates="owner")
```
- `class User(Base)` — 💡 **ORM** (Object-Relational Mapping): o clasă Python = un tabel; un obiect = un rând. Nu scrii SQL de mână.
- `Mapped[int]` + `mapped_column(...)` — declari coloana și tipul ei.
- `unique=True, index=True` — emailul e unic și indexat (căutare rapidă).
- `relationship(...)` — 💡 **legătura** între tabele. `user.sites` îți dă automat toate site-urile userului (un `JOIN` în spate).
- `back_populates="owner"` — relația merge în ambele sensuri: `site.owner` te duce înapoi la user.

### 3.2 Conexiunea — `database.py`

```python
engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```
- `engine` — 💡 „motorul" conexiunii la DB (un *connection pool*).
- `async with ... as session` — 💡 **context manager**: deschide o sesiune și o **închide automat** la final, chiar dacă apare o eroare.
- `yield session` — 💡 face din `get_db` un **generator de dependență**: dă sesiunea rutei, iar după ce ruta termină, codul de după `yield` rulează (`commit` la succes, `rollback` la eroare). Așa nu uiți niciodată să salvezi/anulezi.

### 3.3 Crearea tabelelor

În loc de migrații (Alembic), la pornire creăm tabelele dacă nu există (`main.py`):
```python
async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.create_all)
```
- `Base.metadata` — știe toate tabelele (pentru că modelele moștenesc `Base`).
- `create_all` — le creează dacă lipsesc. Simplu pentru un proiect nou.

### 3.4 Agregări (statistici) — `api/analytics.py`

```python
day = func.date_trunc("day", Event.created_at).label("day")
select(day,
       func.count().filter(Event.type == "pageview").label("pageviews"),
       func.count().filter(Event.type == "click").label("clicks")) \
  .where(Event.site_id == site_id) \
  .group_by(day).order_by(day)
```
- `func.date_trunc("day", ...)` — grupează pe zile (funcție PostgreSQL).
- `func.count().filter(...)` — 💡 numără doar rândurile care respectă o condiție (`COUNT(*) FILTER (WHERE ...)`). Așa numărăm separat pageview-uri și click-uri într-o singură interogare.
- `.group_by()` / `.order_by()` — exact ca în SQL.

---

## 4. Securitatea explicată

### 4.1 Parole — `core/security.py`

```python
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
def hash_password(p): return pwd_context.hash(p)
def verify_password(p, h): return pwd_context.verify(p, h)
```
- 💡 **Nu stocăm niciodată parola în clar.** O trecem prin **argon2** (o funcție de hash lentă, special creată pentru parole). La login comparăm hash-urile.

### 4.2 JWT (tokenul de sesiune)

```python
def create_access_token(subject):
    payload = {"sub": str(subject), "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
```
- 💡 **JWT** = un text semnat care spune „cine ești" și „până când e valid". E semnat cu `JWT_SECRET`; nimeni nu-l poate falsifica fără secret.
- Îl punem într-un **cookie httpOnly** (vezi `_set_auth_cookie`), deci JavaScript-ul paginii **nu-l poate citi** → chiar dacă cineva reușește un XSS, nu fură tokenul.

### 4.3 Guard-ul SQLi/XSS — `core/guard.py`

Acesta e un **middleware ASGI** — cod care rulează **înainte** de orice rută, pentru fiecare cerere.

```python
class SecurityGuardMiddleware:
    def __init__(self, app): self.app = app
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send); return
        # 1) scanează query string
        # 2) citește body-ul, îl scanează, apoi îl re-injectează
        # 3) adaugă security headers pe răspuns
```
- 💡 **Middleware** = un strat prin care trece fiecare cerere. Modelul ASGI: `scope` (info despre cerere), `receive` (citește body), `send` (trimite răspuns).
- Scanăm textul cu **regex** după tipare periculoase:
  ```python
  _SQLI_PATTERNS = [r"(?i)\bunion\b\s+\bselect\b", r"(?i)\bor\b\s+\d+\s*=\s*\d+", ...]
  _XSS_PATTERNS  = [r"(?i)<\s*script", r"(?i)javascript\s*:", r"(?i)\bon\w+\s*=", ...]
  ```
  `(?i)` = ignoră majuscule; `\b` = margine de cuvânt. Dacă găsim un tipar → răspundem **400** și cererea nici nu ajunge la rută.
- 💡 De ce re-injectăm body-ul? Pentru că într-un ASGI body-ul se poate citi **o singură dată**. După ce-l citim ca să-l scanăm, îl „punem la loc" cu o funcție `wrapped_receive`, ca ruta reală să-l poată citi din nou.

> 💡 **Defense in depth** (apărare în straturi): guard-ul e doar un plus. Apărarea reală anti-SQLi e că folosim ORM cu query parametrizat (datele nu se lipesc niciodată direct în SQL), iar anti-XSS, React escapează tot la afișare + curățăm cu `bleach` la stocare.

### 4.4 Sanitizarea — `core/sanitize.py`

```python
def clean_text(value):
    return bleach.clean(value, tags=[], attributes={}, strip=True).strip()
```
- 💡 `bleach` scoate orice HTML din text. „`<b>salut</b>`" devine „salut". Așa nu salvăm cod periculos în DB.

---

## 5. Pixelul (t.js)

E JavaScript **pur** (fără framework) ca să fie mic și să meargă pe orice site. Idei cheie:

```js
var script = document.currentScript;          // referința la <script>-ul nostru
var SITE = script.getAttribute("data-site");   // citește cheia din data-site
var ENDPOINT = new URL(script.src).origin + "/px/collect";  // unde trimitem
```
- 💡 `document.currentScript` — scriptul știe „cine sunt eu" și de unde am fost încărcat → derivă singur adresa de trimitere.

**Coadă + trimitere în loturi (batch):**
```js
function track(type, extra) { queue.push({...}); schedule(); }
function schedule() { if (!timer) timer = setTimeout(flush, 1200); }
function flush() { navigator.sendBeacon(ENDPOINT, new Blob([json], {type:"text/plain"})); }
```
- 💡 Nu trimitem un request la fiecare click (ar fi multe). Le **adunăm** și trimitem la 1.2 secunde.
- 💡 `navigator.sendBeacon` — trimite date „pe fundal", chiar dacă userul închide pagina. Folosim `text/plain` ca să fie un *request simplu* și să **evităm preflight-ul CORS** (altfel browserul ar bloca trimiterea către alt domeniu).

**Heatmap — matematica:**
```js
var x = (e.pageX / docW) * 100;   // poziția click-ului ca PROCENT din lățimea paginii
var y = (e.pageY / docH) * 100;
```
- 💡 Salvăm procente, nu pixeli. Așa heatmap-ul arată corect indiferent de mărimea ecranului vizitatorului.

---

## 6. Frontend — React + TypeScript

### 6.1 Ce e React, pe scurt

Construiești interfața din **componente** = funcții care întorc „HTML" (de fapt JSX). Când datele se schimbă, React re-desenează doar ce trebuie.

```tsx
export default function Login() {
  const [email, setEmail] = useState("");      // 💡 "state" — o variabilă pe care React o urmărește
  return <input value={email} onChange={e => setEmail(e.target.value)} />;
}
```
- 💡 `useState("")` — îți dă valoarea (`email`) și o funcție de schimbare (`setEmail`). Când chemi `setEmail`, componenta se re-desenează cu noua valoare.
- `value={email}` + `onChange` — 💡 **controlled input**: React deține valoarea câmpului.
- `{...}` în JSX — 💡 inserezi JavaScript în interfață.

### 6.2 Context — starea de autentificare (`lib/auth.tsx`)

```tsx
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  async function login(email, pass) { const {data} = await api.post("/auth/login", {...}); setUser(data); }
  return <AuthContext.Provider value={{user, login, logout}}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
```
- 💡 **Context** = o cutie cu date la care ajunge **orice** componentă din aplicație, fără să paseze manual prin fiecare nivel. Aici ținem userul logat. Orice pagină cheamă `useAuth()` și știe cine e logat.

### 6.3 Rutarea (`App.tsx`)

```tsx
if (!user) return <Routes><Route path="/login" element={<Login/>}/>...</Routes>;
return <Routes><Route element={<Layout/>}>
  <Route path="/" element={<Dashboard/>} />
  <Route path="/sites/:id" element={<SiteDetail/>} />
</Route></Routes>;
```
- 💡 **Client-side routing**: nu reîncărcăm pagina; React schimbă conținutul în funcție de URL.
- Dacă nu ești logat → vezi doar `/login`. Logica de „protejare" e aici, simplu.
- `:id` — 💡 parametru dinamic. În `SiteDetail` îl citești cu `useParams()`.

### 6.4 Aducerea datelor — TanStack Query (`pages/Sites.tsx`)

```tsx
const { data: sites, isLoading } = useQuery({
  queryKey: ["sites"],
  queryFn: async () => (await api.get("/api/sites")).data,
});
```
- 💡 `useQuery` — aduce date de la server și îți dă `isLoading`, `data`, erori — gata gestionate. Le și **memorează** (cache) după `queryKey`.

```tsx
const createMut = useMutation({
  mutationFn: () => api.post("/api/sites", {name}),
  onSuccess: () => qc.invalidateQueries({queryKey: ["sites"]}),
});
```
- 💡 `useMutation` — pentru acțiuni care **schimbă** date (POST/PATCH/DELETE).
- `invalidateQueries` — „lista de site-uri s-a schimbat, re-adu-o" → UI-ul se actualizează singur.

### 6.5 Comunicarea cu backend-ul (`lib/api.ts`)

```ts
export const api = axios.create({ baseURL: API_URL, withCredentials: true });
```
- 💡 `withCredentials: true` — trimite cookie-urile (deci și tokenul de sesiune) la fiecare cerere. Fără asta, backend-ul te-ar vedea ca nelogat.

### 6.6 Heatmap-ul pe canvas (`components/HeatmapCanvas.tsx`)

Pe scurt, algoritmul:
1. Pentru fiecare punct desenăm un cerc cu gradient (mai opac în centru).
2. Citim pixelii (`getImageData`) și transformăm **intensitatea** (cât de des s-a apăsat acolo) într-o **culoare** (albastru→verde→galben→roșu).

> 💡 Am scris heatmap-ul de la zero (în loc de o librărie) ca să nu adăugăm dependențe fragile și ca să înțelegi exact ce se întâmplă.

### 6.7 Stilizarea — TailwindCSS

În loc de fișiere CSS separate, pui clase direct pe element:
```tsx
<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
```
- `rounded-2xl` = colțuri rotunjite, `p-5` = padding, `shadow-sm` = umbră ușoară.
- 💡 Clasele repetate le-am strâns în „componente" CSS în `index.css` (`.card`, `.btn-primary`), ca să nu le rescriu peste tot.

---

## 7. Docker

### 7.1 Dockerfile = rețeta unei imagini

Backend (`backend/Dockerfile`):
```dockerfile
FROM python:3.12-slim        # pornim de la o imagine cu Python
WORKDIR /app                 # folderul de lucru în container
COPY requirements.txt .      # copiem lista de dependențe
RUN pip install -r requirements.txt   # le instalăm
COPY . .                     # copiem codul
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]  # cum pornește
```
- 💡 **De ce copiem `requirements.txt` separat, înainte de cod?** Pentru *cache*: dacă schimbi doar codul (nu și dependențele), Docker refolosește pasul de `pip install` → build mult mai rapid.

Frontend (`frontend/Dockerfile`) — **multi-stage**:
```dockerfile
FROM node:20-alpine AS build
RUN npm run build            # construim React-ul → fișiere statice în /dist
FROM nginx:1.27-alpine       # imagine nouă, mică, doar cu nginx
COPY --from=build /app/dist /usr/share/nginx/html   # luăm doar rezultatul
```
- 💡 **Multi-stage**: construim cu Node (greu), dar livrăm doar fișierele finale servite de nginx (ușor). Imaginea finală e mică.

### 7.2 docker-compose.yml = orchestrarea

```yaml
services:
  db: { image: postgres:16-alpine, healthcheck: ... }
  backend:
    depends_on: { db: { condition: service_healthy } }
    environment: { DATABASE_URL: postgresql+asyncpg://...@db:5432/... }
  frontend:
    depends_on: [backend]
```
- 💡 `depends_on` + `healthcheck` — backend pornește **doar după** ce DB e „sănătoasă".
- 💡 `@db:5432` — în rețeaua Docker, containerele se găsesc **după nume** (`db`), nu după `localhost`.
- 💡 `${VAR:-default}` — ia valoarea din `.env`, sau folosește un default.

---

## 8. Concepte transversale

| Concept | Pe scurt |
|---------|----------|
| **Async/await** | Codul „așteaptă" operații lente fără să blocheze. Esențial la un server care servește mulți useri. |
| **Dependency Injection** | Ceri ce ai nevoie (DB, user) și framework-ul ți-l dă. Cod curat și testabil. |
| **ORM** | Lucrezi cu obiecte Python, nu cu SQL brut. Mai sigur și mai citibil. |
| **JWT + cookie httpOnly** | Sesiune fără stocare pe server + protejată de furt prin JS. |
| **CORS** | Reguli de browser despre cine poate chema API-ul de pe alt domeniu. De-aia avem `FRONTEND_ORIGIN`. |
| **SameSite / preflight** | Detalii de browser care decid când se trimit cookie-uri și când se cere „permisiune" înainte de un request. De-aia pixelul folosește `text/plain`. |
| **Regex** | Tipare de text. Le folosim în guard ca să prindem injection. |
| **State & re-render (React)** | Schimbi starea → UI-ul se redesenează singur. |

---

## 9. Exerciții

Ca să fixezi ce ai învățat, încearcă (de la ușor la greu):

1. **Ușor** — schimbă culoarea temei în `frontend/tailwind.config.js` (paleta `brand`) și vezi efectul.
2. **Ușor** — adaugă un câmp `note` la `Site` (model + schemă + afișare în dashboard).
3. **Mediu** — adaugă un endpoint nou `/api/analytics/{id}/hours` care arată pe ce **oră din zi** sunt cele mai multe vizite (`func.date_part('hour', ...)`).
4. **Mediu** — adaugă în pixel urmărirea **timpului petrecut pe pagină** (trimite un eveniment `time_on_page` la `pagehide`).
5. **Greu** — adaugă „refresh token" (un al doilea token cu viață mai lungă) ca sesiunea să nu expire brusc.
6. **Greu** — fă heatmap-ul peste un **screenshot** al paginii (hint: salvează `document.title` + dimensiunea paginii; afișarea peste imagine reală cere captură separată).

> Sfat de învățare: pornește aplicația cu `docker compose up`, deschide <http://localhost:8010/docs> și **apasă pe endpoint-uri** — vezi în direct ce intră și ce iese. Apoi caută în cod ruta respectivă și citește-o cu acest ghid alături.

---

Spor la învățat! Dacă vrei, pot să-ți explic în detaliu **orice fișier sau linie** din proiect — întreabă-mă punctual.
