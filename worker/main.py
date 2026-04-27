"""RQ worker tasks.

Two tasks live here:

  - ``process_render_job(job_id, effects)`` — main multi-effect render.
  - ``process_mask_preview(job_id, frame_time, points)`` — single-frame
    SAM2 preview for the editor's subject picker.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from typing import Any, Dict, List, Mapping, Optional

import imageio_ffmpeg

from worker.config import settings
from worker.core.pipeline import PipelineRunner
from worker.db import Job, JobStatus, session_scope
from worker.plugins.registry import configs_from_effects, load_plugins
from worker.gaze.video_io import (
    ensure_dir,
    open_video,
)
from worker.storage import download_to, upload_output

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("worker")


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


def _update_status(
    job_id: uuid.UUID,
    *,
    status: Optional[JobStatus] = None,
    progress: Optional[int] = None,
    output_url: Optional[str] = None,
    output_public_id: Optional[str] = None,
    mask_preview_url: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    with session_scope() as session:
        job = session.get(Job, job_id)
        if job is None:
            logger.warning("Job %s not found while updating status", job_id)
            return
        if status is not None:
            job.status = status
        if progress is not None:
            job.progress = max(0, min(100, int(progress)))
        if output_url is not None:
            job.output_url = output_url
        if output_public_id is not None:
            job.output_public_id = output_public_id
        if mask_preview_url is not None:
            job.mask_preview_url = mask_preview_url
        if error is not None:
            job.error = error[:4000]


def _ffmpeg_bin() -> str:
    sys_bin = shutil.which("ffmpeg")
    if sys_bin:
        return sys_bin
    return imageio_ffmpeg.get_ffmpeg_exe()


# ---------------------------------------------------------------------------
# Frame extraction (for SAM2 video predictor)
# ---------------------------------------------------------------------------


def _extract_jpeg_frames(input_video: str, dest_dir: str, fps: float) -> int:
    """Dump every frame of ``input_video`` as ``00000.jpg``, ``00001.jpg``, ..."""
    ensure_dir(dest_dir)
    ffmpeg = _ffmpeg_bin()
    cmd = [
        ffmpeg, "-y",
        "-i", input_video,
        "-q:v", "2",
        "-start_number", "0",
        os.path.join(dest_dir, "%05d.jpg"),
    ]
    logger.info("Extracting JPEG frames: %s", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg frame extract failed: {proc.stderr[-1000:]}")
    files = sorted(f for f in os.listdir(dest_dir) if f.endswith(".jpg"))
    return len(files)


def process_render_job(job_id_str: str, effects_payload: Mapping[str, Any]) -> str:
    """RQ entry point: render a job with the user's effects payload."""
    job_id = uuid.UUID(job_id_str)
    logger.info("Render job %s with effects=%s", job_id, dict(effects_payload))

    with session_scope() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise RuntimeError(f"Job {job_id} not found")
        if not job.input_url:
            raise RuntimeError(f"Job {job_id} missing input_url")
        input_url = job.input_url
        subject_points = job.subject_points or []
        subject_frame_time = job.subject_frame_time
        job.status = JobStatus.PROCESSING
        job.progress = 1
        job.error = None
        job.output_url = None
        job.output_public_id = None

    output_format = str(effects_payload.get("output_format", "mp4"))
    suffix = ".webm" if output_format == "webm_alpha" else ".mp4"

    os.makedirs(settings.TMP_DIR, exist_ok=True)
    work_dir = tempfile.mkdtemp(prefix=f"render-{job_id}-", dir=settings.TMP_DIR)
    input_path = os.path.join(work_dir, "input.mp4")
    output_path = os.path.join(work_dir, f"output{suffix}")

    sam_masks: Optional[Dict[int, Any]] = None

    try:
        logger.info("Downloading %s -> %s", input_url, input_path)
        download_to(input_url, input_path)
        _update_status(job_id, progress=8)

        bg = effects_payload.get("background") or {}
        if bg.get("enabled") and bg.get("mode") == "sam":
            sam_masks = _maybe_run_sam_propagation(
                job_id=job_id,
                input_path=input_path,
                work_dir=work_dir,
                points=subject_points,
                frame_time=subject_frame_time,
            )
            _update_status(job_id, progress=20)

        plugin_configs = configs_from_effects(effects_payload, sam_masks)
        plugins = load_plugins(plugin_configs)

        def on_progress(done: int, total: int) -> None:
            if total <= 0:
                return
            base = 20 if sam_masks else 10
            pct = base + int((90 - base) * done / total)
            _update_status(job_id, progress=pct)

        PipelineRunner(
            job_id=str(job_id),
            input_path=input_path,
            output_path=output_path,
            output_format=output_format,
            plugins=plugins,
            on_progress=on_progress,
        ).run()

        _update_status(job_id, progress=92)
        logger.info("Uploading rendered video to Cloudinary")
        upload_resp = upload_output(output_path, public_id_hint=f"output-{job_id}")
        output_url = upload_resp.get("secure_url") or upload_resp.get("url")
        output_public_id = upload_resp.get("public_id")

        _update_status(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100,
            output_url=output_url,
            output_public_id=output_public_id,
        )
        logger.info("Render %s completed: %s", job_id, output_url)
        return output_url or ""
    except Exception as exc:
        logger.exception("Render %s failed", job_id)
        _update_status(job_id, status=JobStatus.FAILED, error=str(exc))
        raise
    finally:
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# SAM2 video propagation (called only when bg.mode == "sam")
# ---------------------------------------------------------------------------


