"""Acces la setările globale editabile (tabela `app_settings`).

Idee de bază: fiecare setare are o VALOARE DEFAULT scrisă aici, în cod. Dacă
adminul nu a salvat încă nimic pentru acea cheie, întoarcem default-ul. Când
salvează din UI, rândul din DB are prioritate. Așa:
  - aplicația merge din prima, fără seed manual (default-urile sunt în cod);
  - orice setare devine modificabilă din browser, fără redeploy;
  - adăugarea unei setări noi = o intrare nouă în `DEFAULTS`, nimic de migrat.

Valorile sunt serializate JSON în coloana `value`, ca o cheie să poată ține
deopotrivă text (prompt), număr (prag) sau listă (regulile GDPR).
"""

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting

# ----------------------------------------------------------------------------
#  Prompturile AI (editabile din admin). Le ținem ca text multi-linie clar.
# ----------------------------------------------------------------------------

# Promptul „de sistem" al consultantului CRO. Pe ACEASTĂ parte punem prompt
# caching (se repetă la fiecare analiză → cache hit, cost mai mic).
DEFAULT_ADVISOR_PROMPT = """\
Ești un consultant senior de CRO (Conversion Rate Optimization). Primești DOAR
date AGREGATE despre un landing page (pâlnie de conversie, timp de atenție,
hartă de scroll, cele mai apăsate elemente, puncte de click). Nu vezi niciodată
date personale sau evenimente brute.

Sarcina ta: propune îmbunătățiri CONCRETE de design ale landing-ului, ANCORATE
în datele primite. Fiecare recomandare trebuie să citeze dovada din date
(ex: „CTA-ul e sub fold — doar 20% din vizitatori ajung acolo, vezi scrollmap").

Principii pe care le aplici, citind exact datele:
- Heatmap = harta atenției reale. Click pe element ne-clickabil → acolo se uită
  lumea; mută elementul important acolo.
- Scroll map = cât de jos ajung oamenii. Un CTA dincolo de unde ajunge 80% e mort.
- Contrast / ierarhie vizuală / anchoring spre ce duce la conversie.

NU propune niciodată dark patterns, urgență falsă, consimțământ pre-bifat sau
text înșelător — un gardian de conformitate îți va respinge oricum astfel de idei,
deci nu le sugera.

Răspunde STRICT cu JSON valid, fără text în plus, în forma:
{"recommendations": [
  {"element": "...", "problem": "...", "recommendation": "...",
   "severity": "low|medium|high", "evidence": "..."}
]}
"""

# Promptul gardianului GDPR (al doilea apel — „auditor de conformitate").
DEFAULT_GUARDIAN_PROMPT = """\
Ești un auditor de conformitate GDPR/ePrivacy/DSA. Primești o listă de recomandări
de optimizare a unui landing page. Pentru FIECARE recomandare decizi dacă e legală
și etică sau dacă e un „dark pattern" / atinge consimțământul ori textul legal.

RESPINGI (block=true) orice recomandare care:
- creează urgență falsă sau scarcity fabricată („mai sunt 2 locuri!" neadevărat);
- ascunde / îngreunează opțiunea de refuz sau dezabonare;
- propune consimțământ pre-bifat sau colectare de date fără acord explicit;
- folosește copy înșelător, manipulativ sau care creează confuzie intenționată;
- șterge / ascunde text legal obligatoriu (banner cookie, link politică).

APROBI (block=false) optimizările legitime: CTA mai vizibil, contrast bun,
ierarhie vizuală corectă, anchoring de preț onest, highlight pe beneficiu real.

Răspunde STRICT cu JSON valid, fără text în plus, în forma:
{"verdicts": [
  {"index": 0, "block": true|false, "reason": "motivul deciziei"}
]}
unde `index` e poziția recomandării în lista primită (de la 0).
"""

