import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")


class LinkCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=64)
    destination_url: str = Field(min_length=1, max_length=2048)
    name: str = Field(default="", max_length=255)
    description: str = Field(default="", max_length=2000)
    location_label: str = Field(default="", max_length=255)

    @field_validator("slug")
    @classmethod
    def _validate_slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not SLUG_RE.match(v):
            raise ValueError(
                "Slug invalid: doar litere mici, cifre și liniuțe (ex: promo-vara)."
            )
        return v

    @field_validator("destination_url")
    @classmethod
    def _validate_url(cls, v: str) -> str:
        v = v.strip()
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("Destinația trebuie să înceapă cu http:// sau https://")
        return v


class LinkUpdate(BaseModel):
    destination_url: str | None = Field(default=None, max_length=2048)
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    location_label: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None

    @field_validator("destination_url")
    @classmethod
    def _validate_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("Destinația trebuie să înceapă cu http:// sau https://")
        return v


class LinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    destination_url: str
    name: str
    description: str
    location_label: str
    is_active: bool
    created_at: datetime


class LinkWithUrls(LinkOut):
    short_url: str
    qr_url: str
    total_visits: int = 0