def _maybe_run_sam_propagation(
    *,
    job_id: uuid.UUID,
    input_path: str,
    work_dir: str,
    points: List[Mapping[str, Any]],
    frame_time: Optional[float],
) -> Optional[Dict[int, Any]]:
    if not points:
        logger.info("SAM mode requested but no clicks were saved; using auto.")
        return None

    try:
        from worker.segmentation import sam_video
    except Exception:
        logger.exception("SAM2 import failed; falling back to auto.")
        return None
    if not sam_video.is_available():
        logger.warning("SAM2 not available in this image; falling back to auto.")
        return None

    cap, meta = open_video(input_path)
    cap.release()
    fps = meta.fps or 30.0

    frames_dir = os.path.join(work_dir, "frames")
    n_frames = _extract_jpeg_frames(input_path, frames_dir, fps)
    if n_frames == 0:
        logger.warning("No frames extracted for SAM2; falling back to auto.")
        return None

    click_frame = int(round(float(frame_time or 0.0) * fps))
    click_frame = max(0, min(n_frames - 1, click_frame))

    pts = [(float(p["x"]), float(p["y"])) for p in points]
    labels = [int(p.get("label", 1)) for p in points]

    try:
        masks = sam_video.propagate_masks(
            frames_dir=frames_dir,
            frame_idx=click_frame,
            points=pts,
            labels=labels,
        )
    except Exception:
        logger.exception("SAM2 video propagation failed; falling back to auto.")
        return None
    return masks


# ---------------------------------------------------------------------------
# MASK preview task (fast queue)
# ---------------------------------------------------------------------------


def _auto_preview_mask(frame_bgr: Any) -> Any:
    import numpy as np

    from worker.segmentation.auto import AutoSegmenter

    seg = AutoSegmenter()
    try:
        soft = seg.segment(frame_bgr)
    finally:
        seg.close()
    return (soft > 0.5).astype(np.uint8) * 255


def process_mask_preview(
    job_id_str: str,
    frame_time: float,
    points: List[Dict[str, Any]],
) -> str:
    """Generate a single-frame SAM2 mask preview and upload as a PNG.

    Stores the resulting URL on ``job.mask_preview_url`` so the inspector
    can poll for it.
    """
    import cv2
    import numpy as np

    job_id = uuid.UUID(job_id_str)
    logger.info(
        "Mask preview job=%s frame_time=%.3f n_points=%d",
        job_id, frame_time, len(points),
    )

    with session_scope() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise RuntimeError(f"Job {job_id} not found")
        if not job.input_url:
            raise RuntimeError(f"Job {job_id} missing input_url")
        input_url = job.input_url

    os.makedirs(settings.TMP_DIR, exist_ok=True)
    work_dir = tempfile.mkdtemp(prefix=f"mask-{job_id}-", dir=settings.TMP_DIR)
    input_path = os.path.join(work_dir, "input.mp4")

    try:
        download_to(input_url, input_path)

        ffmpeg = _ffmpeg_bin()
        frame_path = os.path.join(work_dir, "frame.jpg")
        cmd = [
            ffmpeg, "-y",
            "-ss", f"{max(0.0, float(frame_time)):.3f}",
            "-i", input_path,
            "-frames:v", "1",
            "-q:v", "2",
            frame_path,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg frame extract failed: {proc.stderr[-1000:]}")

        frame_bgr = cv2.imread(frame_path)
        if frame_bgr is None:
            raise RuntimeError("OpenCV could not read extracted frame")

        pts = [(float(p["x"]), float(p["y"])) for p in points]
        labels = [int(p.get("label", 1)) for p in points]

        if pts:
            try:
                from worker.segmentation import sam_video

                mask = sam_video.predict_image_mask(frame_bgr, pts, labels)
            except Exception as sam_exc:
                logger.warning(
                    "SAM2 preview unavailable (%s); using automatic subject mask.",
                    sam_exc,
                )
                mask = _auto_preview_mask(frame_bgr)
        else:
            mask = _auto_preview_mask(frame_bgr)

        # Build a translucent green overlay PNG: visible mask area in green.
        overlay = np.zeros((*mask.shape, 4), dtype=np.uint8)
        overlay[..., 0] = 0       # B
        overlay[..., 1] = 220     # G
        overlay[..., 2] = 80      # R
        overlay[..., 3] = (mask.astype(np.float32) * 0.55).astype(np.uint8)

        out_png = os.path.join(work_dir, "mask.png")
        cv2.imwrite(out_png, overlay)

        upload_resp = _upload_image(
            out_png,
            public_id_hint=f"mask-{job_id}-{int(float(frame_time) * 1000)}",
        )
        url = upload_resp.get("secure_url") or upload_resp.get("url") or ""

        _update_status(job_id, mask_preview_url=url)
        logger.info("Mask preview ready: %s", url)
        return url
    except Exception as exc:
        logger.exception("Mask preview %s failed", job_id)
        raise
    finally:
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except OSError:
            pass


def _upload_image(local_path: str, public_id_hint: str) -> dict:
    import cloudinary
    import cloudinary.uploader

    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )
    folder = f"{settings.CLOUDINARY_UPLOAD_FOLDER}/masks"
    return cloudinary.uploader.upload(
        local_path,
        resource_type="image",
        folder=folder,
        public_id=public_id_hint,
        overwrite=True,
    )


# ---------------------------------------------------------------------------
# Backwards-compatible single-purpose task. Kept so old enqueued jobs from
# previous deployments still complete; new uploads go through render.
# ---------------------------------------------------------------------------


def process_job(job_id_str: str) -> str:
    """Legacy task: assume eye-contact only with default settings."""
    return process_render_job(
        job_id_str,
        {
            "eye_contact": {
                "enabled": True,
                "strength": settings.GAZE_WARP_STRENGTH,
            },
            "beauty": {"enabled": False},
            "background": {"enabled": False},
            "output_format": "mp4",
        },
    )
