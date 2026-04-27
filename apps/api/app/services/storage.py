"""Cloudinary storage adapter.

Handles uploading raw video bytes/streams to Cloudinary and returning
public URLs + public ids that can be persisted in the DB.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import IO, Optional

import cloudinary
import cloudinary.uploader

from app.core.config import settings

logger = logging.getLogger(__name__)


def configure_cloudinary() -> None:
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )


@dataclass
class UploadResult:
    public_id: str
    url: str
    bytes: int
    format: Optional[str]
    duration: Optional[float]


def upload_video(
    file_obj: IO[bytes],
    public_id_hint: str,
    folder_suffix: str = "uploads",
) -> UploadResult:
    """Upload a video stream to Cloudinary's video resource type."""
    configure_cloudinary()

    folder = f"{settings.CLOUDINARY_UPLOAD_FOLDER}/{folder_suffix}"
    logger.info("Uploading to Cloudinary folder=%s public_id=%s", folder, public_id_hint)

    response = cloudinary.uploader.upload_large(
        file_obj,
        resource_type="video",
        folder=folder,
        public_id=public_id_hint,
        overwrite=True,
        chunk_size=6 * 1024 * 1024,
    )

    return UploadResult(
        public_id=response.get("public_id"),
        url=response.get("secure_url") or response.get("url"),
        bytes=response.get("bytes", 0),
        format=response.get("format"),
        duration=response.get("duration"),
    )


def delete_video(public_id: str) -> None:
    configure_cloudinary()
    try:
        cloudinary.uploader.destroy(public_id, resource_type="video", invalidate=True)
    except Exception as exc:  # pragma: no cover - best-effort cleanup
        logger.warning("Failed to delete %s from Cloudinary: %s", public_id, exc)
