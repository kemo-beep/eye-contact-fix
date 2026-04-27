"""Eye-contact effect — iris-tight warp toward the camera-facing target."""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from worker.effects.base import Effect, FrameContext, RenderMeta
from worker.gaze.eye_warp import is_blink, smoothed_delta, warp_iris

logger = logging.getLogger(__name__)


class EyeContactEffect:
    name = "eye_contact"

    def __init__(
        self,
        *,
        enabled: bool = True,
        strength: float = 1.0,
        temporal_alpha: float = 0.5,
        max_shift_iris_radii: float = 1.4,
        skip_blinks: bool = True,
    ) -> None:
        self.enabled = enabled
        self.strength = float(strength)
        self.temporal_alpha = float(temporal_alpha)
        self.max_shift_iris_radii = float(max_shift_iris_radii)
        self.skip_blinks = skip_blinks
        self._prev_delta: dict[str, Optional[np.ndarray]] = {"left": None, "right": None}
        self._stats = {"detected": 0, "warped": 0}

    def prepare(self, meta: RenderMeta) -> None:
        self._prev_delta = {"left": None, "right": None}

    @staticmethod
    def _clamp(delta: np.ndarray, iris_radius: float, max_in_radii: float) -> np.ndarray:
        if iris_radius <= 0:
            return delta
        max_px = float(iris_radius) * float(max_in_radii)
        norm = float(np.linalg.norm(delta))
        if norm > max_px and norm > 1e-6:
            return delta * (max_px / norm)
        return delta

    def apply(self, ctx: FrameContext) -> None:
        if not self.enabled or ctx.frame is None:
            return
        landmarks = ctx.landmarks
        if landmarks is None:
            return

        self._stats["detected"] += 1
        out = ctx.frame
        for side in ("left", "right"):
            outline = landmarks.eye_outline(side)
            if self.skip_blinks and is_blink(outline):
                self._prev_delta[side] = None
                continue

            iris = landmarks.iris_center(side)
            target = landmarks.gaze_target(side)
            radius = landmarks.iris_radius(side)

            raw = (target - iris) * self.strength
            smoothed = smoothed_delta(self._prev_delta[side], raw, self.temporal_alpha)
            smoothed = self._clamp(smoothed, radius, self.max_shift_iris_radii)
            self._prev_delta[side] = smoothed

            if float(np.linalg.norm(smoothed)) < 0.4:
                continue

            out = warp_iris(
                out,
                iris_center=iris,
                delta=smoothed,
                iris_radius=radius,
            )
            self._stats["warped"] += 1

        ctx.frame = out

    def close(self) -> None:
        logger.info(
            "eye_contact stats: detected=%d, warped=%d",
            self._stats["detected"],
            self._stats["warped"],
        )
