from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ShareCreate(BaseModel):
    resource_type: str
    resource_id: int
    user_id: int
    can_edit: bool = False

    @field_validator("resource_type")
    @classmethod
    def _validate_type(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in ("site", "link"):
            raise ValueError("Tipul resursei trebuie să fie 'site' sau 'link'")
        return v


class ShareUpdate(BaseModel):
    can_edit: bool = Field(...)


class ShareOut(BaseModel):
    id: int
    user_id: int
    user_email: str
    can_edit: bool
    created_at: datetime
