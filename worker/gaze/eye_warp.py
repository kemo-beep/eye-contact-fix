"""Iris-tight geometric eye warp.

The previous version used the eye-outline mean as the gaze target and applied
the warp over the full eye region. That produced a sub-pixel correction that
was almost entirely lost to the H.264 re-encode. This version:

  - Receives the displacement and iris radius from the caller (computed once
    per frame from MediaPipe's iris perimeter landmarks for accuracy).
  - Restricts the warp to a tight halo around the iris (≈ 2.2× the iris
    radius), so only the iris/pupil are pushed and the sclera/eyelids stay
    put. This avoids the "smeared eyeball" look at higher strengths.
  - Uses ``cv2.remap`` with a smoothstep falloff for seamless blending.
"""
from __future__ import annotations

import numpy as np


def warp_iris(
    frame_bgr: np.ndarray,
    iris_center: np.ndarray,
    delta: np.ndarray,
    iris_radius: float,
    halo: float = 2.2,
) -> np.ndarray:
    """Shift the iris pixels by ``delta`` with a smooth radial blend.

    Args:
        frame_bgr: full frame (H, W, 3) BGR.
        iris_center: (x, y) of iris center in image coords.
        delta: (dx, dy) signed shift to apply at the iris center.
        iris_radius: radius of the iris in pixels.
        halo: extra padding around the iris where the warp falls off to 0.
    """
    import cv2

    if not np.isfinite(delta).all() or iris_radius < 2:
        return frame_bgr

    h, w = frame_bgr.shape[:2]
    radius = float(iris_radius) * float(halo)
    pad = int(radius + 4)

    cx, cy = float(iris_center[0]), float(iris_center[1])
    rx0 = int(max(0, np.floor(cx - pad)))
    ry0 = int(max(0, np.floor(cy - pad)))
    rx1 = int(min(w, np.ceil(cx + pad)))
    ry1 = int(min(h, np.ceil(cy + pad)))
    if rx1 - rx0 < 4 or ry1 - ry0 < 4:
        return frame_bgr

    roi = frame_bgr[ry0:ry1, rx0:rx1]
    rh, rw = roi.shape[:2]

    lcx = cx - rx0
    lcy = cy - ry0

    yy, xx = np.mgrid[0:rh, 0:rw].astype(np.float32)
    dx = xx - lcx
    dy = yy - lcy
    dist = np.sqrt(dx * dx + dy * dy)

    # Smoothstep: 1 at iris center, 0 outside the halo.
    t = np.clip(1.0 - dist / radius, 0.0, 1.0)
    falloff = (t * t * (3.0 - 2.0 * t)).astype(np.float32)

    # Inverse-mapped sampling so output pixels at the iris come from
    # (input - delta), i.e. the iris content shifts by +delta.
    map_x = (xx - falloff * float(delta[0])).astype(np.float32)
    map_y = (yy - falloff * float(delta[1])).astype(np.float32)

    warped = cv2.remap(
        roi,
        map_x,
        map_y,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )

    blend = falloff[..., None]
    blended = warped.astype(np.float32) * blend + roi.astype(np.float32) * (1.0 - blend)
    out = frame_bgr.copy()
    out[ry0:ry1, rx0:rx1] = np.clip(blended, 0, 255).astype(np.uint8)
    return out


def smoothed_delta(prev: np.ndarray | None, current: np.ndarray, alpha: float) -> np.ndarray:
    """EMA smoothing of frame-to-frame deltas to reduce flicker.

    ``alpha`` is the weight of the new sample (closer to 1 = snappier,
    closer to 0 = more smoothing).
    """
    if prev is None:
        return current
    return prev * (1.0 - alpha) + current * alpha


def eye_open_ratio(outline: np.ndarray) -> float:
    """Crude eye-aspect-ratio (height / width) for blink detection."""
    if outline.shape[0] < 4:
        return 1.0
    w = outline[:, 0].max() - outline[:, 0].min()
    h = outline[:, 1].max() - outline[:, 1].min()
    if w <= 0:
        return 0.0
    return float(h / w)


def is_blink(outline: np.ndarray, threshold: float = 0.18) -> bool:
    return eye_open_ratio(outline) < threshold
