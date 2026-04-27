from __future__ import annotations

import numpy as np

from worker.core.plugin_base import ProcessingContext, VideoPlugin


class AutoFramePlugin(VideoPlugin):
    id = "auto_frame"
    name = "Auto Frame"
    order = 90
    requires_landmarks = True

    def prepare(self, context: ProcessingContext) -> None:
        return

    def process_frame(
        self,
        frame: np.ndarray,
        frame_index: int,
        context: ProcessingContext,
    ) -> np.ndarray:
        return frame

    def finalize(self, context: ProcessingContext) -> None:
        return

