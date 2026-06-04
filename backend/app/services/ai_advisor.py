"""Stratul AI: consultant CRO + gardian GDPR (Faza 1 din viziune).

Reguli de aur (cost + GDPR):
  - Primește DOAR agregate (pâlnie, engagement, scroll, top-elemente, heatmap).
    NICIODATĂ evenimente brute / date personale.
  - Dacă lipsește `ANTHROPIC_API_KEY`, feature-ul e dezactivat „grațios":
    întoarce un rezultat cu `available=False` și un mesaj clar, NU aruncă excepție.

Fluxul unei analize:
  1. Construim un mesaj cu agregatele și cerem consultantului recomandări (JSON).
  2. GARDIAN GDPR — hibrid, în doi pași:
     a) reguli DETERMINISTE (rapide, gratis) — blochează tiparele evidente;
     b) AUDITOR AI — al doilea apel, cu rol de conformitate, prinde subtilul.
     O recomandare blocată de oricare pas NU dispare, ci apare marcată
     `blocked=True` + motivul (transparență pentru om).

DE CE prompt caching: promptul de sistem (instrucțiunile consultantului) e mare
și se repetă identic la fiecare analiză. Îl marcăm `cache_control` → Anthropic îl
ține în cache și ne taie mult din costul de input la analizele următoare.
"""

import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.app_settings import get_setting

# Mesajul standard când nu există cheie — folosit și de endpoint pentru UI.
AI_DISABLED_MESSAGE = (
    "AI indisponibil — setează ANTHROPIC_API_KEY în .env ca să activezi "
    "consultantul de optimizare."
)


def _extract_json(text: str) -> dict:
    """Scoate primul obiect JSON dintr-un răspuns (modelul poate adăuga text).

    Căutăm de la prima `{` la ultima `}`. E suficient pentru răspunsurile noastre,
    care sunt un singur obiect JSON, și e robust dacă modelul mai pune o frază.
    """
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return {}
    try:
        return json.loads(text[start : end + 1])
    except (TypeError, ValueError):
        return {}


def _apply_rule_guardian(recommendations: list[dict], rules: list[dict]) -> None:
    """Pas (a): filtru determinist. Marchează in-place recomandările care lovesc o regulă."""
    for rec in recommendations:
        # Concatenăm câmpurile de text ale recomandării și căutăm cuvintele-cheie.
        haystack = " ".join(
            str(rec.get(f, "")) for f in ("element", "problem", "recommendation", "evidence")
        ).lower()
        for rule in rules:
            if any(needle.lower() in haystack for needle in rule.get("match", [])):
                rec["blocked"] = True
                rec["blocked_by"] = "reguli"
                rec["blocked_reason"] = rule.get("reason", "Regulă GDPR")
                break


async def _run_ai_auditor(client, model: str, guardian_prompt: str, recommendations: list[dict]) -> None:
    """Pas (b): auditorul AI. Verifică recomandările rămase și marchează ce respinge."""
    # Trimitem doar recomandările încă neblocate de reguli (economie de tokeni),
    # dar păstrăm indexul ORIGINAL ca să mapăm verdictele înapoi corect.
    pending = [(i, r) for i, r in enumerate(recommendations) if not r.get("blocked")]
    if not pending:
        return

    payload = [
        {
            "index": idx,
            "element": r.get("element", ""),
            "problem": r.get("problem", ""),
            "recommendation": r.get("recommendation", ""),
        }
        for idx, r in pending
    ]

    resp = await client.messages.create(
        model=model,
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": guardian_prompt,
                # Cache pe instrucțiunile auditorului (se repetă la fiecare analiză).
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": "Recomandări de auditat (JSON):\n"
                + json.dumps(payload, ensure_ascii=False),
            }
        ],
    )
    text = "".join(block.text for block in resp.content if block.type == "text")
    verdicts = _extract_json(text).get("verdicts", [])

    for v in verdicts:
        idx = v.get("index")
        if v.get("block") and isinstance(idx, int) and 0 <= idx < len(recommendations):
            recommendations[idx]["blocked"] = True
            recommendations[idx]["blocked_by"] = "auditor AI"
            recommendations[idx]["blocked_reason"] = v.get(
                "reason", "Respins de auditorul de conformitate"
            )


async def analyze_landing(db: AsyncSession, aggregates: dict) -> dict:
    """Punctul de intrare: agregate -> recomandări (deja trecute prin gardian).

    Întoarce mereu un dict cu `available` (bool). Când e False, UI-ul afișează
    mesajul; restul aplicației nu e afectat.
    """
    if not settings.ai_enabled:
        return {"available": False, "message": AI_DISABLED_MESSAGE, "recommendations": []}

    # Importul SDK-ului e local: dacă pachetul lipsește din mediu, doar feature-ul
    # AI pică grațios, nu pornirea aplicației.
    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        return {
            "available": False,
            "message": "Pachetul `anthropic` nu e instalat (adaugă-l în requirements).",
            "recommendations": [],
        }

    advisor_prompt = await get_setting(db, "ai.advisor_prompt")
    guardian_prompt = await get_setting(db, "ai.guardian_prompt")
    rules = await get_setting(db, "gdpr.rules") or []

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    model = settings.AI_MODEL

    try:
        # 1) Consultantul CRO — recomandări ancorate în agregate.
        resp = await client.messages.create(
            model=model,
            max_tokens=2048,
            system=[
                {
                    "type": "text",
                    "text": advisor_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": "Date agregate ale landing-ului (JSON):\n"
                    + json.dumps(aggregates, ensure_ascii=False),
                }
            ],
        )
    except Exception as exc:  # noqa: BLE001 — orice eroare de rețea/API => degradare grațioasă
        return {
            "available": True,
            "error": True,
            "message": f"Apelul către Claude a eșuat: {exc}",
            "recommendations": [],
        }

    text = "".join(block.text for block in resp.content if block.type == "text")
    recommendations = _extract_json(text).get("recommendations", [])
    if not isinstance(recommendations, list):
        recommendations = []

    # 2) Gardian GDPR — întâi regulile deterministe, apoi auditorul AI.
    _apply_rule_guardian(recommendations, rules)
    try:
        await _run_ai_auditor(client, model, guardian_prompt, recommendations)
    except Exception:  # noqa: BLE001 — dacă auditorul pică, păstrăm filtrul determinist
        pass

    return {
        "available": True,
        "model": model,
        "recommendations": recommendations,
        "blocked_count": sum(1 for r in recommendations if r.get("blocked")),
    }
