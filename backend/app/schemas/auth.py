from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(default="", max_length=255)
    password: str = Field(min_length=6, max_length=128)
    is_admin: bool = False


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    is_admin: bool
    is_active: bool
    created_at: datetime
