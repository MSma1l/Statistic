# Arhitectură — A/B Marketing + AI (Faza 0 + Faza 1)

> Harta fișierelor adăugate pentru stratul de optimizare CRO. Scopul: fiecare
> fișier mic, cu un rol clar. Vezi viziunea completă în `AB-MARKETING-AI-VISION.md`.

## Principiul de organizare

**Router subțire, servicii groase.** Endpoint-urile HTTP (în `api/`) doar validează
și deleagă; tot calculul real stă în `services/`. Setările editabile stau în DB
(`app_settings`), accesate printr-un singur modul (`core/app_settings.py`).

```
HTTP  ──►  api/optimization.py  ──►  services/funnel.py      (pâlnia comparativă)
                                ├──►  services/aggregates.py  (agregate per landing)
                                └──►  services/ai_advisor.py  (consultant + gardian GDPR)
                                          └──► core/app_settings.py (prompturi, reguli, praguri)
```

## Backend — fișiere noi

| Fișier | Rol |
|---|---|
| `models/funnel.py` | Tabela `funnel_steps`: treptele pâlniei per site (page / custom_event) + flag `is_conversion`. |
| `models/setting.py` | Tabela `app_settings`: setări globale editabile (cheie → valoare JSON). |
| `schemas/funnel.py` | Modelele Pydantic pentru I/O: `FunnelStepIn/Out`, `AiAnalyzeIn`. |
| `core/app_settings.py` | Sursa de adevăr a setărilor editabile: **valorile default din cod** + helpere `get/set`. Aici trăiesc promptul advisor, promptul gardian, regulile GDPR și pragurile statistice. |
| `services/scope.py` | Helpere partajate: `owned_site()` (ownership → 404) și `since(days)`. Folosite de ambele routere. |
| `services/funnel.py` | Calculul **pâlniei comparative** (Faza 0): grupare pe landing/campanie, rate de trecere, calitate (bounce/timp/scroll), `confidence`. Pur calcul. |
| `services/aggregates.py` | Strânge **agregatele unui landing** pentru AI (engagement, scroll, top-elemente, heatmap în clustere). Doar agregate — niciodată date brute. |
| `services/ai_advisor.py` | Stratul AI (Faza 1): consultant CRO + **gardian GDPR hibrid** (reguli deterministe + auditor AI). Dezactivare grațioasă fără cheie. Prompt caching pe sistem. |
| `api/optimization.py` | Router-ul (prefix `/api/analytics`): `GET/PUT /funnel`, `GET /funnel-compare`, `POST /ai-analyze`. Subțire. |
| `api/admin_settings.py` | Router admin (`/api/admin/settings`): citește/scrie setările editabile. `require_admin`. |

### Fișiere atinse (minim, fără a strica nimic)
- `models/__init__.py`, `main.py` — înregistrarea modelelor noi + a celor 2 routere.
- `api/analytics.py` — `_owned_site`/`_since` mutate în `services/scope.py` (alias la import; restul neschimbat).
- `config.py` — `ANTHROPIC_API_KEY` + `AI_MODEL` (din `.env`) + `ai_enabled`.
- `requirements.txt` — `anthropic`.

## Frontend — fișiere noi

| Fișier | Rol |
|---|---|
| `components/optimization/OptimizationSection.tsx` | Orchestrator: pune în ordine cele 3 carduri. |
| `components/optimization/FunnelEditor.tsx` | Editor de trepte funnel + conversie (per site). |
| `components/optimization/FunnelCompareTable.tsx` | Tabelul comparativ (landing vs campanie) + badge „date insuficiente" + 🏆 câștigător. |
| `components/optimization/AiRecommendations.tsx` | Buton „Analizează cu AI" + carduri de recomandări (cele blocate de gardian marcate roșu) + stare „AI indisponibil". |
| `components/admin/SettingField.tsx` | Câmp editabil pentru o setare text/număr (prompturi, praguri). |
| `components/admin/GdprRulesEditor.tsx` | Editor pentru lista de reguli GDPR deterministe. |
| `pages/AdminAI.tsx` | Pagina admin „AI & GDPR": status cheie + toate frame-urile editabile. |

### Fișiere atinse
- `pages/SiteDetail.tsx` — montează secțiunea „Optimizare".
- `App.tsx`, `components/Layout.tsx` — ruta + link-ul admin „AI & GDPR".

## Model de date

```
funnel_steps                         app_settings
  id            PK                     key         PK   (ex: "ai.advisor_prompt")
  site_id       FK→sites (CASCADE)     value       TEXT (JSON)
  position      ordinea treptei        updated_at
  kind          page | custom_event
  value         path sau nume event   Chei cunoscute (cu default în cod):
  label         text afișat             ai.advisor_prompt, ai.guardian_prompt,
  is_conversion bool (conversie?)       gdpr.rules, analytics.min_sessions,
  created_at                           analytics.min_conversions
```

Ambele tabele se creează automat la pornire (`Base.metadata.create_all`); nu sunt
necesare migrări manuale (nu modificăm tabele existente).

## Variabile `.env` noi
- `ANTHROPIC_API_KEY` — secret; gol ⇒ AI dezactivat grațios.
- `AI_MODEL` — modelul Claude (implicit `claude-opus-4-8`).

Restul (prompturi, reguli GDPR, praguri) se editează din UI: **admin → „AI & GDPR"**.
