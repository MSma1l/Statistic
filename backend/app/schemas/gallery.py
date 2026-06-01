from datetime import datetime

from pydantic import BaseModel, ConfigDict


class GalleryImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


class GalleryList(BaseModel):
    images: list[GalleryImageOut]
    used_bytes: int
    limit_bytes: int
