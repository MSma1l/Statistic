# 05 — Stratul AI / CRO (ÎN LUCRU)

> Starea reală a stratului de AI pentru optimizarea conversiei (CRO). Acest fișier e sincer despre ce e **schelet** vs ce e **implementat**: la momentul acestei documentații există infrastructura de configurare, prompturile și modelul de date, dar **nu există încă niciun apel real către Anthropic și niciun endpoint de analiză/funnels**.

Vezi și: [stack & config](01-stack-si-config.md) · [model de date](02-model-de-date.md) · [endpoint-uri](03-api-endpoints.md). Viziunea completă: [`../AB-MARKETING-AI-VISION.md`](../AB-MARKETING-AI-VISION.md).

---

## TL;DR — stadiul

| Componentă | Stare |
|------------|:-----:|
| SDK `anthropic==0.69.0` în `requirements.txt` | ✅ declarat |
| Config `ANTHROPIC_API_KEY` + `AI_MODEL` + `ai_enabled` | ✅ există |
| Prompturi AI (advisor CRO + gardian GDPR) + reguli + praguri | ✅ există (în cod, editabile din DB) |
| Model de date `funnel_steps` | ✅ există (tabel), fără endpoint |
| Model de date `app_settings` + helpere | ✅ există |
| Router `admin_settings` (citire/editare setări) | ✅ implementat |
| **Integrarea reală Anthropic (apel către Claude)** | ❌ LIPSEȘTE |
| **Endpoint de analiză AI/CRO** | ❌ LIPSEȘTE |
| **Endpoint-uri pentru funnels (CRUD trepte)** | ❌ LIPSEȘTE |
| **Calculul pâlniei / conversiilor** | ❌ LIPSEȘTE |

---

## 1. Ce EXISTĂ

### 1.1 Configurare (`app/config.py`)

