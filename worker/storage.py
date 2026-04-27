"""Cloudinary helpers for the worker (download input, upload output)."""
from __future__ import annotations

import logging
import os

import cloudinary
import cloudinary.uploader
import httpx

from worker.config import settings

logger = logging.getLogger(__name__)


def configure() -> None:
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )


def download_to(url: str, dest_path: str) -> str:
    os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
    with httpx.stream("GET", url, follow_redirects=True, timeout=120.0) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_bytes(chunk_size=1024 * 1024):
                f.write(chunk)
    return dest_path


def upload_output(local_path: str, public_id_hint: str) -> dict:
    configure()
    folder = f"{settings.CLOUDINARY_UPLOAD_FOLDER}/outputs"
    logger.info("Uploading output to Cloudinary folder=%s public_id=%s", folder, public_id_hint)
    return cloudinary.uploader.upload_large(
        local_path,
        resource_type="video",
        folder=folder,
        public_id=public_id_hint,
        overwrite=True,
        chunk_size=6 * 1024 * 1024,
    )
