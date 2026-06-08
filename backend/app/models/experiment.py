from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Experiment(Base):
    """Un test A/B cu alocare prin multi-armed bandit (viziune §6).

    DE CE bandit și nu split egal: cu ~25 de landinguri, split-ul egal irosește
    jumătate din trafic pe variante clar slabe. Banditul trimite DINAMIC mai mult
    trafic spre ce convertește bine (campionul), dar continuă să exploreze restul
    (provocatorii) — champion-challenger, nu all-vs-all.

    Un experiment trăiește pe O pagină (site + path) și are mai multe BRAȚE
    (`ExperimentArm`): un „control" (pagina neatinsă) + variante (fiecare = un patch
    DOM, ca în Faza 3). Vizitatorul primește un braț o singură dată (sticky, prin
    `ExperimentAssignment`), ca să nu „pâlpâie" între variante la fiecare vizită.
    """

    __tablename__ = "experiments"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"), index=True, nullable=False
    )
    path: Mapped[str] = mapped_column(String(1024), nullable=False, default="/", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # "running" (alocă trafic) | "stopped" (oprit; t.js nu mai cere brațe).
    status: Mapped[str] = mapped_column(String(8), nullable=False, default="stopped")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    arms: Mapped[list["ExperimentArm"]] = relationship(
        back_populates="experiment", cascade="all, delete-orphan"
    )


class ExperimentArm(Base):
    """Un braț al experimentului = o variantă a paginii.

    `is_control=True` → pagina neatinsă (referința). Restul brațelor definesc un
    patch DOM (același vocabular ca Faza 3: selector + op text|style|attr). Banditul
    compară fiecare braț cu campionul pe rata de conversie.
    """

    __tablename__ = "experiment_arms"

    id: Mapped[int] = mapped_column(primary_key=True)
    experiment_id: Mapped[int] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    is_control: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Patch-ul aplicat de t.js când vizitatorul nimerește acest braț (gol la control).
    selector: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    op: Mapped[str] = mapped_column(String(16), nullable=False, default="text")
    prop: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")

    experiment: Mapped["Experiment"] = relationship(back_populates="arms")


class ExperimentAssignment(Base):
    """Legătura sticky vizitator -> braț. Asigură o experiență stabilă și e baza
    atribuirii conversiei (vizitatorul X a văzut brațul Y, apoi a convertit sau nu).

    Cheia unică (experiment, visitor) garantează un singur braț per vizitator.
    """

    __tablename__ = "experiment_assignments"
    __table_args__ = (
        UniqueConstraint("experiment_id", "visitor_id", name="uq_assignment_visitor"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    experiment_id: Mapped[int] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    arm_id: Mapped[int] = mapped_column(
        ForeignKey("experiment_arms.id", ondelete="CASCADE"), index=True, nullable=False
    )
    visitor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
