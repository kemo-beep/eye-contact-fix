from __future__ import annotations

import numpy as np

from worker.core.plugin_base import ProcessingContext, VideoPlugin
from worker.effects.beauty import (
    LEFT_EYE_OUTLINE,
    OUTER_LIPS,
    RIGHT_EYE_OUTLINE,
)

NOSE = [6, 98, 327, 168, 197, 195, 5, 4, 1, 2]
NOSE_TIP = 1


class FaceReshapePlugin(VideoPlugin):
    id = "face_reshape"
    name = "Face ReShape"
    order = 45
    requires_landmarks = True

    def prepare(self, context: ProcessingContext) -> None:
        self._smooth: dict[str, np.ndarray | float] = {}

    def process_frame(
        self,
        frame: np.ndarray,
        frame_index: int,
        context: ProcessingContext,
    ) -> np.ndarray:
        landmarks = context.landmarks.get(frame_index)
        if landmarks is None:
            return frame

        out = frame
        points = landmarks.points[:, :2]
        face_w = max(1.0, abs(points[454, 0] - points[234, 0]))
        face_h = max(1.0, abs(points[152, 1] - points[10, 1]))

        eye_size = self._smooth_value("eye_size", self._value("eye_size"))
        if eye_size:
            out = _scale_region(
                out,
                self._smooth_point("left_eye_center", _center(points[LEFT_EYE_OUTLINE])),
                face_w * 0.14,
                1 + eye_size * 0.16,
            )
            out = _scale_region(
                out,
                self._smooth_point("right_eye_center", _center(points[RIGHT_EYE_OUTLINE])),
                face_w * 0.14,
                1 + eye_size * 0.16,
            )

        eye_distance = self._smooth_value(
            "eye_distance",
            self._value("eye_distance") + self._value("inner_eye") * 0.5,
        )
        if eye_distance:
            dx = face_w * 0.035 * eye_distance
            out = _shift_region(
                out,
                self._smooth_point("left_eye_shift_center", _center(points[LEFT_EYE_OUTLINE])),
                face_w * 0.16,
                self._smooth_delta("left_eye_distance", np.array([-dx, 0], dtype=np.float32)),
            )
            out = _shift_region(
                out,
                self._smooth_point("right_eye_shift_center", _center(points[RIGHT_EYE_OUTLINE])),
                face_w * 0.16,
                self._smooth_delta("right_eye_distance", np.array([dx, 0], dtype=np.float32)),
            )

        eye_position = self._smooth_value("eye_position", self._value("eye_position"))
        if eye_position:
            dy = face_h * 0.035 * eye_position
            out = _shift_region(out, _center(points[LEFT_EYE_OUTLINE]), face_w * 0.16, self._smooth_delta("left_eye_position", np.array([0, dy], dtype=np.float32)))
            out = _shift_region(out, _center(points[RIGHT_EYE_OUTLINE]), face_w * 0.16, self._smooth_delta("right_eye_position", np.array([0, dy], dtype=np.float32)))

        nose_amount = self._smooth_value(
            "nose_amount",
            self._value("nose_width") + self._value("nose_size") * 0.6,
        )
        if nose_amount:
            out = _scale_region(
                out,
                self._smooth_point("nose_center", _center(points[NOSE])),
                face_w * 0.16,
                1 + nose_amount * 0.12,
            )

        nose_y = self._smooth_value(
            "nose_y",
            self._value("nose_bridge") * -0.5
            + self._value("nose_height")
            + self._value("nose_root") * -0.35,
        )
        if nose_y:
            out = _shift_region(
                out,
                self._smooth_point("nose_tip", points[NOSE_TIP, :2]),
                face_w * 0.17,
                self._smooth_delta("nose_y_delta", np.array([0, face_h * 0.025 * nose_y], dtype=np.float32)),
            )

        mouth_center = self._smooth_point("mouth_center", _center(points[OUTER_LIPS]))
        mouth_size = self._smooth_value("mouth_size", self._value("mouth_size"))
        if mouth_size:
            out = _scale_region(out, mouth_center, face_w * 0.18, 1 + mouth_size * 0.12)

        mouth_position = self._smooth_value("mouth_position", self._value("mouth_position"))
        if mouth_position:
            out = _shift_region(
                out,
                mouth_center,
                face_w * 0.18,
                self._smooth_delta("mouth_position_delta", np.array([0, face_h * 0.035 * mouth_position], dtype=np.float32)),
            )

        smile = self._smooth_value("smile", self._value("smile"))
        if smile:
            out = _shift_region(
                out,
                self._smooth_point("mouth_left", points[61, :2]),
                face_w * 0.09,
                self._smooth_delta("smile_left", np.array([0, -face_h * 0.025 * smile], dtype=np.float32)),
            )
            out = _shift_region(
                out,
                self._smooth_point("mouth_right", points[291, :2]),
                face_w * 0.09,
                self._smooth_delta("smile_right", np.array([0, -face_h * 0.025 * smile], dtype=np.float32)),
            )

        return out

    def finalize(self, context: ProcessingContext) -> None:
        return

    def _value(self, key: str) -> float:
        return float(np.clip(float(self.settings.get(key, 0.0)), -1.0, 1.0))

    def _smooth_value(self, key: str, value: float) -> float:
        prev = self._smooth.get(key)
        if prev is None:
            self._smooth[key] = float(value)
            return float(value)
        smoothed = float(prev) * 0.62 + float(value) * 0.38
        self._smooth[key] = smoothed
        return smoothed

    def _smooth_point(self, key: str, point: np.ndarray) -> np.ndarray:
        prev = self._smooth.get(key)
        if prev is None:
            self._smooth[key] = point.astype(np.float32)
            return point.astype(np.float32)
        smoothed = np.asarray(prev, dtype=np.float32) * 0.68 + point.astype(np.float32) * 0.32
        self._smooth[key] = smoothed
        return smoothed

    def _smooth_delta(self, key: str, delta: np.ndarray) -> np.ndarray:
        prev = self._smooth.get(key)
        if prev is None:
            self._smooth[key] = delta.astype(np.float32)
            return delta.astype(np.float32)
        smoothed = np.asarray(prev, dtype=np.float32) * 0.58 + delta.astype(np.float32) * 0.42
        self._smooth[key] = smoothed
        return smoothed


