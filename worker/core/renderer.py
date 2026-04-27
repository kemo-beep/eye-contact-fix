"""Frame writers for plugin pipeline output."""
from __future__ import annotations

import os
from typing import Optional

import numpy as np

from worker.gaze.video_io import (
    AlphaWebMWriter,
    VideoMeta,
    ensure_dir,
    mux_audio,
    mux_audio_webm,
    open_writer,
)


class VideoRenderer:
    def __init__(self, output_path: str, input_path: str, meta: VideoMeta, output_format: str) -> None:
        self.output_path = output_path
        self.input_path = input_path
        self.meta = meta
        self.output_format = output_format
        self.tmp_path: Optional[str] = None
        self.writer = None
        self.alpha_writer: Optional[AlphaWebMWriter] = None

    def __enter__(self) -> "VideoRenderer":
        ensure_dir(os.path.dirname(self.output_path) or ".")
        if self.output_format == "webm_alpha":
            self.tmp_path = self.output_path + ".alpha.webm"
            self.alpha_writer = AlphaWebMWriter(self.tmp_path, self.meta).__enter__()
        else:
            self.tmp_path = self.output_path + ".novideoaudio.mp4"
            self.writer = open_writer(self.tmp_path, self.meta)
        return self

    def write(self, frame: np.ndarray, alpha: Optional[np.ndarray]) -> None:
        if self.alpha_writer is not None:
            if alpha is None:
                alpha = np.full(frame.shape[:2], 255, dtype="uint8")
            self.alpha_writer.write(frame, alpha)
            return
        if self.writer is None:
            raise RuntimeError("VideoRenderer is not open")
        self.writer.write(frame)

    def __exit__(self, exc_type, exc, tb) -> None:
        if self.writer is not None:
            self.writer.release()
        if self.alpha_writer is not None:
            self.alpha_writer.__exit__(exc_type, exc, tb)

    def mux(self) -> str:
        if not self.tmp_path:
            raise RuntimeError("VideoRenderer was not opened")
        if self.output_format == "webm_alpha":
            final = mux_audio_webm(self.tmp_path, self.input_path, self.output_path)
        else:
            final = mux_audio(self.tmp_path, self.input_path, self.output_path)
        try:
            os.remove(self.tmp_path)
        except OSError:
            pass
        return final

