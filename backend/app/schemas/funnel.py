from pydantic import BaseModel, ConfigDict, Field


class FunnelStepIn(BaseModel):
    """O treaptă trimisă de la UI la salvare (PUT înlocuiește toată lista)."""

    kind: str = Field(pattern="^(page|custom_event)$")
    value: str = Field(min_length=1, max_length=1024)
    label: str = Field(default="", max_length=255)
    is_conversion: bool = False


class FunnelStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    position: int
    kind: str
    value: str
    label: str
    is_conversion: bool


class AiAnalyzeIn(BaseModel):
    """Corpul pentru POST /ai-analyze: ce landing analizăm și pe câte zile."""

    path: str = Field(min_length=1, max_length=1024)
    days: int = Field(default=30, ge=1, le=365)
