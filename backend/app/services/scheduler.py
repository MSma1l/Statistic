"""Jobul programat de optimizare (cadența săptămânală din viziune §6.2).

E declanșatorul AUTOMAT al aceleiași rutine ca butonul „optimizează acum": rulează
orchestratorul multi-agent pentru fiecare site și stochează rezultatul ca rulare
`scheduled`. Un task de fundal pornit la startup verifică periodic dacă a venit
momentul (`acum - ultima rulare >= interval`).

DE CE OFF implicit: rularea cheamă AI-ul pentru fiecare landing al fiecărui site —
consumă tokeni. Nu vrem surprize pe factură: adminul îl pornește explicit din
„AI & GDPR" (`optimizer.weekly_enabled`). Fără `ANTHROPIC_API_KEY` nu rulează deloc.

Alternativă de producție (mai robustă decât un task in-process care moare la restart):
un cron extern sau skill-ul `/schedule` care lovește periodic `POST .../optimize-now`.
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.config import settings as cfg
from app.core.app_settings import get_setting
from app.database import AsyncSessionLocal
from app.models import Event, OptimizationRun, Site
from app.services.orchestrator import optimize_site

# Cât de des se TREZEȘTE task-ul ca să verifice dacă a venit momentul rulării.
# Mic față de interval (ore): verificarea e ieftină (câteva interogări).
_CHECK_SECONDS = 1800  # 30 min


async def _last_scheduled_run() -> datetime | None:
    """Momentul ultimei rulări AUTOMATE (oricare site) — baza deciziei „a trecut intervalul?"."""
    async with AsyncSessionLocal() as db:
        return await db.scalar(
            select(OptimizationRun.created_at)
            .where(OptimizationRun.trigger == "scheduled")
            .order_by(OptimizationRun.created_at.desc())
            .limit(1)
        )


async def _run_all_sites(days: int = 30) -> int:
    """Rulează orchestratorul pentru fiecare site și stochează rulările. Întoarce nr. de site-uri."""
    async with AsyncSessionLocal() as db:
        sites = list((await db.execute(select(Site))).scalars().all())

    for site in sites:
        # Sesiune proprie per site (orchestratorul lansează la rândul lui agenți
        # cu sesiuni separate — nu împărțim un AsyncSession între task-uri concurente).
        async with AsyncSessionLocal() as db:
            try:
                result = await optimize_site(site, days, db)
                db.add(
                    OptimizationRun(
                        site_id=site.id,
                        trigger="scheduled",
                        days=days,
                        landing_count=result["landing_count"],
                        payload=json.dumps(result, ensure_ascii=False),
                    )
                )
                await db.commit()
            except Exception:  # noqa: BLE001 — un site care pică nu oprește restul
                await db.rollback()
    return len(sites)


async def _maybe_run() -> None:
    """Verifică setările + intervalul; rulează doar dacă e cazul."""
    async with AsyncSessionLocal() as db:
        enabled = await get_setting(db, "optimizer.weekly_enabled")
        interval_h = await get_setting(db, "optimizer.interval_hours") or 168

    if not enabled or not cfg.ai_enabled:
        return

    last = await _last_scheduled_run()
    if last is not None:
        now = datetime.now(timezone.utc)
        # `created_at` vine cu timezone din DB; normalizăm dacă e naiv.
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if now - last < timedelta(hours=float(interval_h)):
            return  # încă n-a trecut intervalul

    await _run_all_sites()


async def _retention_pass() -> None:
    """GDPR retenție (§10 Nivel 1): șterge evenimentele brute mai vechi decât pragul
    fiecărui site. Rulează MEREU (nu ține de AI) — e o obligație legală, nu o opțiune.
    Sitele cu `retention_days=0` păstrează la nesfârșit (nu le atingem)."""
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(Site.id, Site.retention_days).where(Site.retention_days > 0)
            )
        ).all()
        for site_id, days in rows:
            cutoff = datetime.now(timezone.utc) - timedelta(days=int(days))
            await db.execute(
                delete(Event).where(
                    Event.site_id == site_id, Event.created_at < cutoff
                )
            )
        await db.commit()


async def scheduler_loop() -> None:
    """Bucla de fundal: se trezește periodic, aplică retenția și rulează jobul de
    optimizare dacă e momentul.

    Pornită din `lifespan` la startup și anulată la shutdown. Orice eroare e
    înghițită (nu vrem ca o rulare picată să omoare bucla)."""
    while True:
        try:
            await _retention_pass()
            await _maybe_run()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(_CHECK_SECONDS)
