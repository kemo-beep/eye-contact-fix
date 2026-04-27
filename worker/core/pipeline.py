"""Plugin-based video processing pipeline."""
from __future__ import annotations

import logging
import os
from typing import Iterable, Optional

from worker.core.job_state import ProgressCallback
from worker.core.plugin_base import ProcessingContext, VideoPlugin
from worker.core.renderer import VideoRenderer
from worker.core.tracking import LandmarkTracker
from worker.effects.base import FrameContext, RenderMeta
from worker.gaze.video_io import iter_frames, open_video

logger = logging.getLogger(__name__)


class PipelineRunner:
    def __init__(
        self,
        *,
        job_id: str,
        input_path: str,
        output_path: str,
        output_format: str,
        plugins: Iterable[VideoPlugin],
        on_progress: Optional[ProgressCallback] = None,
    ) -> None:
        self.job_id = job_id
        self.input_path = input_path
        self.output_path = output_path
        self.output_format = output_format
        self.plugins = sorted(list(plugins), key=lambda p: p.order)
        self.on_progress = on_progress

    def run(self) -> str:
        cap, meta = open_video(self.input_path)
        logger.info(
            "Pipeline opened %s -> %dx%d @ %.2ffps (%d frames), plugins=%s",
            self.input_path,
            meta.width,
            meta.height,
            meta.fps,
            meta.frame_count,
            [p.id for p in self.plugins],
        )
        render_meta = RenderMeta(
            width=meta.width,
            height=meta.height,
            fps=meta.fps,
            frame_count=meta.frame_count,
            output_format=self.output_format,
            work_dir=os.path.dirname(self.output_path),
        )
        context = ProcessingContext(
            job_id=self.job_id,
            input_path=self.input_path,
            output_path=self.output_path,
            meta=render_meta,
            fps=meta.fps,
            width=meta.width,
            height=meta.height,
            total_frames=meta.frame_count,
        )
        tracker = LandmarkTracker(
            enabled=any(plugin.requires_landmarks for plugin in self.plugins)
        )

        try:
            for plugin in self.plugins:
                plugin.prepare(context)

            processed = 0
            renderer = VideoRenderer(
                self.output_path,
                self.input_path,
                meta,
                self.output_format,
            )
            with renderer:
                for idx, frame in enumerate(iter_frames(cap)):
                    frame_ctx = FrameContext(frame_idx=idx, frame=frame)
                    context.frame_context = frame_ctx
                    landmarks = tracker.detect(frame)
                    if landmarks is not None:
                        context.landmarks[idx] = landmarks
                        frame_ctx.landmarks = landmarks

                    out = frame
                    for plugin in self.plugins:
                        out = plugin.process_frame(out, idx, context)
                        frame_ctx.frame = out

                    renderer.write(out, frame_ctx.alpha)
                    processed += 1
                    if self.on_progress and (
                        processed % 5 == 0 or processed == meta.frame_count
                    ):
                        self.on_progress(processed, meta.frame_count)

            final = renderer.mux()
        finally:
            cap.release()
            tracker.close()
            for plugin in self.plugins:
                try:
                    plugin.finalize(context)
                except Exception:
                    logger.exception("Plugin finalize failed: %s", plugin.id)
        return final
