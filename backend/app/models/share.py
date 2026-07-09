from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ResourceShare(Base):
    """Partajarea unei resurse (site sau link) cu un alt utilizator.

    Un rând = „resursa X e vizibilă pentru userul U". `can_edit` decide dacă
    userul poate doar vedea sau și edita. Ștergerea/re-partajarea rămân doar
    la owner sau admin.
    """

    __tablename__ = "resource_shares"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Tipul resursei partajate: "site" sau "link".
    resource_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # ID-ul resursei (sites.id sau tracked_links.id, în funcție de tip).
    resource_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # Userul cu care se partajează. La ștergerea userului, share-ul dispare.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    can_edit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # Un singur share per (resursă, user) — evită duplicatele.
        UniqueConstraint(
            "resource_type",
            "resource_id",
            "user_id",
            name="uq_resource_share",
        ),
        # Căutări rapide: „ce mi s-a partajat mie" și „cine are acces la resursă".
        Index("ix_resource_shares_user", "user_id"),
        Index("ix_resource_shares_resource", "resource_type", "resource_id"),
    )
