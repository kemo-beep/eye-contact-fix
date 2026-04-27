"""MediaPipe Selfie Segmentation wrapper.

Fast on CPU (~2-5ms per 720p frame), good enough for talking-head clips.
Returns a float32 mask in [0, 1] where 1 means "subject".
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class AutoSegmenter:
    def __init__(self, model_selection: int = 1) -> None:
        # 1 = landscape (wider FOV) — better for full-body or wide framing.
        # 0 = general (closer to face) — better for tight head-and-shoulders.
        # We default to 1 because most uploads will be wider than 16:9 portraits.
        import mediapipe as mp

        self._mp = mp
        self._seg = mp.solutions.selfie_segmentation.SelfieSegmentation(
            model_selection=model_selection
        )

    def segment(self, frame_bgr: np.ndarray) -> np.ndarray:
        import cv2

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        result = self._seg.process(rgb)
        if result.segmentation_mask is None:
            return np.ones(frame_bgr.shape[:2], dtype=np.float32)
        m = result.segmentation_mask.astype(np.float32)
        # Cleanup: a small blur reduces fringe noise around hair edges.
        m = cv2.GaussianBlur(m, (5, 5), 0)
        return np.clip(m, 0.0, 1.0)

    def close(self) -> None:
        try:
            self._seg.close()
        except Exception:  # pragma: no cover
            pass
