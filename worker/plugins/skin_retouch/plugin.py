from __future__ import annotations

from worker.effects.beauty import BeautyEffect
from worker.plugins.base import EffectPlugin


class SkinRetouchPlugin(EffectPlugin):
    id = "skin_retouch"
    name = "Skin Retouch"
    order = 30
    requires_landmarks = True

    def build_effect(self) -> BeautyEffect:
        return BeautyEffect(
            enabled=True,
            skin_smooth=float(self.settings.get("skin_smooth", 0.0)),
            teeth_whiten=0.0,
            eye_brighten=0.0,
        )

