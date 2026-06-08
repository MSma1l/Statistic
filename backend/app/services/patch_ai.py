"""Generarea + auditarea GDPR a unui patch DOM live (Faza 3 din viziune).

Două responsabilități, amândouă mici:
  1. `derive_risk` — pune un nivel de risc pe o operație (poarta din §9).
  2. `guard_patch` — VETO-ul gardianului GDPR pe UN patch (reguli + auditor AI).
  3. `generate_patch` — AI transformă o recomandare CRO într-un patch concret,
     apoi îl trece prin gardian înainte să-l întoarcă.

Refolosim exact filozofia stratului AI existent (`ai_advisor.py`, `landing_ai.py`):
DOAR agregate la intrare, dezactivare grațioasă fără cheie, gardian hibrid
(reguli deterministe rapide + auditor AI subtil).
"""

import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.app_settings import get_setting
from app.services.ai_advisor import AI_DISABLED_MESSAGE, _extract_json


def derive_risk(op: str, prop: str) -> str:
    """Riscul unei operații DOM (poarta risc × încredere × GDPR, §9).

    - "text"  → mic: schimbi un text vizibil, reversibil, fără efecte structurale.
    - "style" → mic: culoare/mărime/contrast = optimizări clasice CRO, sigure.
    - "attr"  → mediu: un atribut poate schimba COMPORTAMENT (ex: `href` → altă
      destinație, `target`), deci merită mereu ochi uman. Nu există „high" aici
      fiindcă nu permitem operații de layout/html arbitrar (acelea ar fi „high").
    """
    if op == "attr":
        return "medium"
    return "low"


def _rule_block(text: str, rules: list[dict]) -> str | None:
    """Primul filtru, determinist: motivul dacă vreun cuvânt-cheie GDPR apare în text."""
    low = text.lower()
    for rule in rules:
        if any(needle.lower() in low for needle in rule.get("match", [])):
            return rule.get("reason", "Regulă GDPR")
    return None


async def guard_patch(db: AsyncSession, patch: dict) -> tuple[bool, str]:
    """Trece un patch prin gardianul GDPR. Întoarce (blocked, reason).

    Pas (a): reguli deterministe pe textul patch-ului (label + value + prop).
    Pas (b): auditor AI (dacă există cheie) — prinde manipularea subtilă pe care
             cuvintele-cheie n-o prind. Dacă AI lipsește/pică, rămâne pasul (a).
    """
    rules = await get_setting(db, "gdpr.rules") or []
    haystack = " ".join(
        str(patch.get(f, "")) for f in ("label", "value", "prop", "selector")
    )
    reason = _rule_block(haystack, rules)
    if reason:
        return True, f"(reguli) {reason}"

    if not settings.ai_enabled:
        return False, ""
    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        return False, ""

    guardian_prompt = await get_setting(db, "ai.patch_guardian_prompt")
    try:
        client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=512,
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
                    "content": "Patch de auditat (JSON):\n"
                    + json.dumps(patch, ensure_ascii=False),
                }
            ],
        )
        verdict = _extract_json(
            "".join(b.text for b in resp.content if b.type == "text")
        )
        if verdict.get("block"):
            return True, f"(auditor AI) {verdict.get('reason', 'Respins de auditor')}"
    except Exception:  # noqa: BLE001 — auditorul e best-effort; regulile rămân plasa de siguranță
        pass
    return False, ""


async def generate_patch(
    db: AsyncSession, page_elements: list[dict], instruction: str
) -> dict:
    """AI: recomandare CRO -> patch DOM concret {selector, op, prop, value, label}.

    `page_elements` = cele mai apăsate elemente ale paginii (selector + text), ca
    AI-ul să țintească un selector REAL, nu inventat. Apoi patch-ul trece prin gardian.
    """
    if not settings.ai_enabled:
        return {"available": False, "message": AI_DISABLED_MESSAGE}
    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        return {"available": False, "message": "Pachetul `anthropic` nu e instalat."}

    code_prompt = await get_setting(db, "ai.patch_prompt")
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    user_msg = (
        "Elementele reale ale paginii (selector + text observat) + recomandarea de aplicat:\n"
        + json.dumps(
            {"elements": page_elements, "instruction": instruction},
            ensure_ascii=False,
        )
    )
    try:
        resp = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=1024,
            system=[
                {"type": "text", "text": code_prompt, "cache_control": {"type": "ephemeral"}}
            ],
            messages=[{"role": "user", "content": user_msg}],
        )
    except Exception as exc:  # noqa: BLE001 — degradare grațioasă
        return {"available": True, "error": True, "message": f"Apelul AI a eșuat: {exc}"}

    out = _extract_json("".join(b.text for b in resp.content if b.type == "text"))
    op = out.get("op") if out.get("op") in ("text", "style", "attr") else "text"
    patch = {
        "selector": str(out.get("selector", ""))[:1024],
        "op": op,
        "prop": str(out.get("prop", ""))[:255],
        "value": str(out.get("value", ""))[:4000],
        "label": str(out.get("label", instruction))[:255],
    }
    if not patch["selector"]:
        return {"available": True, "error": True, "message": "AI nu a putut alege un element."}

    patch["risk"] = derive_risk(patch["op"], patch["prop"])
    blocked, reason = await guard_patch(db, patch)
    patch["blocked"] = blocked
    patch["blocked_reason"] = reason
    patch["available"] = True
    return patch
