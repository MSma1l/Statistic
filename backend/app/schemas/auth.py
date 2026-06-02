from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    # `str`, nu `EmailStr`: e doar identificatorul de login (se potrivește cu DB),
    # acceptăm și domenii interne precum `.local`.
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(default="", max_length=255)
    password: str = Field(min_length=6, max_length=128)
    is_admin: bool = False
    can_sites: bool = True
    can_links: bool = True
    can_qr: bool = True


class UserPermissionsUpdate(BaseModel):
    is_admin: bool | None = None
    can_sites: bool | None = None
    can_links: bool | None = None
    can_qr: bool | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    is_admin: bool
    can_sites: bool
    can_links: bool
    can_qr: bool
    is_active: bool
    created_at: datetime