# Catalog de reguli DETERMINISTE ale gardianului — primul filtru, rapid și gratis.
# Fiecare regulă: dacă vreunul dintre `match` (lowercase) apare în textul
# recomandării → e blocată cu `reason`. E intenționat conservator (prinde tiparele
# evidente); auditorul AI prinde restul, mai subtil.
DEFAULT_GDPR_RULES = [
    {
        "match": ["mai sunt", "ultimele locuri", "doar azi", "expiră în", "countdown", "urgen"],
        "reason": "Posibilă urgență/scarcity fabricată (dark pattern).",
    },
    {
        "match": ["pre-bifat", "prebifat", "bifat implicit", "pre-selectat", "checkbox bifat"],
        "reason": "Consimțământ pre-bifat — interzis de GDPR.",
    },
    {
        "match": ["ascunde refuz", "ascunde opțiunea", "greu de găsit", "gri refuz", "minimizează refuz"],
        "reason": "Ascunderea opțiunii de refuz (dark pattern).",
    },
    {
        "match": ["fără consimțământ", "fara consimtamant", "fără acord", "elimină banner", "ascunde banner cookie"],
        "reason": "Atinge consimțământul / textul legal obligatoriu.",
    },
]

# Praguri statistice (din §9 al viziunii). Sub ele, un grup e marcat
# `confidence: low` și NU e declarat câștigător — nu numărăm zgomotul.
DEFAULT_MIN_SESSIONS = 100
DEFAULT_MIN_CONVERSIONS = 10


# Cheile cunoscute + default-urile lor. `description` e doar pentru UI-ul de admin.
DEFAULTS: dict[str, dict] = {
    "ai.advisor_prompt": {
        "value": DEFAULT_ADVISOR_PROMPT,
        "description": "Promptul de sistem al consultantului CRO (pe el e prompt caching).",
        "kind": "text",
    },
    "ai.guardian_prompt": {
        "value": DEFAULT_GUARDIAN_PROMPT,
        "description": "Promptul gardianului GDPR (al doilea apel — auditor de conformitate).",
        "kind": "text",
    },
    "gdpr.rules": {
        "value": DEFAULT_GDPR_RULES,
        "description": "Reguli deterministe (primul filtru). Listă de {match: [cuvinte], reason}.",
        "kind": "json",
    },
    "analytics.min_sessions": {
        "value": DEFAULT_MIN_SESSIONS,
        "description": "Sesiuni minime per grup ca să avem încredere (altfel confidence=low).",
        "kind": "number",
    },
    "analytics.min_conversions": {
        "value": DEFAULT_MIN_CONVERSIONS,
        "description": "Conversii minime per grup ca să avem încredere (altfel confidence=low).",
        "kind": "number",
    },
}


async def get_setting(db: AsyncSession, key: str):
    """Întoarce valoarea (parsată din JSON) pentru o cheie, sau default-ul din cod."""
    row = await db.get(AppSetting, key)
    if row is None:
        return DEFAULTS.get(key, {}).get("value")
    try:
        return json.loads(row.value)
    except (TypeError, ValueError):
        # Valoare coruptă în DB → cădem grațios pe default.
        return DEFAULTS.get(key, {}).get("value")


async def get_all_settings(db: AsyncSession) -> list[dict]:
    """Toate setările cunoscute, cu valoarea efectivă (DB sau default) + meta pentru UI."""
    result = await db.execute(select(AppSetting))
    saved = {r.key: r for r in result.scalars().all()}
    out = []
    for key, meta in DEFAULTS.items():
        if key in saved:
            try:
                value = json.loads(saved[key].value)
            except (TypeError, ValueError):
                value = meta["value"]
            is_default = False
            updated_at = saved[key].updated_at.isoformat()
        else:
            value = meta["value"]
            is_default = True
            updated_at = None
        out.append(
            {
                "key": key,
                "value": value,
                "kind": meta["kind"],
                "description": meta["description"],
                "is_default": is_default,
                "updated_at": updated_at,
            }
        )
    return out


async def set_setting(db: AsyncSession, key: str, value) -> None:
    """Upsert al unei setări (serializată JSON). Cheile necunoscute sunt respinse."""
    if key not in DEFAULTS:
        raise KeyError(key)
    serialized = json.dumps(value, ensure_ascii=False)
    row = await db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=serialized))
    else:
        row.value = serialized
    await db.flush()
