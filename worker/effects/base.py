"""Effect protocol + per-frame context.

Each effect owns one transformation. The pipeline composes them in this
order per frame:

    1. Build subject mask (BackgroundEffect populates ctx.subject_mask)
    2. Run face landmarks once (eye_contact + beauty both need them)
    3. Beauty (in-place pixel work — skin smoothing, teeth, eyes)
    4. Eye-contact (iris warp)
    5. Background composite (transparent / color / blur)

The strict ordering matters:
  - Mask is computed against the ORIGINAL silhouette so beauty/eye-contact
    pixel changes can't drift the mask.
  - Beauty runs before eye-contact so we don't smooth an already-warped iris.
  - Background composite is last so transparency works without re-mixing.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

import numpy as np


@dataclass
class RenderMeta:
    """Static info about the render that effects may inspect during prepare()."""

    width: int
    height: int
    fps: float
    frame_count: int
    output_format: str = "mp4"  # "mp4" | "webm_alpha"
    work_dir: str = "/tmp"


@dataclass
class FrameContext:
    """Mutable per-frame state, shared across effects.

    Effects read/write fields here so we don't recompute landmarks or the
    subject mask multiple times per frame.
    """

    frame_idx: int = 0
    # The frame we're operating on. Effects may replace it with a modified copy.
    frame: Optional[np.ndarray] = None
    # Cached MediaPipe FaceMesh result for this frame (lazily built).
    landmarks: Any = None
    # Float32 [0, 1] mask, same height/width as frame. 1 = subject.
    subject_mask: Optional[np.ndarray] = None
    # If the final composite needs an alpha channel (transparent BG), this
    # holds it. The encoder will see RGBA when this is set.
    alpha: Optional[np.ndarray] = None
    # Per-effect scratch space.
    state: dict[str, Any] = field(default_factory=dict)


class Effect(Protocol):
    """Each effect is a small object with two methods."""

    name: str
    enabled: bool

    def prepare(self, meta: RenderMeta) -> None:
        """Called once before iteration. Load models, allocate buffers, etc."""

    def apply(self, ctx: FrameContext) -> None:
        """Mutate ctx (in-place)."""

    def close(self) -> None:
        """Release any held resources."""
