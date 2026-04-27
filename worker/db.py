"""Synchronous DB access for the worker (RQ tasks run in worker processes)."""
from __future__ import annotations

import enum
import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator, Optional

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    Integer,
    String,
    Text,
    create_engine,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from worker.config import settings


class Base(DeclarativeBase):
    pass


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

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    status: Mapped[JobStatus] = mapped_column(
        SAEnum(
            JobStatus,
            native_enum=False,
            length=32,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        index=True,
    )
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    input_public_id: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    input_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output_public_id: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    output_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    effects: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    subject_points: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(
        JSONB, nullable=True
    )
    subject_frame_time: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)

    output_format: Mapped[OutputFormat] = mapped_column(
        SAEnum(
            OutputFormat,
            native_enum=False,
            length=32,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=OutputFormat.MP4,
        nullable=False,
    )

    preview_frame_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mask_preview_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

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


_engine = create_engine(settings.sync_database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False, class_=Session)


@contextmanager
def session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
