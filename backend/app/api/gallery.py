import io

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_links_area
from app.config import settings
from app.database import get_db
from app.models import GalleryImage, User
from app.schemas.gallery import GalleryImageOut, GalleryList

router = APIRouter(
    prefix="/api/gallery", tags=["gallery"], dependencies=[Depends(require_links_area)]
)


async def _used_bytes(user_id: int, db: AsyncSession) -> int:
    total = await db.scalar(
        select(func.coalesce(func.sum(GalleryImage.size_bytes), 0)).where(
            GalleryImage.owner_id == user_id
        )
    )
    return int(total or 0)


@router.get("", response_model=GalleryList)
async def list_images(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(GalleryImage)
        .where(GalleryImage.owner_id == user.id)
        .order_by(GalleryImage.created_at.desc())
    )
    images = result.scalars().all()
    return GalleryList(
        images=[GalleryImageOut.model_validate(i) for i in images],
        used_bytes=await _used_bytes(user.id, db),
        limit_bytes=settings.GALLERY_MAX_BYTES,
    )


@router.post("", response_model=GalleryImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Doar fișiere imagine sunt permise")

    data = await file.read()
    size = len(data)
    if size == 0:
        raise HTTPException(status_code=400, detail="Fișier gol")

    # Verifică limita totală a galeriei (25 MB)
    used = await _used_bytes(user.id, db)
    if used + size > settings.GALLERY_MAX_BYTES:
        ramas = max(0, settings.GALLERY_MAX_BYTES - used)
        raise HTTPException(
            status_code=413,
            detail=(
                f"Limita galeriei (25 MB) ar fi depășită. "
                f"Mai ai disponibil {ramas // 1024} KB."
            ),
        )

    # Validează că e o imagine reală
    try:
        Image.open(io.BytesIO(data)).verify()
    except Exception:
        raise HTTPException(status_code=400, detail="Fișierul nu este o imagine validă")

    img = GalleryImage(
        owner_id=user.id,
        filename=(file.filename or "imagine")[:255],
        content_type=file.content_type[:64],
        size_bytes=size,
        data=data,
    )
    db.add(img)
    await db.flush()
    await db.refresh(img)
    return img


@router.get("/{image_id}/raw")
async def get_raw(
    image_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    img = await db.get(GalleryImage, image_id)
    if not img or img.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Imagine inexistentă")
    return Response(
        content=img.data,
        media_type=img.content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(
    image_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    img = await db.get(GalleryImage, image_id)
    if not img or img.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Imagine inexistentă")
    await db.delete(img)
