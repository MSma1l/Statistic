"""Generator de landing-uri de VÂNZĂRI de la zero, cu AI (modul adițional).

Diferă de `landing_ai.py` (care îmbunătățește o pagină existentă): aici AI-ul
CONSTRUIEȘTE o pagină completă pornind de la un șablon de bază + un brief, și
conectează automat ce avem deja în sistem:
  - PIXELUL de tracking (snippetul `t.js`) — injectat în <head>, deci pagina e
    urmărită din prima;
  - LINKURILE scurte trackuibile — butoanele CTA trimit prin `/l/{slug}` (click
    măsurat + redirect unde a setat owner-ul).

NU atinge cod existent: refolosește prin import gardianul și helperele deja scrise
(`_rule_block`, `_extract_json`) și setările editabile (`ai.code_guardian_prompt`,
`gdpr.rules`). Fără cheie API => dezactivare grațioasă, ca tot stratul AI.
"""

import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.app_settings import get_setting
from app.services.ai_advisor import AI_DISABLED_MESSAGE, _extract_json
from app.services.landing_ai import _rule_block

# Promptul de construcție (ține-l aici, nu în app_settings, ca să nu edităm cod
# existent; dacă vrei mai târziu să-l faci editabil din admin, mutăm o cheie nouă).
BUILDER_PROMPT = """\
Ești un designer + copywriter de landing-uri de vânzări, expert în conversie (CRO).
Primești un brief, un șablon HTML de pornire și o listă de linkuri (cu scopul fiecăruia).

Construiește o pagină de vânzări COMPLETĂ și ATRĂGĂTOARE (HTML + CSS + JS simplu)
care face clientul să cumpere: titlu clar cu beneficiul, secțiuni convingătoare,
ierarhie vizuală bună, CTA-uri vizibile. Stil modern, curat, responsive.

REGULI OBLIGATORII:
- Pornește de la șablonul dat, dar perfecționează-l liber (design plăcut, ce vinde).
- Butoanele CTA trebuie să ducă la LINKURILE primite (folosește exact URL-urile date,
  potrivind fiecare buton cu scopul linkului respectiv).
- Dacă primești un snippet de pixel, include-l EXACT cum e dat, în <head> (tracking).
- Texte în limba briefului. JS doar simplu (fără framework, fără dependențe externe).
- FĂRĂ dark patterns: fără urgență falsă, fără consimțământ pre-bifat, fără copy
  înșelător. Nu adăuga colectare de date fără rost. (Un gardian va verifica oricum.)

Răspunde STRICT cu JSON valid, fără text în plus:
{"html": "<!doctype html>…pagina completă…", "css": "", "js": "", "note": "ce ai construit pe scurt"}
Pune tot CSS-ul în <style> și JS-ul în <script> în interiorul `html`; lasă `css`/`js` goale
SAU pune-le separat — cum îți e mai curat. Pagina trebuie să fie completă și de sine stătătoare.
"""

# Șabloane de bază (seed-uri minime pe care AI-ul le personalizează).
TEMPLATES: dict[str, dict] = {
    "blank": {
        "name": "Gol (AI decide tot)",
        "description": "Pornire de la zero; AI-ul alege structura.",
        "html": "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>",
    },
    "sales": {
        "name": "Pagină de vânzări",
        "description": "Hero + beneficii + dovadă + CTA + subsol.",
        "html": (
            "<!doctype html><html><head><meta charset='utf-8'></head><body>"
            "<header><!-- logo + titlu --></header>"
            "<section class='hero'><!-- beneficiu principal + CTA --></section>"
            "<section class='benefits'><!-- 3 beneficii --></section>"
            "<section class='proof'><!-- testimoniale / dovadă --></section>"
            "<section class='cta'><!-- îndemn final --></section>"
            "<footer></footer></body></html>"
        ),
    },
    "lead": {
        "name": "Captare lead",
        "description": "Titlu puternic + ofertă + un singur CTA mare.",
        "html": (
            "<!doctype html><html><head><meta charset='utf-8'></head><body>"
            "<section class='lead'><!-- titlu + ofertă + 1 CTA --></section>"
            "</body></html>"
        ),
    },
}


async def generate_landing(
    db: AsyncSession,
    brief: str,
    template_id: str,
    pixel_snippet: str,
    links: list[dict],
) -> dict:
    """Construiește o pagină nouă din brief + șablon + tracking.

    `links` = [{"label": scop, "url": short_url}]. Întoarce
    {available, [error/message], html, css, js, note, blocked, blocked_reason}.
    """
    if not settings.ai_enabled:
        return {"available": False, "message": AI_DISABLED_MESSAGE}

    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        return {"available": False, "message": "Pachetul `anthropic` nu e instalat."}

    template = TEMPLATES.get(template_id, TEMPLATES["blank"])
    guardian_prompt = await get_setting(db, "ai.code_guardian_prompt")
    rules = await get_setting(db, "gdpr.rules") or []

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    model = settings.AI_MODEL

    user_msg = (
        "Brief + șablon + tracking (JSON):\n"
        + json.dumps(
            {
                "brief": brief,
                "template_html": template["html"],
                "pixel_snippet": pixel_snippet,
                "links": links,
            },
            ensure_ascii=False,
        )
    )

    try:
        resp = await client.messages.create(
            model=model,
            max_tokens=8192,
            system=[
                {"type": "text", "text": BUILDER_PROMPT, "cache_control": {"type": "ephemeral"}}
            ],
            messages=[{"role": "user", "content": user_msg}],
        )
    except Exception as exc:  # noqa: BLE001 — degradare grațioasă
        return {"available": True, "error": True, "message": f"Apelul AI a eșuat: {exc}"}

    out = _extract_json("".join(b.text for b in resp.content if b.type == "text"))
    html = str(out.get("html", ""))
    css = str(out.get("css", ""))
    js = str(out.get("js", ""))
    note = str(out.get("note", "landing generat"))[:512]

    # Gardian GDPR pe codul generat — reguli deterministe + auditor AI.
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
            verdict = _extract_json("".join(b.text for b in audit.content if b.type == "text"))
            if verdict.get("block"):
                blocked = True
                blocked_by = "auditor AI"
                reason = verdict.get("reason", "Respins de auditorul de conformitate")
        except Exception:  # noqa: BLE001
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
