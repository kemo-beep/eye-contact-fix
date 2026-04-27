"""Background effect — composite the subject onto a new background.

Three output modes:
    - transparent: keep RGBA, the encoder will write WebM with an alpha plane.
    - color: blend onto a flat RGB color.
    - blur: keep the subject sharp, blur the original background heavily.

Mask source:
    - mode="auto": MediaPipe Selfie Segmentation, recomputed every frame.
    - mode="sam":  precomputed SAM2 masks indexed by frame number.
"""
from __future__ import annotations

import logging
from typing import Dict, Literal, Optional

import numpy as np

from worker.effects.base import Effect, FrameContext, RenderMeta

logger = logging.getLogger(__name__)


def _hex_to_bgr(hex_color: str) -> np.ndarray:
    s = (hex_color or "#000000").lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) != 6:
        return np.array([0, 0, 0], dtype=np.uint8)
    r = int(s[0:2], 16)
    g = int(s[2:4], 16)
    b = int(s[4:6], 16)
    return np.array([b, g, r], dtype=np.uint8)


class BackgroundEffect:
    name = "background"

    def __init__(
        self,
        *,
        enabled: bool = True,
        mode: Literal["auto", "sam"] = "auto",
        output: Literal["transparent", "color", "blur"] = "blur",
        color: str = "#000000",
        blur_strength: int = 25,
        invert_mask: bool = False,
        sam_masks: Optional[Dict[int, np.ndarray]] = None,
    ) -> None:
        self.enabled = enabled
        self.mode = mode
        self.output = output
        self.color = color
        self.invert_mask = invert_mask
        # Convert "0..99" UI scale to a Gaussian kernel size that's odd and >=3.
        k = max(3, int(blur_strength) | 1)
        self.kernel = (k, k)
        self._sam_masks = sam_masks
        self._auto = None

    def prepare(self, meta: RenderMeta) -> None:
        if not self.enabled:
            return
        if self.mode == "auto":
            from worker.segmentation.auto import AutoSegmenter

            self._auto = AutoSegmenter()
        elif self.mode == "sam":
            if not self._sam_masks:
                logger.warning(
                    "BackgroundEffect mode=sam but no precomputed masks were "
                    "provided; falling back to auto."
                )
                from worker.segmentation.auto import AutoSegmenter

                self._auto = AutoSegmenter()
                self.mode = "auto"

    # ---- mask -------------------------------------------------------------
    def _build_mask(self, ctx: FrameContext) -> Optional[np.ndarray]:
        if self.mode == "sam" and self._sam_masks:
            mask = self._sam_masks.get(ctx.frame_idx)
            if mask is None:
                # If SAM2 didn't emit a mask for this frame (rare), fall through.
                return None
            mask = mask.astype(np.float32)
            return 1.0 - np.clip(mask, 0.0, 1.0) if self.invert_mask else mask
        if self._auto is not None and ctx.frame is not None:
            mask = self._auto.segment(ctx.frame)
            return 1.0 - np.clip(mask, 0.0, 1.0) if self.invert_mask else mask
        return None

    # ---- composite --------------------------------------------------------
    def _composite(self, frame: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, Optional[np.ndarray]]:
        import cv2

        # Normalize to [0,1] HxWx1.
        m = np.clip(mask, 0.0, 1.0).astype(np.float32)
        if m.ndim == 2:
            m3 = m[..., None]
        else:
            m3 = m

        if self.output == "transparent":
            # Premultiplied? VP9 alpha mux works with straight (non-premul)
            # RGBA. Just attach the alpha plane.
            alpha = (m * 255.0).clip(0, 255).astype(np.uint8)
            return frame, alpha

        if self.output == "color":
            bg_color = _hex_to_bgr(self.color)
            bg = np.broadcast_to(bg_color, frame.shape).astype(np.float32)
            out = frame.astype(np.float32) * m3 + bg * (1.0 - m3)
            return np.clip(out, 0, 255).astype(np.uint8), None

        if self.output == "blur":
            blurred = cv2.GaussianBlur(frame, self.kernel, 0)
            out = frame.astype(np.float32) * m3 + blurred.astype(np.float32) * (1.0 - m3)
            return np.clip(out, 0, 255).astype(np.uint8), None

        return frame, None

    def apply(self, ctx: FrameContext) -> None:
        if not self.enabled or ctx.frame is None:
            return
        mask = self._build_mask(ctx)
        if mask is None:
            return
        ctx.subject_mask = mask
        new_frame, alpha = self._composite(ctx.frame, mask)
        ctx.frame = new_frame
        if alpha is not None:
            ctx.alpha = alpha

    def close(self) -> None:
        if self._auto is not None:
            try:
                self._auto.close()
            except Exception:
                pass
