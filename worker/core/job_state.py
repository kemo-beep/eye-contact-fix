"""Job state callbacks used by the worker pipeline."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional


ProgressCallback = Callable[[int, int], None]


@dataclass
class JobState:
    on_progress: Optional[ProgressCallback] = None

    def progress(self, done: int, total: int) -> None:
        if self.on_progress is not None:
            self.on_progress(done, total)

