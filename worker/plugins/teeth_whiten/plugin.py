from __future__ import annotations

from worker.effects.beauty import BeautyEffect
from worker.plugins.base import EffectPlugin


class TeethWhitenPlugin(EffectPlugin):
    id = "teeth_whiten"
    name = "Teeth Whiten"
    order = 60
    requires_landmarks = True

    def build_effect(self) -> BeautyEffect:
        return BeautyEffect(
            enabled=True,
            skin_smooth=0.0,
            teeth_whiten=float(self.settings.get("teeth_whiten", 0.0)),
            eye_brighten=0.0,
        )

