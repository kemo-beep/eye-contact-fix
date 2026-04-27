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


@dataclass
class RetouchBoxInfo:
    x: float
    y: float
    width: float
    height: float


@dataclass
class RetouchAnalysisInfo:
    width: int
    height: int
    face: Optional[RetouchBoxInfo]
    left_eye: Optional[RetouchBoxInfo]
    right_eye: Optional[RetouchBoxInfo]
    teeth: Optional[RetouchBoxInfo]
    features: dict[str, bool]


FACE_OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397,
    365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58,
    132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]
LEFT_EYE_OUTLINE = [
    33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
]
RIGHT_EYE_OUTLINE = [
    362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398,
]
INNER_LIPS = [
    78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311,
    312, 13, 82, 81, 80, 191,
]


def _download_input(input_url: str, dest: str) -> None:
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    with httpx.stream("GET", input_url, follow_redirects=True, timeout=120.0) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_bytes(chunk_size=1024 * 1024):
                f.write(chunk)


def _extract_frame_local(job_id: uuid.UUID, input_url: str, frame_time: float) -> str:
    local_input = _local_input_path(job_id)
    _download_input(input_url, local_input)

    local_frame = _local_frame_path(job_id, frame_time)
    if os.path.exists(local_frame) and os.path.getsize(local_frame) > 0:
        return local_frame
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
        raise RuntimeError(f"ffmpeg frame extract failed: {proc.stderr[-1000:]}")
    return local_frame


def _box(points, pad: float, width: int, height: int) -> RetouchBoxInfo:
    import numpy as np

    pts = np.asarray(points, dtype=np.float32)
    x0 = max(0.0, float(pts[:, 0].min()) - pad)
    y0 = max(0.0, float(pts[:, 1].min()) - pad)
    x1 = min(float(width), float(pts[:, 0].max()) + pad)
    y1 = min(float(height), float(pts[:, 1].max()) + pad)
    return RetouchBoxInfo(
        x=x0,
        y=y0,
        width=max(0.0, x1 - x0),
        height=max(0.0, y1 - y0),
    )


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


def analyze_retouch_frame(
    job_id: uuid.UUID,
    input_url: str,
    frame_time: float = 0.0,
) -> RetouchAnalysisInfo:
    import cv2
    import mediapipe as mp
    import numpy as np

    local_frame = _extract_frame_local(job_id, input_url, frame_time)
    frame = cv2.imread(local_frame)
    if frame is None:
        raise RuntimeError("OpenCV could not read preview frame")

    height, width = frame.shape[:2]
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    rgb.flags.writeable = False

    with mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
    ) as mesh:
        result = mesh.process(rgb)

    if not result.multi_face_landmarks:
        return RetouchAnalysisInfo(
            width=width,
            height=height,
            face=None,
            left_eye=None,
            right_eye=None,
            teeth=None,
            features={"skin": False, "eyes": False, "teeth": False},
        )

    landmarks = result.multi_face_landmarks[0].landmark
    pts = np.array([(lm.x * width, lm.y * height) for lm in landmarks], dtype=np.float32)

    face = _box(pts[FACE_OVAL], pad=max(width, height) * 0.012, width=width, height=height)
    left_eye = _box(pts[LEFT_EYE_OUTLINE], pad=8.0, width=width, height=height)
    right_eye = _box(pts[RIGHT_EYE_OUTLINE], pad=8.0, width=width, height=height)

    mouth_pts = pts[INNER_LIPS]
    mouth_box = _box(mouth_pts, pad=4.0, width=width, height=height)
    mouth_mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(mouth_mask, [mouth_pts.astype(np.int32)], 255)
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    bright = (hsv[..., 2] > 105) & (hsv[..., 1] < 105) & (mouth_mask > 0)
    mouth_area = max(1.0, float(np.count_nonzero(mouth_mask)))
    teeth_ratio = float(np.count_nonzero(bright)) / mouth_area
    teeth = mouth_box if teeth_ratio > 0.035 else None

    def eye_open(box: RetouchBoxInfo) -> bool:
        return box.width > 8 and box.height / max(1.0, box.width) > 0.12

    eyes_ok = eye_open(left_eye) and eye_open(right_eye)
    return RetouchAnalysisInfo(
        width=width,
        height=height,
        face=face,
        left_eye=left_eye if eyes_ok else None,
        right_eye=right_eye if eyes_ok else None,
        teeth=teeth,
        features={"skin": True, "eyes": eyes_ok, "teeth": teeth is not None},
    )
