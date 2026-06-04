from pydantic import BaseModel, Field


class EventIn(BaseModel):
    """Un singur eveniment trimis de tracker."""

    type: str = Field(max_length=32)
    path: str = Field(default="", max_length=1024)
    referrer: str = Field(default="", max_length=1024)
    element_selector: str = Field(default="", max_length=512)
    element_text: str = Field(default="", max_length=2000)
    x_pct: float | None = None
    y_pct: float | None = None
    viewport_w: int | None = None
    viewport_h: int | None = None
    # Dimensiunile complete ale documentului (pentru suprapunerea heatmap-ului).
    doc_w: int | None = Field(default=None, ge=0, le=100_000)
    doc_h: int | None = Field(default=None, ge=0, le=1_000_000)
    scroll_depth: int | None = None
    # Timp activ pe pagină (ms), trimis cu evenimentul `engagement`.
    duration_ms: int | None = Field(default=None, ge=0, le=86_400_000)
    # Atribuire campanie, capturată din UTM-urile linkului de intrare.
    utm_source: str | None = Field(default=None, max_length=128)
    utm_medium: str | None = Field(default=None, max_length=128)
    utm_campaign: str | None = Field(default=None, max_length=128)
    session_id: str = Field(default="", max_length=64)
    props: dict | None = None


class CollectPayload(BaseModel):
    """Batch de evenimente trimis la /px/collect."""

    site: str = Field(min_length=8, max_length=32)
    visitor_id: str = Field(default="", max_length=64)
    events: list[EventIn] = Field(max_length=50)
