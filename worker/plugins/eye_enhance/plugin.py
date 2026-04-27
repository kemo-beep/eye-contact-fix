from __future__ import annotations

from worker.effects.beauty import BeautyEffect
from worker.plugins.base import EffectPlugin


class EyeEnhancePlugin(EffectPlugin):
    id = "eye_enhance"
    name = "Eye Enhance"
    order = 55
    requires_landmarks = True

    def build_effect(self) -> BeautyEffect:
        return BeautyEffect(
            enabled=True,
            skin_smooth=0.0,
            teeth_whiten=0.0,
            eye_brighten=float(self.settings.get("eye_brighten", 0.0)),
        )