def _center(points: np.ndarray) -> np.ndarray:
    return points.mean(axis=0).astype(np.float32)


def _scale_region(frame: np.ndarray, center: np.ndarray, radius: float, scale: float) -> np.ndarray:
    import cv2

    if abs(scale - 1.0) < 1e-4 or radius <= 1:
        return frame
    h, w = frame.shape[:2]
    x0 = max(0, int(center[0] - radius))
    y0 = max(0, int(center[1] - radius))
    x1 = min(w, int(center[0] + radius))
    y1 = min(h, int(center[1] + radius))
    if x1 <= x0 or y1 <= y0:
        return frame

    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    dx = xx - center[0]
    dy = yy - center[1]
    dist = np.sqrt(dx * dx + dy * dy)
    falloff = np.clip(1.0 - dist / radius, 0.0, 1.0) ** 2
    local = np.clip(1.0 + (scale - 1.0) * falloff, 0.72, 1.32)
    map_x = center[0] + dx / np.maximum(local, 1e-3)
    map_y = center[1] + dy / np.maximum(local, 1e-3)
    warped = cv2.remap(frame, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    out = frame.copy()
    alpha = cv2.GaussianBlur(falloff, (0, 0), radius * 0.08)[..., None]
    roi = frame[y0:y1, x0:x1].astype(np.float32)
    out[y0:y1, x0:x1] = np.clip(warped.astype(np.float32) * alpha + roi * (1.0 - alpha), 0, 255).astype(np.uint8)
    return out


def _shift_region(frame: np.ndarray, center: np.ndarray, radius: float, delta: np.ndarray) -> np.ndarray:
    import cv2

    if float(np.linalg.norm(delta)) < 1e-4 or radius <= 1:
        return frame
    h, w = frame.shape[:2]
    x0 = max(0, int(center[0] - radius))
    y0 = max(0, int(center[1] - radius))
    x1 = min(w, int(center[0] + radius))
    y1 = min(h, int(center[1] + radius))
    if x1 <= x0 or y1 <= y0:
        return frame

    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    dx = xx - center[0]
    dy = yy - center[1]
    dist = np.sqrt(dx * dx + dy * dy)
    falloff = np.clip(1.0 - dist / radius, 0.0, 1.0) ** 2
    map_x = xx - delta[0] * falloff
    map_y = yy - delta[1] * falloff
    warped = cv2.remap(frame, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    out = frame.copy()
    alpha = cv2.GaussianBlur(falloff, (0, 0), radius * 0.08)[..., None]
    roi = frame[y0:y1, x0:x1].astype(np.float32)
    out[y0:y1, x0:x1] = np.clip(warped.astype(np.float32) * alpha + roi * (1.0 - alpha), 0, 255).astype(np.uint8)
    return out
