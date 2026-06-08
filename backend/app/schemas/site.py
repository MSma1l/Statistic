from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    domain: str = Field(default="", max_length=255)


class SiteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    domain: str | None = Field(default=None, max_length=255)
    # Prag de timp activ minim (secunde) sub care vizita nu se ia în calcul.
    min_engagement_seconds: int | None = Field(default=None, ge=0, le=600)
    # GDPR: cere consimțământ înainte de tracking + retenția evenimentelor (zile, 0=la nesfârșit).
    consent_required: bool | None = None
    retention_days: int | None = Field(default=None, ge=0, le=3650)


class SiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    site_key: str
    name: str
    domain: str
    min_engagement_seconds: int
    consent_required: bool
    retention_days: int
    created_at: datetime


class SiteWithSnippet(SiteOut):
    snippet: str
