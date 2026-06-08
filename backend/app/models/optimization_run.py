from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OptimizationRun(Base):
    """O rulare a orchestratorului (multi-agent) — manuală sau programată.

    Păstrăm rezultatul (clasamentul + recomandările) ca JSON, ca să-l poți reciti
    mai târziu fără să consumi din nou tokeni AI. `trigger` distinge butonul
    „optimizează acum" de jobul săptămânal. Așa ai și un ISTORIC al optimizărilor.
    """

    __tablename__ = "optimization_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # "manual" (buton) | "scheduled" (job săptămânal).
    trigger: Mapped[str] = mapped_column(String(16), nullable=False, default="manual")
    days: Mapped[int] = mapped_column(nullable=False, default=30)
    landing_count: Mapped[int] = mapped_column(nullable=False, default=0)
    # Raportul complet serializat JSON (clasament + recomandări per landing).
    payload: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
