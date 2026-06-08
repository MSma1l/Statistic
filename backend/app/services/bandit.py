"""Multi-armed bandit (Thompson sampling) + champion-challenger (viziune §6).

Aici stă DECIZIA de alocare a traficului între brațele unui experiment și
calculul statisticilor per braț. Pur calcul, fără HTTP (router-ul îl cheamă).

De ce Thompson sampling: pentru fiecare braț ținem o distribuție Beta peste „rata
lui reală de conversie" (a priori uniformă, actualizată de date). La fiecare
alocare tragem o probă din fiecare distribuție și dăm vizitatorul brațului cu
proba cea mai mare. Efectul emergent e exact champion-challenger: brațul bun
(distribuție îngustă, sus) câștigă majoritatea tragerilor → primește mult trafic;
brațele incerte (distribuție lată) mai câștigă din când în când → rămân explorate.
Nu „irosim" trafic pe split egal și nu declarăm câștigători pe zgomot.

Atribuirea conversiei: prin `visitor_id` (vizitatorul a văzut brațul Y, apoi a
ajuns la o treaptă de conversie), NU prin UTM-ul vreunui event — la fel ca în
funnel-compare (§4 din viziune).
"""

import random

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.app_settings import get_setting
from app.models import (
    Event,
    Experiment,
    ExperimentArm,
    ExperimentAssignment,
    FunnelStep,
    Site,
)
from app.services.scope import since as _since


async def _conversion_steps(site_id: int, db: AsyncSession) -> list[FunnelStep]:
    """Treptele marcate drept conversie pentru site (definiția succesului)."""
    rows = await db.execute(
        select(FunnelStep).where(
            FunnelStep.site_id == site_id, FunnelStep.is_conversion.is_(True)
        )
    )
    return list(rows.scalars().all())


async def _converted_visitors(
    site: Site, since, db: AsyncSession
) -> set[str] | None:
    """Mulțimea `visitor_id` care au CONVERTIT.

    Dacă site-ul are trepte de conversie definite → vizitatorii care au atins
    oricare dintre ele (pagină sau event custom). Altfel, fallback pe „angajat"
    (poarta 1): vizitatori cu timp activ peste pragul site-ului. Întoarce `None`
    dacă nu se poate calcula (n-ar trebui), tratat de apelant ca mulțime goală.
    """
    steps = await _conversion_steps(site.id, db)
    if steps:
        converted: set[str] = set()
        for st in steps:
            if st.kind == "page":
                cond = (Event.type == "pageview") & (Event.path == st.value)
            else:
                cond = (Event.type == "custom") & (
                    (Event.element_text == st.value)
                    | (Event.props["name"].astext == st.value)
                )
            rows = await db.execute(
                select(Event.visitor_id)
                .where(
                    Event.site_id == site.id,
                    Event.created_at >= since,
                    Event.visitor_id != "",
                    cond,
                )
                .distinct()
            )
            converted.update(r[0] for r in rows)
        return converted

    # Fallback: vizitatori angajați (timp activ însumat per vizită peste prag).
    min_ms = site.min_engagement_seconds * 1000
    visit_ms = (
        select(
            Event.visitor_id.label("vid"),
            func.sum(Event.duration_ms).label("ms"),
        )
        .where(
            Event.site_id == site.id,
            Event.created_at >= since,
            Event.type == "engagement",
            Event.duration_ms.isnot(None),
            Event.visitor_id != "",
        )
        .group_by(Event.visitor_id, Event.path)
        .subquery()
    )
    rows = await db.execute(
        select(visit_ms.c.vid).where(visit_ms.c.ms >= min_ms).distinct()
    )
    return {r[0] for r in rows}


async def _arm_raw_stats(
    experiment: Experiment, site: Site, days: int, db: AsyncSession
) -> list[dict]:
    """Per braț: trials (vizitatori alocați) + conversions (dintre ei, câți au convertit)."""
    since = _since(days)
    converted = await _converted_visitors(site, since, db) or set()

    # Toate alocările experimentului: (arm_id, visitor_id).
    rows = await db.execute(
        select(ExperimentAssignment.arm_id, ExperimentAssignment.visitor_id).where(
            ExperimentAssignment.experiment_id == experiment.id
        )
    )
    trials: dict[int, int] = {}
    convs: dict[int, int] = {}
    for arm_id, vid in rows:
        trials[arm_id] = trials.get(arm_id, 0) + 1
        if vid in converted:
            convs[arm_id] = convs.get(arm_id, 0) + 1

    out = []
    for arm in experiment.arms:
        t = trials.get(arm.id, 0)
        c = convs.get(arm.id, 0)
        out.append({"arm_id": arm.id, "trials": t, "conversions": c})
    return out


