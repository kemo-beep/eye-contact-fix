"""Preview-frame extraction for the editor's subject picker.

The frontend needs a still image of the input video to overlay click points
on. We extract one frame via ffmpeg and upload it to Cloudinary so the
browser can display it (and so the worker can later run SAM2 on the same
frame deterministically).

This stays in the API container instead of being a worker task because it
needs to feel instant — the user just clicked "Refine subject".
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from typing import Optional

import cloudinary
import cloudinary.uploader
import httpx
import imageio_ffmpeg

from app.core.config import settings
from app.services.storage import configure_cloudinary

logger = logging.getLogger(__name__)


def _ffmpeg_bin() -> str:
    sys_bin = shutil.which("ffmpeg")
    if sys_bin:
        return sys_bin
    return imageio_ffmpeg.get_ffmpeg_exe()


def _ffprobe_bin() -> Optional[str]:
    return shutil.which("ffprobe")


def _ensure_cache_dir() -> str:
    os.makedirs(settings.PREVIEW_CACHE_DIR, exist_ok=True)
    return settings.PREVIEW_CACHE_DIR


def _local_input_path(job_id: uuid.UUID) -> str:
    return os.path.join(_ensure_cache_dir(), f"{job_id}.input.mp4")


def _local_frame_path(job_id: uuid.UUID, t: float) -> str:
    return os.path.join(
        _ensure_cache_dir(), f"{job_id}.frame-{int(t * 1000)}.jpg"
    )


@dataclass
class FrameInfo:
    url: str
    width: int
    height: int
    duration: Optional[float]


def _download_input(input_url: str, dest: str) -> None:
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    with httpx.stream("GET", input_url, follow_redirects=True, timeout=120.0) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_bytes(chunk_size=1024 * 1024):
                f.write(chunk)


def _probe_dimensions(path: str) -> tuple[int, int, Optional[float]]:
    """Return (width, height, duration) using ffprobe when available."""
    bin_path = _ffprobe_bin()
    if bin_path is None:
        return 0, 0, None
    try:
        cmd = [
            bin_path,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height:format=duration",
            "-of", "default=nw=1",
            path,
        ]
        out = subprocess.check_output(cmd, text=True)
        w = h = 0
        dur: Optional[float] = None
        for line in out.splitlines():
            if line.startswith("width="):
                w = int(line.split("=", 1)[1])
            elif line.startswith("height="):
                h = int(line.split("=", 1)[1])
            elif line.startswith("duration="):
                try:
                    dur = float(line.split("=", 1)[1])
                except ValueError:
                    pass
        return w, h, dur
    except Exception as exc:  # pragma: no cover
        logger.warning("ffprobe failed: %s", exc)
        return 0, 0, None


def extract_and_upload_frame(
    job_id: uuid.UUID,
    input_url: str,
    frame_time: float = 0.0,
) -> FrameInfo:
    """Download the input video (cached), grab one frame, upload as a JPEG."""
    configure_cloudinary()

    local_input = _local_input_path(job_id)
    _download_input(input_url, local_input)

    local_frame = _local_frame_path(job_id, frame_time)
    if not (os.path.exists(local_frame) and os.path.getsize(local_frame) > 0):
        ffmpeg = _ffmpeg_bin()
        cmd = [
            ffmpeg,
            "-y",
            "-ss", f"{max(0.0, float(frame_time)):.3f}",
            "-i", local_input,
            "-frames:v", "1",
            "-q:v", "2",
            local_frame,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(
                f"ffmpeg frame extract failed: {proc.stderr[-1000:]}"
            )

    width, height, duration = _probe_dimensions(local_input)

    folder = f"{settings.CLOUDINARY_UPLOAD_FOLDER}/previews"
    response = cloudinary.uploader.upload(
        local_frame,
        resource_type="image",
        folder=folder,
        public_id=f"preview-{job_id}-{int(frame_time * 1000)}",
        overwrite=True,
    )
    url = response.get("secure_url") or response.get("url")
    if not url:
        raise RuntimeError("Cloudinary did not return a preview URL")
    if not width:
        width = int(response.get("width") or 0)
    if not height:
        height = int(response.get("height") or 0)
    return FrameInfo(url=url, width=width, height=height, duration=duration)
