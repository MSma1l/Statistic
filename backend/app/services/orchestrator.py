"""Orchestrare multi-agent: un „agent" AI per landing, în paralel (viziune §6.3).

Ce e un „agent" aici: NU o infrastructură specială, ci pur și simplu un apel către
Claude API (`analyze_landing`) focusat pe UN singur landing. „Multi-agent" =
rulăm N astfel de apeluri SIMULTAN (`asyncio.gather`), apoi o etapă de SINTEZĂ le
clasează după oportunitate. E mult mai rapid decât secvențial (latența unui apel
AI domină) și ține fiecare analiză îngustă și ancorată în datele landing-ului ei.

ATENȚIE la sesiuni: un `AsyncSession` NU e safe la apeluri concurente. De aceea
fiecare agent își deschide PROPRIA sesiune din `AsyncSessionLocal`, iar o semafor
limitează câți agenți lovesc deodată DB-ul + API-ul (pool-ul are 10+20 conexiuni,
iar API-ul Anthropic are rate-limit — nu vrem 25 de apeluri în aceeași milisecundă).
"""

import asyncio

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import Event, Site
from app.services.aggregates import aggregates_for_path
from app.services.ai_advisor import analyze_landing
from app.services.funnel import funnel_compare
from app.services.scope import since as _since

# Câți agenți rulează simultan. Mic intenționat: respectă pool-ul DB și rate-limit-ul
# API; restul așteaptă la coadă și pornesc pe măsură ce se eliberează sloturi.
_CONCURRENCY = 6
# Câte landinguri analizăm într-o rulare (cele mai vizitate). Plafon de cost/timp.
_MAX_LANDINGS = 12

# Greutăți de severitate pentru scorul de oportunitate (câte îmbunătățiri reale are).
_SEVERITY_WEIGHT = {"high": 3, "medium": 2, "low": 1}


async def _top_landings(site_id: int, since, db: AsyncSession, limit: int) -> list[str]:
    """Cele mai vizitate pagini ale site-ului = landingurile de optimizat."""
    rows = await db.execute(
        select(Event.path, func.count().label("v"))
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "pageview",
        )
        .group_by(Event.path)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return [r.path for r in rows]


async def _agent(
    site: Site, path: str, days: int, funnel_group: dict | None, funnel_steps: list, sem: asyncio.Semaphore
) -> dict:
    """Un agent = analiza AI a UNUI landing, cu sesiune proprie (concurent-safe).

    `site` e folosit doar pentru atribute deja încărcate (id, prag engagement) —
    nu accesăm relații, deci e sigur și pe un obiect provenit din altă sesiune.
    """
    async with sem:
        async with AsyncSessionLocal() as db:
            aggregates = await aggregates_for_path(site, path, days, db)
            report = await analyze_landing(
                db,
                {
                    "path": path,
                    "days": days,
                    "funnel": funnel_group,
                    "funnel_steps": funnel_steps,
                    **aggregates,
                },
            )

    recs = report.get("recommendations", []) if isinstance(report, dict) else []
    # Scorul de oportunitate = suma severităților recomandărilor NEblocate de gardian.
    # Mai multe îmbunătățiri reale (și mai grave) => landing-ul urcă în clasament.
    score = sum(
        _SEVERITY_WEIGHT.get(r.get("severity", "low"), 1)
        for r in recs
        if not r.get("blocked")
    )
    return {
        "path": path,
        "conversion_rate": (funnel_group or {}).get("conversion_rate"),
        "confidence": (funnel_group or {}).get("confidence"),
        "opportunity_score": score,
        "recommendation_count": sum(1 for r in recs if not r.get("blocked")),
        "blocked_count": sum(1 for r in recs if r.get("blocked")),
        "report": report,
    }


async def optimize_site(site: Site, days: int, db: AsyncSession) -> dict:
    """Rulează un agent per landing (în paralel) + clasare după oportunitate.

    Întoarce un raport gata de afișat/stocat. Dacă AI e dezactivat (fără cheie),
    fiecare agent întoarce `available=False` — raportul iese, dar fără recomandări.
    """
    s = _since(days)
    paths = await _top_landings(site.id, s, db, _MAX_LANDINGS)

    # Pâlnia comparativă o calculăm O SINGURĂ DATĂ (în sesiunea curentă), apoi
    # dăm fiecărui agent grupul lui — evităm să recalculăm compararea de N ori.
    compare = await funnel_compare(site, days, "landing", db)
    cmap = {g["group"]: g for g in compare["groups"]}
    funnel_steps = compare["funnel_steps"]

    if not paths:
        return {"days": days, "landing_count": 0, "ranking": [], "ai_available": True}

    sem = asyncio.Semaphore(_CONCURRENCY)
    results = await asyncio.gather(
        *[_agent(site, p, days, cmap.get(p), funnel_steps, sem) for p in paths]
    )

    # Sinteză: clasăm landingurile după oportunitate (descrescător).
    results.sort(key=lambda r: r["opportunity_score"], reverse=True)
    ai_available = any(
        isinstance(r["report"], dict) and r["report"].get("available") for r in results
    )
    return {
        "days": days,
        "landing_count": len(results),
        "ai_available": ai_available,
        "ranking": results,
    }
