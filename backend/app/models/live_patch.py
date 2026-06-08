from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LivePatch(Base):
    """O modificare DOM aplicată LIVE de `t.js` pe site-ul clientului (Faza 3).

    DE CE există: în Faza 2 omul edita sursa unui landing GĂZDUIT de noi. Faza 3
    merge mai departe — pagina rămâne pe site-ul clientului, iar `t.js` îi aplică
    în browser o schimbare mică (text/culoare/atribut) fără ca el să atingă codul.
    Modelul „C" din viziune (Optimizely-like), introdus controlat.

    Un patch = O operație pe UN selector. E intenționat granular: patch-uri mici,
    independente, fiecare cu propriul risc și verdict GDPR. Mai multe patch-uri pe
    aceeași pagină se aplică toate (compunere), iar fiecare poate fi pus pe pauză
    individual fără a le atinge pe celelalte.

    POARTA din §9 a viziunii (risc × încredere × gardian GDPR) trăiește aici:
      - `risk`     — derivat din tipul operației (text/culoare = mic; atribut = mediu).
      - `blocked`  — VETO-ul gardianului GDPR; un patch blocat NU poate trece live.
      - `auto_apply` — voie de auto-aplicare DOAR pentru risc mic + neblocat; restul
        cer aprobare umană explicită (toggle-ul e refuzat în router altfel).
    """

    __tablename__ = "live_patches"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Pagina pe care se aplică (pathname, ex: "/oferta"). `t.js` cere patch-urile
    # pentru EXACT acest path. Indexat împreună cu site_id (interogarea publică).
    path: Mapped[str] = mapped_column(String(1024), nullable=False, default="/", index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    # Selectorul CSS al elementului țintă (ex: "#cta", ".hero > button").
    selector: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    # Operația: "text" (schimbă textul) | "style" (o proprietate CSS) | "attr" (un atribut).
    # NU permitem "html" arbitrar: ar fi un vector XSS pe site-ul clientului.
    op: Mapped[str] = mapped_column(String(16), nullable=False, default="text")
    # Pentru "style"/"attr": numele proprietății/atributului (ex: "background-color", "href").
    prop: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # Valoarea nouă (textul, valoarea CSS sau valoarea atributului).
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Riscul schimbării (derivat din `op`): "low" | "medium" | "high".
    risk: Mapped[str] = mapped_column(String(8), nullable=False, default="low")
    # Sursa: "human" (l-ai scris tu) sau "ai" (generat dintr-o recomandare CRO).
    source: Mapped[str] = mapped_column(String(8), nullable=False, default="human")
    # Starea: "draft" (nepublicat) | "live" (servit de t.js) | "paused" (oprit temporar).
    status: Mapped[str] = mapped_column(String(8), nullable=False, default="draft")

    # Auto-aplicare: dacă e True ȘI risc mic ȘI neblocat, patch-ul poate trece live
    # fără re-verificare manuală (partea „auto" a hibridului). Implicit False.
    auto_apply: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # VETO-ul gardianului GDPR pe acest patch (text/cod). Blocat => nu poate fi live.
    blocked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    blocked_reason: Mapped[str] = mapped_column(String(512), nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    site: Mapped["Site"] = relationship()  # noqa: F821