- `ANTHROPIC_API_KEY: str = ""` — cheia API Claude. **Secret** → stă doar în `.env`, niciodată în DB/UI. Goală → AI dezactivat grațios.
- `AI_MODEL: str = "claude-opus-4-8"` — modelul folosit; configurabil din `.env`, nu la cald.
- `ai_enabled` (property) — `True` doar dacă `ANTHROPIC_API_KEY` e setată. Menit ca gate pentru dezactivarea grațioasă (endpoint-urile ar trebui să răspundă „AI indisponibil" fără cheie), dar **niciun cod nu îl consumă încă**.

> `ANTHROPIC_API_KEY` și `AI_MODEL` **nu apar în `.env.example`** — trebuie adăugate manual în `.env` când se activează AI.

### 1.2 Prompturi & reguli (`app/core/app_settings.py`)

Design-ul cheie: setările editabile din browser stau în tabela `app_settings` (cheie → valoare JSON), cu **valori default în cod**. Dacă adminul n-a salvat nimic pentru o cheie, se folosește default-ul; când salvează, rândul din DB are prioritate. Adăugarea unei setări noi = o intrare nouă în `DEFAULTS`, fără migrare.

Cheile cunoscute (`DEFAULTS`):

| Cheie | `kind` | Conținut |
|-------|--------|----------|
| `ai.advisor_prompt` | text | Promptul de sistem al **consultantului CRO** (`DEFAULT_ADVISOR_PROMPT`). Primește DOAR date agregate, cere recomandări concrete ancorate în dovezi, răspunde strict JSON `{"recommendations":[...]}`. Pe acest prompt e planificat prompt caching. |
| `ai.guardian_prompt` | text | Promptul **gardianului GDPR** (`DEFAULT_GUARDIAN_PROMPT`) — al doilea apel, auditor de conformitate. Respinge dark patterns / urgență falsă / consimțământ pre-bifat etc. Răspunde strict JSON `{"verdicts":[...]}`. |
| `gdpr.rules` | json | `DEFAULT_GDPR_RULES` — reguli **deterministe** (primul filtru, rapid și gratis): listă de `{match:[cuvinte], reason}`. Prind tiparele evidente înainte de a chema AI-ul. |
| `analytics.min_sessions` | number | `DEFAULT_MIN_SESSIONS = 100` — sesiuni minime/grup pentru încredere statistică. |
| `analytics.min_conversions` | number | `DEFAULT_MIN_CONVERSIONS = 10` — conversii minime/grup pentru încredere. |

Helpere: `get_setting(db, key)`, `get_all_settings(db)`, `set_setting(db, key, value)` (upsert; respinge cheile necunoscute).

### 1.3 Router de setări (`app/api/admin_settings.py`)

Singura suprafață HTTP a stratului AI existentă azi (admin-only):

- `GET /api/admin/settings` — toate cheile cu valoarea efectivă + meta.
- `PUT /api/admin/settings/{key}` — salvează o valoare (404 dacă cheia e necunoscută).

Detalii de referință în [03-api-endpoints.md](03-api-endpoints.md#4-admin-settings--apiadminsettings-apiadmin_settingspy).

### 1.4 Model de date `funnel_steps` (`app/models/funnel.py`)

Tabel pentru pâlnia de conversie per site (număr variabil de trepte). Mapează cele 2 „porți" din viziune:

- treaptă `kind="page"` (atingerea unui path, ex. `/multumim`),
- treaptă `kind="custom_event"` (un event `window.statistic`, potrivit pe `Event.element_text`),
- `is_conversion=True` marchează treptele de conversie finală.

Câmpurile complete: vezi [02-model-de-date.md](02-model-de-date.md#8-funnel_steps--trepte-de-conversie-modelsfunnelpy). Tabelul se creează la pornire, **dar niciun endpoint nu-l citește/scrie încă**.

---

## 2. Ce LIPSEȘTE

1. **Integrarea reală Anthropic.** SDK-ul e instalat, dar nu există niciun client `anthropic`, niciun apel `messages.create`, niciun cod care să folosească `AI_MODEL`, `ai_enabled` sau prompturile. Prompturile sunt definite dar nefolosite.
2. **Endpoint de analiză AI/CRO.** Nu există o rută care să: strângă datele agregate ale unei pagini (heatmap/scroll/funnel/top-elements), să le trimită consultantului CRO, apoi să treacă recomandările prin gardianul GDPR (întâi regulile deterministe `gdpr.rules`, apoi auditorul AI) și să întoarcă verdictele.
3. **Endpoint-uri pentru funnels.** Nu există CRUD pentru `funnel_steps` (definire trepte per site) și nici calcul de pâlnie/rate de trecere/conversie folosind pragurile `analytics.min_sessions` / `analytics.min_conversions`.
4. **Aplicarea automată a schimbărilor** (bucla închisă din viziune) — inexistentă; e etapă ulterioară.

---

## 3. Arhitectura intenționată (din prompturi & viziune)

Fluxul gândit — util ca hartă pentru implementarea viitoare, **nu cod existent**:

```
Date agregate ale paginii (heatmap, scroll, funnel, top-elements)
        │
        ▼
  Consultant CRO (ai.advisor_prompt, cu prompt caching)
        │  → JSON: recommendations[]
        ▼
  Gardian GDPR:
   1) filtru DETERMINIST (gdpr.rules)   → blochează tiparele evidente
   2) auditor AI (ai.guardian_prompt)   → JSON: verdicts[] (block/approve)
        │
        ▼
  Recomandări aprobate  →  (viitor) aplicare automată a celor mici & dovedite
```

Praguri statistice: un grup sub `min_sessions` / `min_conversions` e marcat `confidence: low` și nu e declarat câștigător.

> Pe scurt: fundația (config, prompturi editabile, model de funnel, router de setări) e pusă; „creierul" (apelul la Claude, endpoint-urile de analiză și funnels) urmează să fie construit.
