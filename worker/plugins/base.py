"""Adapters for existing frame effects."""
from __future__ import annotations

from typing import Any, Optional

import numpy as np

from worker.core.plugin_base import ProcessingContext, VideoPlugin
from worker.effects.base import Effect


class EffectPlugin(VideoPlugin):
    requires_landmarks = False

    def __init__(self, settings: Optional[dict[str, Any]] = None) -> None:
        super().__init__(settings)
        self.effect: Optional[Effect] = None

    def build_effect(self) -> Effect:
        raise NotImplementedError

    def prepare(self, context: ProcessingContext) -> None:
        self.effect = self.build_effect()
        if context.meta is not None:
            self.effect.prepare(context.meta)

    def process_frame(
        self,
        frame: np.ndarray,
        frame_index: int,
        context: ProcessingContext,
    ) -> np.ndarray:
        if self.effect is None or context.frame_context is None:
            return frame
        context.frame_context.frame = frame
        self.effect.apply(context.frame_context)
        return context.frame_context.frame if context.frame_context.frame is not None else frame

    def finalize(self, context: ProcessingContext) -> None:
        if self.effect is not None:
            self.effect.close()

