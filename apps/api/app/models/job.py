"""Job ORM model."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, Enum, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class JobStatus(str, enum.Enum):
    DRAFT = "draft"
    UPLOADED = "uploaded"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class OutputFormat(str, enum.Enum):
    MP4 = "mp4"
    WEBM_ALPHA = "webm_alpha"


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(
            JobStatus,
            native_enum=False,
            length=32,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=JobStatus.DRAFT,
        nullable=False,
        index=True,
    )

    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Storage URLs / public ids (Cloudinary)
    input_public_id: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    input_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output_public_id: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    output_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # User-configured effects payload (see app.schemas.job.EffectsPayload).
    effects: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    # User-supplied click points for the SAM2 subject picker. List of
    # {"x": float, "y": float, "label": int (1=positive, 0=negative)}.
    subject_points: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(
        JSONB, nullable=True
    )
    # The frame time (seconds) the user clicked on, so the worker can
    # reproduce the mask deterministically.
    subject_frame_time: Mapped[Optional[float]] = mapped_column(
        # store as JSON to avoid an extra column type; small float, OK as JSONB scalar
        JSONB, nullable=True
    )

    # Store enum *values* ('mp4', 'webm_alpha') as varchar — native PG enums from
    # older create_all used member names (MP4, WEBM_ALPHA) and broke asyncpg reads.
    output_format: Mapped[OutputFormat] = mapped_column(
        Enum(
            OutputFormat,
            native_enum=False,
            length=32,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=OutputFormat.MP4,
        nullable=False,
    )

    # Cached helpers for the editor UI.
    preview_frame_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mask_preview_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Progress in 0-100 range
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
