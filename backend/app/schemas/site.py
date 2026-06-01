from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    domain: str = Field(default="", max_length=255)


class SiteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    domain: str | None = Field(default=None, max_length=255)


class SiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    site_key: str
    name: str
    domain: str
    created_at: datetime


class SiteWithSnippet(SiteOut):
    snippet: str
