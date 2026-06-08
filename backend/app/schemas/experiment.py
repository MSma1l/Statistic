from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

_OP_PATTERN = "^(text|style|attr)$"


class ArmIn(BaseModel):
    """Un braț la crearea experimentului. Control = pagina neatinsă (fără patch)."""

    name: str = Field(default="", max_length=255)
    is_control: bool = False
    selector: str = Field(default="", max_length=1024)
    op: str = Field(default="text", pattern=_OP_PATTERN)
    prop: str = Field(default="", max_length=255)
    value: str = Field(default="", max_length=4000)


class ExperimentCreate(BaseModel):
    """Creează un experiment pe o pagină cu cel puțin 2 brațe (control + 1 variantă)."""

    path: str = Field(min_length=1, max_length=1024)
    name: str = Field(default="", max_length=255)
    arms: list[ArmIn] = Field(min_length=2, max_length=10)


class ArmOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_control: bool
    selector: str
    op: str
    prop: str
    value: str


class ExperimentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    path: str
    name: str
    status: str
    created_at: datetime
    arms: list[ArmOut]
