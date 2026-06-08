from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# Operațiile permise pe DOM. Intenționat fără "html" (vector XSS pe site-ul client).
_OP_PATTERN = "^(text|style|attr)$"


class LivePatchCreate(BaseModel):
    """Un patch scris de OM („schimb manual textul butonului")."""

    path: str = Field(min_length=1, max_length=1024)
    label: str = Field(default="", max_length=255)
    selector: str = Field(min_length=1, max_length=1024)
    op: str = Field(pattern=_OP_PATTERN)
    prop: str = Field(default="", max_length=255)
    value: str = Field(default="", max_length=4000)


class LivePatchUpdate(BaseModel):
    """Editarea unui patch existent (toate câmpurile opționale)."""

    label: str | None = Field(default=None, max_length=255)
    selector: str | None = Field(default=None, min_length=1, max_length=1024)
    op: str | None = Field(default=None, pattern=_OP_PATTERN)
    prop: str | None = Field(default=None, max_length=255)
    value: str | None = Field(default=None, max_length=4000)


class PatchGenerateRequest(BaseModel):
    """Cerere către AI: transformă o recomandare CRO într-un patch DOM concret.

    `instruction` = recomandarea (vine din ai-analyze sau scrisă de tine).
    `path` = pagina pe care se va aplica (context pentru AI: ce elemente există).
    """

    path: str = Field(min_length=1, max_length=1024)
    instruction: str = Field(min_length=1, max_length=4000)
    days: int = Field(default=30, ge=1, le=365)


class LivePatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    path: str
    label: str
    selector: str
    op: str
    prop: str
    value: str
    risk: str
    source: str
    status: str
    auto_apply: bool
    blocked: bool
    blocked_reason: str
    created_at: datetime
