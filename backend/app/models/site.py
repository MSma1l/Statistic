import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
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
