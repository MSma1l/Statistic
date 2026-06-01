from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TrackedLink(Base):
    """Un link scurt / QR cu slug permanent și destinație editabilă."""

    __tablename__ = "tracked_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    destination_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    location_label: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # Tipul ales la creare: "link" sau "qr" (organizatoric; ambele au și link, și QR)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="link")
    # Logo opțional pentru centrul QR-ului (din galeria personală)
    logo_image_id: Mapped[int | None] = mapped_column(
        ForeignKey("gallery_images.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    owner: Mapped["User"] = relationship(back_populates="links")  # noqa: F821
    visits: Mapped[list["LinkVisit"]] = relationship(
        back_populates="link", cascade="all, delete-orphan"
    )


class LinkVisit(Base):
    """O vizită (click pe link sau scanare QR)."""

    __tablename__ = "link_visits"

    id: Mapped[int] = mapped_column(primary_key=True)
    link_id: Mapped[int] = mapped_column(
        ForeignKey("tracked_links.id", ondelete="CASCADE"), index=True, nullable=False
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="link")  # link | qr
    referrer: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    user_agent: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    device_type: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    ip_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    link: Mapped["TrackedLink"] = relationship(back_populates="visits")

    __table_args__ = (Index("ix_visits_link_created", "link_id", "created_at"),)
