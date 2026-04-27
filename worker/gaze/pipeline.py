"""End-to-end eye-contact correction pipeline (Phase 1 — geometric)."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np

from worker.gaze.eye_warp import is_blink, smoothed_delta, warp_iris
from worker.gaze.landmarks import FaceLandmarker
from worker.gaze.video_io import (
    ensure_dir,
    iter_frames,
    mux_audio,
    open_video,
    open_writer,
)

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[int, int], None]
"""(processed_frames, total_frames) -> None"""


@dataclass
class PipelineOptions:
    # 1.0 = move iris fully onto the camera-facing target every frame.
    # ~0.7-0.9 looks natural; lower values look subtle, higher = uncanny.
    strength: float = 1.0
    # EMA factor for the per-eye delta. 1.0 = no smoothing, 0.0 = frozen.
    temporal_alpha: float = 0.5
    # Hard cap on the per-frame shift, in iris radii. Prevents huge warps when
    # the subject looks far off-camera (which would smear the iris).
    max_shift_iris_radii: float = 1.4
    skip_blinks: bool = True


def _clamp_delta(delta: np.ndarray, iris_radius: float, max_in_radii: float) -> np.ndarray:
    if iris_radius <= 0:
        return delta
    max_px = float(iris_radius) * float(max_in_radii)
    norm = float(np.linalg.norm(delta))
    if norm > max_px and norm > 1e-6:
        return delta * (max_px / norm)
    return delta


def correct_video(
    input_path: str,
    output_path: str,
    options: Optional[PipelineOptions] = None,
    on_progress: Optional[ProgressCallback] = None,
) -> str:
    """Run the full pipeline and return the output path (MP4 with audio)."""
    options = options or PipelineOptions()

    cap, meta = open_video(input_path)
    logger.info(
        "Opened video %s -> %dx%d @ %.2ffps (%d frames)",
        input_path, meta.width, meta.height, meta.fps, meta.frame_count,
    )

    tmp_video = output_path + ".novideoaudio.mp4"
    ensure_dir(os.path.dirname(output_path) or ".")
    writer = open_writer(tmp_video, meta)

    prev_delta = {"left": None, "right": None}  # type: dict[str, np.ndarray | None]

    detected_count = 0
    warped_count = 0
    processed = 0

    try:
        with FaceLandmarker() as landmarker:
            for frame in iter_frames(cap):
                out_frame = frame
                landmarks = landmarker.detect(frame)

                if landmarks is not None:
                    detected_count += 1
                    for side in ("left", "right"):
                        outline = landmarks.eye_outline(side)
                        if options.skip_blinks and is_blink(outline):
                            # Reset smoothing on blinks so we don't carry a
                            # stale offset into the next open frame.
                            prev_delta[side] = None
                            continue

                        iris = landmarks.iris_center(side)
                        target = landmarks.gaze_target(side)
                        radius = landmarks.iris_radius(side)

                        raw_delta = (target - iris) * options.strength
                        smoothed = smoothed_delta(
                            prev_delta[side], raw_delta, options.temporal_alpha
                        )
                        smoothed = _clamp_delta(
                            smoothed, radius, options.max_shift_iris_radii
                        )
                        prev_delta[side] = smoothed

                        # Skip warps below 0.4 px — purely noise.
                        if float(np.linalg.norm(smoothed)) < 0.4:
                            continue

                        out_frame = warp_iris(
                            out_frame,
                            iris_center=iris,
                            delta=smoothed,
                            iris_radius=radius,
                        )
                        warped_count += 1

                writer.write(out_frame)
                processed += 1
                if on_progress and (processed % 5 == 0 or processed == meta.frame_count):
                    on_progress(processed, meta.frame_count)
    finally:
        writer.release()
        cap.release()

    logger.info(
        "Pipeline done: processed=%d, faces_detected=%d, eyes_warped=%d",
        processed, detected_count, warped_count,
    )

    final_path = mux_audio(tmp_video, input_path, output_path)
    try:
        os.remove(tmp_video)
    except OSError:
        pass
    return final_path
