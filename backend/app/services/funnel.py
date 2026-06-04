"""Logica pâlniei comparative (Faza 0) — pur calcul, fără HTTP.

Separat de router (`api/optimization.py`) ca să fie testabil și mic: aici stă DOAR
„cum se calculează pâlnia", nu „cum o expun pe web". Router-ul cheamă
`funnel_compare(...)` și serializează rezultatul.

Atribuirea conversiei la grup se face prin `session_id` (vizitatorul e legat de
landing-ul/campania PRIMULUI său event), nu prin UTM-ul de pe eventul de conversie
— vezi §4 din docs/AB-MARKETING-AI-VISION.md.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.app_settings import get_setting
from app.models import Event, FunnelStep, Site
from app.services.scope import since as _since


async def funnel_steps(site_id: int, db: AsyncSession) -> list[FunnelStep]:
    """Treptele unui site, ordonate după poziție."""
    rows = await db.execute(
        select(FunnelStep)
        .where(FunnelStep.site_id == site_id)
        .order_by(FunnelStep.position)
    )
    return list(rows.scalars().all())


async def _group_of_session(
    site_id: int, since, group_by: str, db: AsyncSession
) -> dict[str, str]:
    """Maparea sesiune -> grup, din PRIMUL event al fiecărei sesiuni.

    DISTINCT ON (session_id) + ORDER BY created_at => primul event în timp, exact
    ca în endpoint-ul `sessions`. Grupul e landing-ul (path) sau campania (utm).
    """
    rows = await db.execute(
        select(Event.session_id, Event.path, Event.utm_campaign)
        .distinct(Event.session_id)
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.session_id != "",
        )
        .order_by(Event.session_id, Event.created_at)
    )
    out: dict[str, str] = {}
    for r in rows:
        if group_by == "campaign":
            out[r.session_id] = r.utm_campaign or "(fără campanie)"
        else:
            out[r.session_id] = r.path or "/"
    return out


async def _active_ms_by_session(
    site_id: int, since, min_ms: int, db: AsyncSession
) -> dict[str, int]:
    """Timp activ per sesiune, DOAR pentru sesiunile angajate (poarta 1).

    Adunăm delta-urile de engagement per vizită (sesiune+pagină), păstrăm vizitele
    peste prag, apoi însumăm pe sesiune. Cheile dict-ului = sesiunile angajate.
    """
    visit_ms = (
        select(
            Event.session_id.label("sid"),
            func.sum(Event.duration_ms).label("ms"),
        )
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "engagement",
            Event.duration_ms.isnot(None),
            Event.session_id != "",
        )
        .group_by(Event.session_id, Event.path)
        .subquery()
    )
    rows = await db.execute(
        select(visit_ms.c.sid, func.sum(visit_ms.c.ms))
        .where(visit_ms.c.ms >= min_ms)
        .group_by(visit_ms.c.sid)
    )
    return {r[0]: r[1] for r in rows}


async def _pageviews_by_session(site_id: int, since, db: AsyncSession) -> dict[str, int]:
    rows = await db.execute(
        select(Event.session_id, func.count().label("pv"))
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "pageview",
            Event.session_id != "",
        )
        .group_by(Event.session_id)
    )
    return {r.session_id: r.pv for r in rows}


async def _max_scroll_by_session(site_id: int, since, db: AsyncSession) -> dict[str, int]:
    rows = await db.execute(
        select(Event.session_id, func.max(Event.scroll_depth).label("d"))
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.type == "scroll",
            Event.scroll_depth.isnot(None),
            Event.session_id != "",
        )
        .group_by(Event.session_id)
    )
    return {r.session_id: r.d for r in rows}


async def _sessions_reaching_step(
    site_id: int, since, step: FunnelStep, db: AsyncSession
) -> set[str]:
    """Sesiunile care au atins o treaptă.

    page         => pageview cu path-ul respectiv;
    custom_event => event custom al cărui NUME se potrivește. Acceptăm DOUĂ locuri
                    pentru nume, ca să fie robust:
                      - `element_text` — unde îl pune `window.statistic("buy")` în t.js;
                      - `props.name`   — convenția alternativă din brief (props.name == "buy").
                    Astfel funcționează indiferent cum a fost trimis eventul.
    """
    if step.kind == "page":
        cond = (Event.type == "pageview") & (Event.path == step.value)
    else:
        cond = (Event.type == "custom") & (
            (Event.element_text == step.value)
            | (Event.props["name"].astext == step.value)
        )
    rows = await db.execute(
        select(Event.session_id)
        .where(
            Event.site_id == site_id,
            Event.created_at >= since,
            Event.session_id != "",
            cond,
        )
        .distinct()
    )
    return {r[0] for r in rows}


def _build_group(steps_count: int) -> dict:
    """Acumulatorul gol pentru un grup (zerouri pe toate metricile)."""
    return {
        "entries": 0,
        "engaged": 0,
        "steps": [0] * steps_count,
        "conversions": 0,
        "bounced": 0,
        "active_ms_sum": 0,
        "engaged_count": 0,
        "scroll_sum": 0,
        "scroll_count": 0,
    }


async def funnel_compare(
    site: Site, days: int, group_by: str, db: AsyncSession
) -> dict:
    """Pâlnia comparativă per grup + metrici de calitate + flag de încredere.

    Pași: tragem câteva agregate simple din DB (pe sesiune), apoi le îmbinăm în
    Python pe `session_id`. Numărul de interogări e mic și constant (+1 pe treaptă).
    """
    site_id = site.id
    s = _since(days)
    min_ms = site.min_engagement_seconds * 1000
    steps = await funnel_steps(site_id, db)

    group_of = await _group_of_session(site_id, s, group_by, db)
    active_by_session = await _active_ms_by_session(site_id, s, min_ms, db)
    pv_by_session = await _pageviews_by_session(site_id, s, db)
    scroll_by_session = await _max_scroll_by_session(site_id, s, db)
    step_sessions = [await _sessions_reaching_step(site_id, s, st, db) for st in steps]
    conv_idx = [i for i, st in enumerate(steps) if st.is_conversion]

    # Agregare per grup.
    groups: dict[str, dict] = {}
    for sid, g in group_of.items():
        d = groups.setdefault(g, _build_group(len(steps)))
        d["entries"] += 1
        engaged = sid in active_by_session
        if engaged:
            d["engaged"] += 1
            d["active_ms_sum"] += active_by_session[sid]
            d["engaged_count"] += 1
        # Bounce: o singură pagină ȘI neangajat (a plecat repede), ca în `summary`.
        if pv_by_session.get(sid, 0) == 1 and not engaged:
            d["bounced"] += 1
        if sid in scroll_by_session:
            d["scroll_sum"] += scroll_by_session[sid]
            d["scroll_count"] += 1
        for i in range(len(steps)):
            if sid in step_sessions[i]:
                d["steps"][i] += 1
        # Conversie = a atins orice treaptă marcată conversie; dacă nu există nicio
        # astfel de treaptă, conversia = engagement (poarta 1) — fallback-ul.
        converted = (
            any(sid in step_sessions[i] for i in conv_idx) if conv_idx else engaged
        )
        if converted:
            d["conversions"] += 1

    # Praguri „destule date" (editabile din admin) => confidence + winner.
    min_sessions = await get_setting(db, "analytics.min_sessions") or 0
    min_conversions = await get_setting(db, "analytics.min_conversions") or 0

    out_groups = [
        _serialize_group(g, d, steps, min_sessions, min_conversions)
        for g, d in groups.items()
    ]
    out_groups.sort(key=lambda x: x["conversions"], reverse=True)

    # Câștigătorul = cea mai bună rată DINTRE grupurile cu destule date (nu pe zgomot).
    eligible = [g for g in out_groups if g["enough_data"]]
    winner = (
        max(eligible, key=lambda x: x["conversion_rate"])["group"] if eligible else None
    )

    return {
        "group_by": group_by,
        "days": days,
        "min_engagement_seconds": site.min_engagement_seconds,
        "has_conversion_step": bool(conv_idx),
        "thresholds": {"min_sessions": min_sessions, "min_conversions": min_conversions},
        "funnel_steps": [_step_meta(s) for s in steps],
        "groups": out_groups,
        "winner": winner,
    }


def _step_meta(st: FunnelStep) -> dict:
    return {
        "label": st.label or st.value,
        "kind": st.kind,
        "value": st.value,
        "is_conversion": st.is_conversion,
    }


def _serialize_group(
    name: str, d: dict, steps: list[FunnelStep], min_sessions, min_conversions
) -> dict:
    """Transformă acumulatorul brut într-un rând gata de afișat (rate, %, confidence)."""
    entries = d["entries"]
    conv = d["conversions"]
    enough = entries >= min_sessions and conv >= min_conversions

    step_out = []
    prev = entries
    for i, st in enumerate(steps):
        reached = d["steps"][i]
        step_out.append(
            {
                **_step_meta(st),
                "reached": reached,
                "pct_of_entries": round(100 * reached / entries) if entries else 0,
                "pct_of_prev": round(100 * reached / prev) if prev else 0,
            }
        )
        prev = reached

    return {
        "group": name,
        "entries": entries,
        "engaged": d["engaged"],
        "engaged_pct": round(100 * d["engaged"] / entries) if entries else 0,
        "steps": step_out,
        "conversions": conv,
        "conversion_rate": round(100 * conv / entries, 1) if entries else 0,
        "bounce_rate": round(100 * d["bounced"] / entries) if entries else 0,
        "avg_active_seconds": round(d["active_ms_sum"] / d["engaged_count"] / 1000)
        if d["engaged_count"]
        else 0,
        "avg_scroll": round(d["scroll_sum"] / d["scroll_count"])
        if d["scroll_count"]
        else 0,
        "enough_data": enough,
        "confidence": "ok" if enough else "low",
    }
