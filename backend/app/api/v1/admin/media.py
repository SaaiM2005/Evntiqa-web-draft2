from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.core.security import require_admin
from app.services.media_service import ingest_image_file, ingest_image_url

router = APIRouter(
    prefix="/api/v1/admin/media",
    tags=["admin-media"],
    dependencies=[Depends(require_admin)],
)


class ProcessUrlRequest(BaseModel):
    url: str = Field(..., description="External image URL to validate, download, and convert to WebP")


class MediaResponse(BaseModel):
    url: str = Field(..., description="Local WebP served URL (e.g. /uploads/images/<hash>.webp)")
    original_url: str | None = None
    original_filename: str | None = None
    format: str = "webp"
    width: int | None = None
    height: int | None = None
    size_bytes: int | None = None
    is_local: bool = True


@router.post("/process-url", response_model=MediaResponse)
async def process_media_url(
    req: ProcessUrlRequest,
) -> MediaResponse:
    result = await ingest_image_url(req.url)
    return MediaResponse(**result)


@router.post("/upload", response_model=MediaResponse, status_code=status.HTTP_201_CREATED)
async def upload_media_file(
    file: UploadFile = File(...),
) -> MediaResponse:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )
    result = await ingest_image_file(file_bytes, filename=file.filename or "uploaded.png")
    return MediaResponse(**result)
