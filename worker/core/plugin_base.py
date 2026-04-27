"""Shared video plugin contract."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np

from worker.effects.base import FrameContext, RenderMeta


@dataclass
class ProcessingContext:
    job_id: str
    input_path: str
    output_path: str
    meta: Optional[RenderMeta] = None
    fps: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    total_frames: Optional[int] = None
    face_tracks: dict[int, Any] = field(default_factory=dict)
    landmarks: dict[int, Any] = field(default_factory=dict)
    masks: dict[int, Any] = field(default_factory=dict)
    cache: dict[str, Any] = field(default_factory=dict)
    frame_context: Optional[FrameContext] = None


class VideoPlugin(ABC):
    id: str
    name: str
    version = "1.0.0"
    order = 100
    requires_landmarks = False

    def __init__(self, settings: Optional[dict[str, Any]] = None) -> None:
        self.settings = settings or {}

    @abstractmethod
    def prepare(self, context: ProcessingContext) -> None:
        pass

    @abstractmethod
    def process_frame(
        self,
        frame: np.ndarray,
        frame_index: int,
        context: ProcessingContext,
    ) -> np.ndarray:
        pass

    @abstractmethod
    def finalize(self, context: ProcessingContext) -> None:
        pass

