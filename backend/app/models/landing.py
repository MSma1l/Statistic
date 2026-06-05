from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LandingPage(Base):
    """Un landing găzduit de Statistic, identificat prin (site, path).

    DE CE găzduim sursa aici: ca AI-ul să poată „chiar aplica" o îmbunătățire,
    pagina trebuie să existe undeva editabil. O ținem în Statistic (HTML/CSS/JS),
    o versionăm, iar versiunea APROBATĂ e servită public la `path` → clientul vede
    automat varianta nouă, mai bună. (Modelul B + buclă de aprobare din viziune.)

    `published_version_id` e un simplu Integer (nu FK) ca să evităm dependența
    circulară de creare a tabelelor (landing ↔ version se referă reciproc).
    """

    __tablename__ = "landing_pages"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Path-ul public la care e servit (ex: "/oferta"). Unic per site.
    path: Mapped[str] = mapped_column(String(1024), nullable=False, default="/")
    label: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # Versiunea curent publicată (cea servită clientului). Null => nimic publicat.
    published_version_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    versions: Mapped[list["LandingVersion"]] = relationship(
        back_populates="landing", cascade="all, delete-orphan"
    )


class LandingVersion(Base):
    """O versiune a unui landing (istoricul e păstrat — nimic nu se pierde).

    Sursa unei versiuni poate fi:
      - "human" — ai scris/editat tu codul;
      - "ai"    — AI-ul a generat-o dintr-o recomandare (apoi o aprobi/editezi).

    `status`: draft (propunere, nepublicată) | published (servită) | archived.
    `blocked` marchează versiunile AI respinse de gardianul GDPR — rămân vizibile
    cu motivul, dar NU pot fi publicate.
    """

    __tablename__ = "landing_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    landing_id: Mapped[int] = mapped_column(
        ForeignKey("landing_pages.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    html: Mapped[str] = mapped_column(Text, nullable=False, default="")
    css: Mapped[str] = mapped_column(Text, nullable=False, default="")
    js: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="human")
    # Scurtă descriere a schimbării (ex: „CTA mutat deasupra fold-ului").
    note: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    # Veto-ul gardianului GDPR pe codul generat.
    blocked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    blocked_reason: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    landing: Mapped["LandingPage"] = relationship(back_populates="versions")
