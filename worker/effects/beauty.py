"""Beauty / retouch — skin smoothing, teeth whitening, eye brightening."""
from __future__ import annotations

import logging
from typing import List, Optional

import numpy as np

from worker.effects.base import Effect, FrameContext, RenderMeta

logger = logging.getLogger(__name__)


# FaceMesh indices.

# Outer face oval — defines the limit of the skin region. We exclude eyes,
# eyebrows, lips, and nostrils from inside this oval.
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
LEFT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
RIGHT_BROW = [336, 296, 334, 293, 300, 285, 295, 282, 283, 276]

# Outer lip ring (we want to protect the lips from skin smoothing).
OUTER_LIPS = [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318,
    402, 317, 14, 87, 178, 88, 95,
]
# Inner mouth ring — used for teeth detection.
INNER_LIPS = [
    78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311,
    312, 13, 82, 81, 80, 191,
]

# Iris perimeter (for eye-brightening mask).
LEFT_IRIS = [468, 469, 470, 471, 472]
RIGHT_IRIS = [473, 474, 475, 476, 477]


def _poly_indices(landmarks, idxs: List[int]) -> np.ndarray:
    return landmarks.points[idxs, :2].astype(np.int32)


class BeautyEffect:
    name = "beauty"

    def __init__(
        self,
        *,
        enabled: bool = True,
        skin_smooth: float = 0.0,
        teeth_whiten: float = 0.0,
        eye_brighten: float = 0.0,
    ) -> None:
        self.enabled = enabled
        self.skin_smooth = float(np.clip(skin_smooth, 0.0, 1.0))
        self.teeth_whiten = float(np.clip(teeth_whiten, 0.0, 1.0))
        self.eye_brighten = float(np.clip(eye_brighten, 0.0, 1.0))
        self._stats = {"frames": 0, "smoothed": 0, "teeth": 0, "eye": 0}

    def prepare(self, meta: RenderMeta) -> None:
        return

    # ---- skin -------------------------------------------------------------
    def _build_skin_mask(self, landmarks, h: int, w: int) -> np.ndarray:
        import cv2

        mask = np.zeros((h, w), dtype=np.uint8)
        oval = _poly_indices(landmarks, FACE_OVAL)
        cv2.fillPoly(mask, [oval], 255)

        # Subtract eyes / brows / lips from inside the face oval.
        for region in (
            LEFT_EYE_OUTLINE,
            RIGHT_EYE_OUTLINE,
            LEFT_BROW,
            RIGHT_BROW,
            OUTER_LIPS,
        ):
            cv2.fillPoly(mask, [_poly_indices(landmarks, region)], 0)

        # Soften the mask edges so smoothing fades into untouched skin
        # instead of leaving a sharp jaw line.
        mask = cv2.GaussianBlur(mask, (31, 31), 0)
        return mask

    def _apply_skin_smooth(self, frame: np.ndarray, landmarks) -> np.ndarray:
        import cv2

        if self.skin_smooth <= 0:
            return frame
        h, w = frame.shape[:2]
        mask = self._build_skin_mask(landmarks, h, w)

        # Frequency separation: lowpass = bilateral blur, highpass = original
        # minus lowpass. Recombine with reduced highpass to keep texture but
        # smooth blotches.
        d = max(5, int(min(w, h) * 0.012) | 1)
        lowpass = cv2.bilateralFilter(frame, d=d, sigmaColor=40, sigmaSpace=15)
        highpass = cv2.subtract(frame, lowpass)

        # `texture` controls how much detail to keep. At full strength we
        # still keep ~25% of the high-frequency detail so skin doesn't go
        # plastic.
        texture = 1.0 - 0.75 * self.skin_smooth
        recombined = cv2.addWeighted(
            lowpass, 1.0, highpass, float(texture), 0
        )

        alpha = (mask.astype(np.float32) / 255.0)[..., None]
        out = recombined.astype(np.float32) * alpha + frame.astype(np.float32) * (1.0 - alpha)
        self._stats["smoothed"] += 1
        return np.clip(out, 0, 255).astype(np.uint8)

    # ---- teeth ------------------------------------------------------------
    def _apply_teeth_whiten(self, frame: np.ndarray, landmarks) -> np.ndarray:
        import cv2

        if self.teeth_whiten <= 0:
            return frame
        h, w = frame.shape[:2]
        mouth = _poly_indices(landmarks, INNER_LIPS)
        if mouth.shape[0] < 6:
            return frame

        mouth_mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mouth_mask, [mouth], 255)

        # Restrict to bright, low-saturation pixels — i.e., teeth, not lips
        # or tongue.
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        sat = hsv[..., 1]
        val = hsv[..., 2]
        bright = (val > 100) & (sat < 110)
        mask = (mouth_mask > 0) & bright
        if not np.any(mask):
            return frame

        # In LAB: L = lightness, a = green-red, b = blue-yellow. Teeth look
        # yellow/dim — push L up and pull b (yellow) down, gently.
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
        amount = float(self.teeth_whiten)
        lab[..., 0] = np.where(mask, np.clip(lab[..., 0] + 18 * amount, 0, 255), lab[..., 0])
        lab[..., 2] = np.where(mask, np.clip(lab[..., 2] - 14 * amount, 0, 255), lab[..., 2])
        whitened = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

        # Soft blend along the inner-lip edge.
        soft = cv2.GaussianBlur(mouth_mask, (15, 15), 0).astype(np.float32) / 255.0
        soft = soft[..., None]
        out = whitened.astype(np.float32) * soft + frame.astype(np.float32) * (1.0 - soft)
        self._stats["teeth"] += 1
        return np.clip(out, 0, 255).astype(np.uint8)

    # ---- eyes -------------------------------------------------------------
    def _apply_eye_brighten(self, frame: np.ndarray, landmarks) -> np.ndarray:
        import cv2

        if self.eye_brighten <= 0:
            return frame
        h, w = frame.shape[:2]
        eye_mask = np.zeros((h, w), dtype=np.uint8)

        # Sclera: full eye outline. Iris/pupil also benefit from a bit of contrast.
        for outline in (LEFT_EYE_OUTLINE, RIGHT_EYE_OUTLINE):
            cv2.fillPoly(eye_mask, [_poly_indices(landmarks, outline)], 255)

        if not np.any(eye_mask):
            return frame

        amount = float(self.eye_brighten)
        # Capped: at amount=1 we add ~20 to L and bump contrast ~12%.
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
        l = lab[..., 0]
        m = (eye_mask > 0)
        l_boost = np.where(m, np.clip(l * (1.0 + 0.12 * amount) + 14 * amount, 0, 255), l)
        lab[..., 0] = l_boost
        bright = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

        soft = cv2.GaussianBlur(eye_mask, (9, 9), 0).astype(np.float32) / 255.0
        soft = soft[..., None]
        out = bright.astype(np.float32) * soft + frame.astype(np.float32) * (1.0 - soft)
        self._stats["eye"] += 1
        return np.clip(out, 0, 255).astype(np.uint8)

    # ---- driver -----------------------------------------------------------
    def apply(self, ctx: FrameContext) -> None:
        if not self.enabled or ctx.frame is None or ctx.landmarks is None:
            return
        self._stats["frames"] += 1
        out = ctx.frame
        out = self._apply_skin_smooth(out, ctx.landmarks)
        out = self._apply_teeth_whiten(out, ctx.landmarks)
        out = self._apply_eye_brighten(out, ctx.landmarks)
        ctx.frame = out

    def close(self) -> None:
        logger.info("beauty stats: %s", self._stats)
