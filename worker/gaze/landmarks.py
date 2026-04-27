"""MediaPipe FaceMesh wrapper.

Exposes the landmarks we need for Phase 1 geometric eye-contact correction:
  - iris center + iris perimeter (for a tight warp ROI)
  - inner/outer eye corners + upper/lower eyelid points (for a stable
    "looking at camera" target)
  - eye outline (for blink detection)

Iris indices require ``refine_landmarks=True`` on FaceMesh (468..472 left
iris, 473..477 right iris).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np

# Eye outline (eyelid contour) indices for blink detection.
LEFT_EYE_OUTLINE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
RIGHT_EYE_OUTLINE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]

# Stable references that don't move with gaze direction.
# Corners: (outer, inner) — outer is on the side of the temple.
LEFT_EYE_CORNERS = (33, 133)
RIGHT_EYE_CORNERS = (263, 362)
# Upper/lower eyelid midpoints used to anchor the vertical gaze target.
LEFT_EYE_TOP_BOTTOM = (159, 145)
RIGHT_EYE_TOP_BOTTOM = (386, 374)

# Iris: index 0 is the center, 1..4 the perimeter.
LEFT_IRIS = [468, 469, 470, 471, 472]
RIGHT_IRIS = [473, 474, 475, 476, 477]


@dataclass
class FaceLandmarks:
    points: np.ndarray  # (N, 3) in image coords (px). z is relative depth.

    def select(self, idxs: List[int]) -> np.ndarray:
        return self.points[idxs]

    def iris_center(self, side: str) -> np.ndarray:
        idxs = LEFT_IRIS if side == "left" else RIGHT_IRIS
        return self.select(idxs)[0, :2].copy()

    def iris_radius(self, side: str) -> float:
        """Mean distance from iris center to the 4 perimeter landmarks (px)."""
        idxs = LEFT_IRIS if side == "left" else RIGHT_IRIS
        pts = self.select(idxs)[:, :2]
        center = pts[0]
        return float(np.mean(np.linalg.norm(pts[1:] - center, axis=1)))

    def eye_outline(self, side: str) -> np.ndarray:
        idxs = LEFT_EYE_OUTLINE if side == "left" else RIGHT_EYE_OUTLINE
        return self.select(idxs)[:, :2]

    def eye_corners(self, side: str) -> Tuple[np.ndarray, np.ndarray]:
        a, b = LEFT_EYE_CORNERS if side == "left" else RIGHT_EYE_CORNERS
        return self.points[a, :2].copy(), self.points[b, :2].copy()

    def eye_top_bottom(self, side: str) -> Tuple[np.ndarray, np.ndarray]:
        t, b = LEFT_EYE_TOP_BOTTOM if side == "left" else RIGHT_EYE_TOP_BOTTOM
        return self.points[t, :2].copy(), self.points[b, :2].copy()

    def gaze_target(self, side: str) -> np.ndarray:
        """Where the iris would sit if the subject looked at the camera.

        Uses corner midpoint for X and eyelid midpoint for Y. Both anchors
        are independent of where the iris is currently pointing, which makes
        them a much more stable reference than the eye-outline mean.
        """
        outer, inner = self.eye_corners(side)
        top, bottom = self.eye_top_bottom(side)
        return np.array(
            [(outer[0] + inner[0]) / 2.0, (top[1] + bottom[1]) / 2.0],
            dtype=np.float32,
        )


class FaceLandmarker:
    """Thin wrapper over mediapipe's FaceMesh for video frames."""

    def __init__(self) -> None:
        import mediapipe as mp

        self._mp = mp
        self._mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def __enter__(self) -> "FaceLandmarker":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def close(self) -> None:
        try:
            self._mesh.close()
        except Exception:
            pass

    def detect(self, frame_bgr: np.ndarray) -> Optional[FaceLandmarks]:
        import cv2

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        result = self._mesh.process(rgb)
        if not result.multi_face_landmarks:
            return None

        h, w = frame_bgr.shape[:2]
        face = result.multi_face_landmarks[0]
        pts = np.array(
            [(lm.x * w, lm.y * h, lm.z * w) for lm in face.landmark],
            dtype=np.float32,
        )
        return FaceLandmarks(points=pts)
