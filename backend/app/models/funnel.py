from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FunnelStep(Base):
    """O treaptă din pâlnia de conversie definită per site.

    DE CE un tabel separat (și nu coloane pe `sites`): pâlnia are un număr
    VARIABIL de trepte (`/landing → /produs → /cos → /multumim`), iar fiecare
    site își definește alta. Un tabel 1-la-mulți modelează asta natural și e
    ușor de extins (adaugi o treaptă = un rând nou), fără a schimba schema.

    Cele 3 definiții de conversie din viziune se mapează aici așa:
      - „atingere pagină"  → kind="page",         value="/multumim"
      - „event custom"     → kind="custom_event", value="buy"
      - „engagement"       → NU e o treaptă; e poarta 1 implicită (pragul
        `Site.min_engagement_seconds`, calculat ca până acum). E fallback-ul
        când site-ul n-a definit nicio treaptă marcată drept conversie.
    """

    __tablename__ = "funnel_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Ordinea treptei în pâlnie (0, 1, 2…). Determină succesiunea afișată și
    # calculul ratelor de trecere între trepte.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # "page" (atingerea unui path) sau "custom_event" (un event `window.statistic`).
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="page")
    # Pentru "page": path-ul (ex: "/multumim"). Pentru "custom_event": NUMELE
    # eventului — care în t.js ajunge în `Event.element_text` (vezi `window.statistic`),
    # NU în `props`. De aceea potrivirea se face pe `element_text`.
    value: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    label: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # Marchează treptele care înseamnă „conversie finală". Combinabile: dacă
    # vizitatorul atinge ORICARE treaptă cu is_conversion=True, e considerat
    # convertit (ex: a cumpărat = a atins /multumim SAU a dat eventul "buy").
    is_conversion: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    site: Mapped["Site"] = relationship()  # noqa: F821
