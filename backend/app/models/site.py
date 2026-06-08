import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _gen_site_id() -> str:
    return uuid.uuid4().hex


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Cheia publică de scriere folosită în snippetul pixel (data-site)
    site_key: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, default=_gen_site_id, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # Prag de „atenție reală": vizitele cu timp activ sub atâtea secunde nu se
    # numără la timpul mediu / engagement (filtrează atingerile accidentale).
    # Configurabil din interfață. Aplicat la interogare => retroactiv.
    min_engagement_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=5, server_default="5"
    )
    # --- GDPR platformă (Nivel 1 din viziune) ---
    # Dacă True, snippetul poartă `data-consent="required"`, iar t.js NU urmărește
    # nimic până nu primește consimțământ explicit (window.statistic.consent('grant')).
    consent_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Retenția evenimentelor BRUTE în zile. 0 = păstrează la nesfârșit. Jobul de
    # retenție șterge evenimentele mai vechi de atât (agregatele deja calculate rămân).
    retention_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    owner: Mapped["User"] = relationship(back_populates="sites")  # noqa: F821
    events: Mapped[list["Event"]] = relationship(  # noqa: F821
        back_populates="site", cascade="all, delete-orphan"
    )