def _thompson_pick(stats: list[dict]) -> int:
    """Trage o probă Beta(conv+1, fail+1) din fiecare braț; întoarce arm_id-ul câștigător.

    +1/+1 = a priori uniform (Beta(1,1)): un braț fără date e tratat optimist, deci
    explorat. Pe măsură ce se string date, distribuția se îngustează în jurul ratei reale.
    """
    best_theta = -1.0
    best_arm = stats[0]["arm_id"]
    for s in stats:
        a = s["conversions"] + 1
        b = (s["trials"] - s["conversions"]) + 1
        theta = random.betavariate(a, b)
        if theta > best_theta:
            best_theta = theta
            best_arm = s["arm_id"]
    return best_arm


async def choose_arm(experiment: Experiment, site: Site, db: AsyncSession) -> ExperimentArm:
    """Decide ce braț primește un vizitator NOU (bandit). Brațele se iau din relația."""
    stats = await _arm_raw_stats(experiment, site, 90, db)
    arm_id = _thompson_pick(stats)
    return next(a for a in experiment.arms if a.id == arm_id)


def _allocation_estimate(stats: list[dict], samples: int = 800) -> dict[int, float]:
    """Estimează (Monte Carlo) ce procent din traficul VIITOR ar primi fiecare braț
    sub politica Thompson curentă — adică „cât de des e ales câștigător". E doar
    pentru afișare în UI (cât trafic curge spre campion vs provocatori)."""
    wins: dict[int, int] = {s["arm_id"]: 0 for s in stats}
    for _ in range(samples):
        best_theta = -1.0
        best_arm = stats[0]["arm_id"]
        for s in stats:
            theta = random.betavariate(
                s["conversions"] + 1, (s["trials"] - s["conversions"]) + 1
            )
            if theta > best_theta:
                best_theta = theta
                best_arm = s["arm_id"]
        wins[best_arm] += 1
    return {arm_id: round(100 * w / samples) for arm_id, w in wins.items()}


async def experiment_stats(
    experiment: Experiment, site: Site, days: int, db: AsyncSession
) -> dict:
    """Tabloul complet pentru UI: per braț trials/conversii/rată + alocare + campion."""
    raw = await _arm_raw_stats(experiment, site, days, db)
    alloc = _allocation_estimate(raw)

    min_trials = await get_setting(db, "analytics.min_sessions") or 0
    min_conv = await get_setting(db, "analytics.min_conversions") or 0

    by_id = {a.id: a for a in experiment.arms}
    arms_out = []
    for s in raw:
        arm = by_id[s["arm_id"]]
        t, c = s["trials"], s["conversions"]
        enough = t >= min_trials and c >= min_conv
        arms_out.append(
            {
                "arm_id": arm.id,
                "name": arm.name,
                "is_control": arm.is_control,
                "patch": None
                if arm.is_control
                else {"selector": arm.selector, "op": arm.op, "prop": arm.prop, "value": arm.value},
                "trials": t,
                "conversions": c,
                "conversion_rate": round(100 * c / t, 1) if t else 0,
                "allocation_pct": alloc.get(arm.id, 0),
                "enough_data": enough,
                "confidence": "ok" if enough else "low",
            }
        )

    # Campionul = cea mai bună rată DINTRE brațele cu destule date (nu pe zgomot).
    eligible = [a for a in arms_out if a["enough_data"]]
    champion = (
        max(eligible, key=lambda a: a["conversion_rate"])["arm_id"] if eligible else None
    )
    for a in arms_out:
        a["is_champion"] = a["arm_id"] == champion

    arms_out.sort(key=lambda a: a["conversion_rate"], reverse=True)
    return {
        "id": experiment.id,
        "path": experiment.path,
        "name": experiment.name,
        "status": experiment.status,
        "days": days,
        "thresholds": {"min_trials": min_trials, "min_conversions": min_conv},
        "arms": arms_out,
        "champion_arm_id": champion,
    }
