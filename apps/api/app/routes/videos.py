"""Video upload + download endpoints."""
from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_session
from app.models.job import Job, JobStatus
from app.schemas.job import JobCreateResponse, JobRead
from app.services import storage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/videos", tags=["videos"])


@router.post(
    "/upload",
    response_model=JobCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a video and create a DRAFT job",
)
async def upload_video(
    file: Annotated[UploadFile, File(...)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JobCreateResponse:
    """Upload to Cloudinary, persist as DRAFT, and return the job.

    The user then configures effects in the editor and calls
    ``POST /jobs/{id}/render`` to start a worker render. This split lets
    the editor preview the input video and run the subject picker without
    committing to a render.
    """
    if file.content_type not in settings.ALLOWED_VIDEO_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type: {file.content_type}",
        )

    job = Job(
        status=JobStatus.DRAFT,
        original_filename=file.filename or "upload.mp4",
        mime_type=file.content_type,
    )
    session.add(job)
    await session.flush()
    job_id = job.id

    try:
        await file.seek(0)
        result = storage.upload_video(
            file_obj=file.file,
            public_id_hint=f"input-{job_id}",
            folder_suffix="inputs",
        )
    except Exception as exc:
        logger.exception("Cloudinary upload failed")
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Storage upload failed: {exc}",
        ) from exc

    job.input_public_id = result.public_id
    job.input_url = result.url
    job.size_bytes = result.bytes
    await session.commit()
    await session.refresh(job)

    return JobCreateResponse(job=JobRead.model_validate(job))


@router.get(
    "/{job_id}/download",
    summary="Redirect to the signed download URL of a completed video",
)
async def download_video(
    job_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RedirectResponse:
    job = await session.scalar(select(Job).where(Job.id == job_id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.COMPLETED or not job.output_url:
        raise HTTPException(
            status_code=409,
            detail=f"Job not ready (status={job.status.value})",
        )
    return RedirectResponse(url=job.output_url, status_code=307)
