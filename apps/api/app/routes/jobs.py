"""Job + effects endpoints."""
from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session, with_stale_statement_retry
from app.models.job import Job, JobStatus
from app.schemas.job import (
    JobCreateResponse,
    JobList,
    JobRead,
    PreviewFrameResponse,
    RenderRequest,
    RetouchAnalysisResponse,
    SubjectMaskRequest,
    SubjectMaskResponse,
)
from app.services import preview as preview_service
from app.services import queue as queue_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/jobs", tags=["jobs"])


_RENDERABLE = {JobStatus.DRAFT, JobStatus.UPLOADED, JobStatus.FAILED, JobStatus.COMPLETED}


@router.get("", response_model=JobList, summary="List jobs (most recent first)")
async def list_jobs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> JobList:
    async def query(session: AsyncSession) -> tuple[int, list[Job]]:
        total = await session.scalar(select(func.count()).select_from(Job)) or 0
        rows = await session.scalars(
            select(Job).order_by(Job.created_at.desc()).limit(limit).offset(offset)
        )
        return int(total), list(rows)

    total, rows = await with_stale_statement_retry(query)
    return JobList(items=[JobRead.model_validate(j) for j in rows], total=int(total))


@router.get("/{job_id}", response_model=JobRead, summary="Get a single job by id")
async def get_job(
    job_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JobRead:
    job = await session.scalar(select(Job).where(Job.id == job_id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobRead.model_validate(job)


@router.post(
    "/{job_id}/render",
    response_model=JobCreateResponse,
    summary="Persist effects + enqueue a multi-effect render",
)
async def render_job(
    job_id: uuid.UUID,
    payload: RenderRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JobCreateResponse:
    job = await session.scalar(select(Job).where(Job.id == job_id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in _RENDERABLE:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot render from status={job.status.value}",
        )
    if not job.input_url:
        raise HTTPException(
            status_code=409,
            detail="Job has no input video to render",
        )

    # JSON mode so RQ/pickle on the worker never sees app.* Enum instances
    # (ModuleNotFoundError: app in the worker container).
    effects = payload.effects.model_dump(mode="json")

    # Validate the transparent + format combo here so the worker can trust it.
    bg = effects.get("background", {})
    out_fmt = effects.get("output_format", "mp4")
    if bg.get("enabled") and bg.get("output") == "transparent" and out_fmt != "webm_alpha":
        raise HTTPException(
            status_code=422,
            detail="Transparent background requires output_format=webm_alpha",
        )

    job.effects = effects
    job.output_format = out_fmt  # SQLAlchemy will coerce str -> enum
    job.status = JobStatus.QUEUED
    job.progress = 0
    job.error = None
    job.output_url = None
    job.output_public_id = None
    await session.commit()
    await session.refresh(job)

    try:
        queue_service.enqueue_render(job.id, effects)
    except Exception as exc:
        logger.exception("Failed to enqueue render")
        job.status = JobStatus.FAILED
        job.error = f"Could not enqueue: {exc}"
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Job queue unavailable",
        ) from exc

    return JobCreateResponse(job=JobRead.model_validate(job))


@router.get(
    "/{job_id}/preview-frame",
    response_model=PreviewFrameResponse,
    summary="Extract one frame from the input for the subject picker",
)
async def preview_frame(
    job_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    t: float = Query(0.0, ge=0.0, description="Frame time in seconds"),
) -> PreviewFrameResponse:
    job = await session.scalar(select(Job).where(Job.id == job_id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.input_url:
        raise HTTPException(status_code=409, detail="Job has no input video")

    # Fast path: if we've already cached one for t==0 use it.
    if t == 0.0 and job.preview_frame_url:
        return PreviewFrameResponse(
            url=job.preview_frame_url,
            width=0,
            height=0,
            duration=None,
        )

    try:
        info = preview_service.extract_and_upload_frame(job.id, job.input_url, t)
    except Exception as exc:
        logger.exception("Preview frame extraction failed")
        raise HTTPException(
            status_code=502,
            detail=f"Could not extract preview frame: {exc}",
        ) from exc

    if t == 0.0:
        job.preview_frame_url = info.url
        await session.commit()

    return PreviewFrameResponse(
        url=info.url, width=info.width, height=info.height, duration=info.duration
    )


@router.get(
    "/{job_id}/retouch-analysis",
    response_model=RetouchAnalysisResponse,
    summary="Detect face regions used by live retouch controls",
)
async def retouch_analysis(
    job_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    t: float = Query(0.0, ge=0.0),
) -> RetouchAnalysisResponse:
    job = await session.scalar(select(Job).where(Job.id == job_id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.input_url:
        raise HTTPException(status_code=409, detail="Job has no input video")

    try:
        info = preview_service.analyze_retouch_frame(job.id, job.input_url, t)
    except Exception as exc:
        logger.exception("Retouch analysis failed")
        raise HTTPException(
            status_code=502,
            detail=f"Could not analyze retouch regions: {exc}",
        ) from exc

    def box(value):
        return value.__dict__ if value is not None else None

    return RetouchAnalysisResponse(
        width=info.width,
        height=info.height,
        face=box(info.face),
        left_eye=box(info.left_eye),
        right_eye=box(info.right_eye),
        teeth=box(info.teeth),
        features=info.features,
    )


@router.post(
    "/{job_id}/subject-mask",
    response_model=SubjectMaskResponse,
    summary="Run SAM2 on the chosen frame + clicks and return a mask preview",
)
async def subject_mask(
    job_id: uuid.UUID,
    payload: SubjectMaskRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SubjectMaskResponse:
    job = await session.scalar(select(Job).where(Job.id == job_id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.input_url:
        raise HTTPException(status_code=409, detail="Job has no input video")

    points = [p.model_dump() for p in payload.points]

    # Persist the user's selection so the next render uses these clicks
    # without round-tripping through the editor again.
    job.subject_points = points
    job.subject_frame_time = float(payload.frame_time)
    await session.commit()

    try:
        queue_service.enqueue_mask_preview(job.id, payload.frame_time, points)
    except Exception as exc:
        logger.exception("Failed to enqueue mask preview")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mask preview queue unavailable",
        ) from exc

    # The worker uploads the mask image and writes mask_preview_url back on
    # the job row. The frontend polls GET /jobs/{id} until mask_preview_url
    # changes. We respond immediately with what we have so far.
    return SubjectMaskResponse(
        mask_url=job.mask_preview_url or "",
        frame_url=job.preview_frame_url or "",
    )
