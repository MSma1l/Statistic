from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AppSetting(Base):
    """Setare globală editabilă din interfața de admin (cheie → valoare JSON).

    DE CE în DB și nu în `.env`: prompturile AI (advisor + gardian GDPR),
    catalogul de reguli GDPR și pragurile statistice trebuie să fie modificabile
    DIN BROWSER, fără redeploy/restart. `.env` rămâne doar pentru secrete și
    pentru valorile pe care nu le schimbi la cald (`ANTHROPIC_API_KEY`, `AI_MODEL`).

    Valoarea e stocată ca JSON (text). Așa o cheie poate ține deopotrivă un șir
    (un prompt), un număr (un prag) sau o listă (regulile GDPR) — fără să schimbăm
    schema când adăugăm o setare nouă. E modelul „scalabil" cerut: o setare nouă =
    o cheie nouă, nimic de migrat.
    """

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    # JSON serializat. Citit/parsat prin helperele din `app.core.app_settings`.
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
