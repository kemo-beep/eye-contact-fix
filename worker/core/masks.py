"""Shared mask utilities for plugins."""
from __future__ import annotations

from typing import Any, Optional

import numpy as np


def frame_mask(masks: Optional[dict[int, Any]], frame_index: int) -> Optional[np.ndarray]:
    if not masks:
        return None
    mask = masks.get(frame_index)
    if mask is None:
        return None
    return np.clip(mask.astype(np.float32), 0.0, 1.0)

