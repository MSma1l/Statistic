from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Event(Base):
    """Un eveniment trimis de tracker (pageview / click / scroll / custom)."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"), index=True, nullable=False
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False)  # pageview/click/scroll/custom
    path: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    referrer: Mapped[str] = mapped_column(String(1024), nullable=False, default="")

    # Detalii pentru click / heatmap
    element_selector: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    element_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    x_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    y_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    viewport_w: Mapped[int | None] = mapped_column(Integer, nullable=True)
    viewport_h: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scroll_depth: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Identificare anonimă
    visitor_id: Mapped[str] = mapped_column(String(64), nullable=False, default="", index=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    user_agent: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    device_type: Mapped[str] = mapped_column(String(32), nullable=False, default="")

    props: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    site: Mapped["Site"] = relationship(back_populates="events")  # noqa: F821

    __table_args__ = (
        Index("ix_events_site_created", "site_id", "created_at"),
        Index("ix_events_site_path", "site_id", "path"),
        Index("ix_events_site_type", "site_id", "type"),
    )
