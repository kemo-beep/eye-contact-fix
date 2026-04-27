"""Video I/O helpers using OpenCV for frames + ffmpeg for audio remux.

Two output paths:
  - MP4 (H.264/AAC): the existing ``mux_audio`` flow.
  - WebM (VP9 + alpha plane / Opus): for transparent backgrounds. We pipe
    raw RGBA frames into ffmpeg -pix_fmt yuva420p -c:v libvpx-vp9 because
    OpenCV's VideoWriter doesn't support alpha.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Iterator, Optional, Tuple

import imageio_ffmpeg
import numpy as np

logger = logging.getLogger(__name__)


def _ffmpeg_bin() -> str:
    """Resolve an ffmpeg executable.

    Prefer a system-installed ffmpeg (PATH); fall back to imageio-ffmpeg's
    bundled binary so this works inside slim Docker images too.
    """
    sys_bin = shutil.which("ffmpeg")
    if sys_bin:
        return sys_bin
    return imageio_ffmpeg.get_ffmpeg_exe()


@dataclass
class VideoMeta:
    width: int
    height: int
    fps: float
    frame_count: int


def open_video(path: str) -> Tuple["cv2.VideoCapture", VideoMeta]:  # type: ignore[name-defined]
    import cv2

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {path}")
    meta = VideoMeta(
        width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        fps=float(cap.get(cv2.CAP_PROP_FPS) or 30.0),
        frame_count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0),
    )
    return cap, meta


def iter_frames(cap) -> Iterator:
    while True:
        ok, frame = cap.read()
        if not ok:
            return
        yield frame


def open_writer(path: str, meta: VideoMeta):
    import cv2

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(path, fourcc, meta.fps, (meta.width, meta.height))
    if not writer.isOpened():
        raise RuntimeError(f"Could not open video writer: {path}")
    return writer


# ---------------------------------------------------------------------------
# Transparent (alpha) writer — pipes RGBA frames into ffmpeg + libvpx-vp9.
# ---------------------------------------------------------------------------


class AlphaWebMWriter:
    """Write a stream of BGR + alpha frames to a VP9 WebM with alpha.

    Use as a context manager::

        with AlphaWebMWriter(path, meta) as w:
            for frame_bgr, alpha in stream:
                w.write(frame_bgr, alpha)
    """

    def __init__(self, path: str, meta: VideoMeta) -> None:
        self.path = path
        self.meta = meta
        self._proc: Optional[subprocess.Popen] = None

    def __enter__(self) -> "AlphaWebMWriter":
        ffmpeg = _ffmpeg_bin()
        cmd = [
            ffmpeg,
            "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-pix_fmt", "rgba",
            "-s", f"{self.meta.width}x{self.meta.height}",
            "-r", f"{self.meta.fps:.6f}",
            "-i", "-",
            "-c:v", "libvpx-vp9",
            "-pix_fmt", "yuva420p",
            "-auto-alt-ref", "0",
            "-b:v", "2M",
            "-deadline", "good",
            "-cpu-used", "5",
            self.path,
        ]
        logger.info("Starting ffmpeg alpha writer: %s", " ".join(cmd))
        self._proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE
        )
        return self

    def write(self, frame_bgr: np.ndarray, alpha: np.ndarray) -> None:
        import cv2

        if self._proc is None or self._proc.stdin is None:
            raise RuntimeError("AlphaWebMWriter not started")
        if frame_bgr.shape[:2] != alpha.shape[:2]:
            raise ValueError("frame and alpha must have matching dimensions")
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        rgba = np.dstack([rgb, alpha.astype(np.uint8)])
        try:
            self._proc.stdin.write(rgba.tobytes())
        except BrokenPipeError as exc:
            stderr = b""
            if self._proc.stderr is not None:
                try:
                    stderr = self._proc.stderr.read()
                except Exception:
                    pass
            raise RuntimeError(
                f"ffmpeg alpha writer pipe broken: {stderr.decode(errors='ignore')[-1000:]}"
            ) from exc

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._proc is None:
            return
        try:
            if self._proc.stdin is not None:
                self._proc.stdin.close()
            stderr = b""
            if self._proc.stderr is not None:
                stderr = self._proc.stderr.read()
            rc = self._proc.wait()
            if rc != 0 and exc_type is None:
                raise RuntimeError(
                    f"ffmpeg alpha writer failed (rc={rc}): "
                    f"{stderr.decode(errors='ignore')[-2000:]}"
                )
        finally:
            self._proc = None


# ---------------------------------------------------------------------------
# Audio mux — copies/encodes audio from the source onto a written video.
# ---------------------------------------------------------------------------


def mux_audio(video_path: str, source_with_audio: str, output_path: str) -> str:
    """Mux H.264/AAC into ``output_path`` (MP4)."""
    ffmpeg = _ffmpeg_bin()
    cmd = [
        ffmpeg,
        "-y",
        "-i", video_path,
        "-i", source_with_audio,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "128k",
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-shortest",
        "-movflags", "+faststart",
        output_path,
    ]
    logger.info("Running ffmpeg mux: %s", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        logger.warning("ffmpeg mux failed, retrying without audio. stderr=%s", proc.stderr[-1000:])
        cmd2 = [
            ffmpeg, "-y", "-i", video_path,
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "veryfast", "-crf", "20",
            "-movflags", "+faststart",
            output_path,
        ]
        proc2 = subprocess.run(cmd2, capture_output=True, text=True)
        if proc2.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {proc2.stderr[-2000:]}")
    return output_path


def mux_audio_webm(video_path: str, source_with_audio: str, output_path: str) -> str:
    """Mux Opus audio onto a transparent VP9 WebM, copying video stream.

    The video stream is already libvpx-vp9 with yuva420p; we just copy it
    and re-encode the source audio to libopus so the container is valid.
    Falls back to a no-audio copy when the source has no audio stream.
    """
    ffmpeg = _ffmpeg_bin()
    cmd = [
        ffmpeg,
        "-y",
        "-i", video_path,
        "-i", source_with_audio,
        "-c:v", "copy",
        "-c:a", "libopus",
        "-b:a", "128k",
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-shortest",
        output_path,
    ]
    logger.info("Running ffmpeg webm mux: %s", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        logger.warning(
            "ffmpeg webm mux failed, retrying without audio. stderr=%s",
            proc.stderr[-1000:],
        )
        cmd2 = [
            ffmpeg, "-y", "-i", video_path,
            "-c:v", "copy",
            output_path,
        ]
        proc2 = subprocess.run(cmd2, capture_output=True, text=True)
        if proc2.returncode != 0:
            raise RuntimeError(f"ffmpeg webm failed: {proc2.stderr[-2000:]}")
    return output_path


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)
