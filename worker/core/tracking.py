"""Shared face tracking helpers for the plugin pipeline."""
from __future__ import annotations

from typing import Optional

import numpy as np

from worker.gaze.landmarks import FaceLandmarker, FaceLandmarks


class LandmarkTracker:
    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled
        self._landmarker = FaceLandmarker() if enabled else None

    def detect(self, frame: np.ndarray) -> Optional[FaceLandmarks]:
        if self._landmarker is None:
            return None
        return self._landmarker.detect(frame)

    def close(self) -> None:
        if self._landmarker is not None:
            self._landmarker.close()

