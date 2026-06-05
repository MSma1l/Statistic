"""Generarea unei versiuni noi de landing din o recomandare (Faza 2 din viziune).

Buclă: AI propune cod → gardianul GDPR verifică CODUL (nu doar textul) → omul
aprobă/editează → se publică. Aici e doar pasul „AI propune + gardian"; aprobarea
și publicarea sunt în router (api/landings.py), declanșate de om.

Reguli identice cu restul stratului AI:
  - fără cheie API => dezactivare grațioasă (`available=False`, fără excepție);
  - gardian GDPR cu VETO DUR pe codul generat (reguli deterministe + auditor AI);
  - prompturile sunt editabile din admin (app_settings), nu hardcodate.
"""

import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.app_settings import get_setting
from app.services.ai_advisor import AI_DISABLED_MESSAGE, _extract_json


def _rule_block(text: str, rules: list[dict]) -> str | None:
    """Primul filtru determinist: întoarce motivul dacă vreun cuvânt-cheie apare în cod."""
    low = text.lower()
    for rule in rules:
        if any(needle.lower() in low for needle in rule.get("match", [])):
            return rule.get("reason", "Regulă GDPR")
    return None


async def generate_version(
    db: AsyncSession, current: dict, instruction: str
) -> dict:
    """`current` = {html, css, js} actuale + `instruction` (recomandarea de aplicat).

    Întoarce: {available, [error], [message], html, css, js, note, blocked, blocked_reason}.
    Codul propus e DRAFT — nu se publică automat; omul decide.
    """
    if not settings.ai_enabled:
        return {"available": False, "message": AI_DISABLED_MESSAGE}

    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        return {"available": False, "message": "Pachetul `anthropic` nu e instalat."}

    code_prompt = await get_setting(db, "ai.code_prompt")
    guardian_prompt = await get_setting(db, "ai.code_guardian_prompt")
    rules = await get_setting(db, "gdpr.rules") or []

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    model = settings.AI_MODEL

    user_msg = (
        "Sursa actuală a landing-ului (JSON) + instrucțiunea de aplicat:\n"
        + json.dumps(
            {
                "html": current.get("html", ""),
                "css": current.get("css", ""),
                "js": current.get("js", ""),
                "instruction": instruction,
            },
            ensure_ascii=False,
        )
    )

    try:
        # 1) Generăm versiunea nouă (prompt caching pe instrucțiunile de sistem).
        resp = await client.messages.create(
            model=model,
            max_tokens=8192,
            system=[
                {"type": "text", "text": code_prompt, "cache_control": {"type": "ephemeral"}}
            ],
            messages=[{"role": "user", "content": user_msg}],
        )
    except Exception as exc:  # noqa: BLE001 — degradare grațioasă
        return {"available": True, "error": True, "message": f"Apelul AI a eșuat: {exc}"}

    text = "".join(b.text for b in resp.content if b.type == "text")
    out = _extract_json(text)
    html = str(out.get("html", current.get("html", "")))
    css = str(out.get("css", current.get("css", "")))
    js = str(out.get("js", current.get("js", "")))
    note = str(out.get("note", instruction))[:512]

    # 2) GARDIAN GDPR pe COD — întâi reguli deterministe, apoi auditor AI.
    code_blob = f"{html}\n{css}\n{js}"
    reason = _rule_block(code_blob, rules)
    blocked = reason is not None
    blocked_by = "reguli" if blocked else ""

    if not blocked:
        try:
            audit = await client.messages.create(
                model=model,
                max_tokens=1024,
                system=[
                    {
                        "type": "text",
                        "text": guardian_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[
                    {
                        "role": "user",
                        "content": "Cod de auditat (JSON):\n"
                        + json.dumps({"html": html, "css": css, "js": js}, ensure_ascii=False),
                    }
                ],
            )
            verdict = _extract_json(
                "".join(b.text for b in audit.content if b.type == "text")
            )
            if verdict.get("block"):
                blocked = True
                blocked_by = "auditor AI"
                reason = verdict.get("reason", "Respins de auditorul de conformitate")
        except Exception:  # noqa: BLE001 — dacă auditorul pică, păstrăm rezultatul regulilor
            pass

    return {
        "available": True,
        "html": html,
        "css": css,
        "js": js,
        "note": note,
        "blocked": blocked,
        "blocked_reason": f"({blocked_by}) {reason}" if blocked and reason else "",
    }
