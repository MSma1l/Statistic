from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LandingCreate(BaseModel):
    """Crearea unui landing nou + prima versiune (sursa pe care o aduci în sistem)."""

    path: str = Field(min_length=1, max_length=1024)
    label: str = Field(default="", max_length=255)
    html: str = Field(default="", max_length=500_000)
    css: str = Field(default="", max_length=200_000)
    js: str = Field(default="", max_length=200_000)


class LandingUpdate(BaseModel):
    path: str | None = Field(default=None, min_length=1, max_length=1024)
    label: str | None = Field(default=None, max_length=255)


class VersionCreate(BaseModel):
    """O versiune scrisă/editată de OM („dau versiunea mea")."""

    html: str = Field(default="", max_length=500_000)
    css: str = Field(default="", max_length=200_000)
    js: str = Field(default="", max_length=200_000)
    note: str = Field(default="", max_length=512)


class GenerateRequest(BaseModel):
    """Cerere către AI: aplică o recomandare pe versiunea curentă a landing-ului."""

    # Recomandarea concretă (problemă + ce să facă) — vine din ai-analyze sau scrisă de tine.
    instruction: str = Field(min_length=1, max_length=4000)


class VersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    version_no: int
    source: str
    note: str
    status: str
    blocked: bool
    blocked_reason: str
    created_at: datetime


class LandingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    path: str
    label: str
    published_version_id: int | None
