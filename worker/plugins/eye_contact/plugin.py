from __future__ import annotations

from worker.config import settings as worker_settings
from worker.effects.eye_contact import EyeContactEffect
from worker.plugins.base import EffectPlugin


class EyeContactPlugin(EffectPlugin):
    id = "eye_contact"
    name = "Eye Contact"
    order = 50
    requires_landmarks = True

    def build_effect(self) -> EyeContactEffect:
        return EyeContactEffect(
            enabled=True,
            strength=float(self.settings.get("strength", 1.0)),
            temporal_alpha=worker_settings.TEMPORAL_SMOOTH,
            max_shift_iris_radii=worker_settings.MAX_SHIFT_IRIS_RADII,
        )

