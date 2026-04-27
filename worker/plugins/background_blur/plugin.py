from __future__ import annotations

from worker.effects.background import BackgroundEffect
from worker.plugins.base import EffectPlugin


class BackgroundBlurPlugin(EffectPlugin):
    id = "background_blur"
    name = "Background"
    order = 20

    def build_effect(self) -> BackgroundEffect:
        return BackgroundEffect(
            enabled=True,
            mode=self.settings.get("mode", "auto"),
            output=self.settings.get("output", "blur"),
            color=self.settings.get("color") or "#000000",
            blur_strength=int(self.settings.get("blur_strength", 25)),
            invert_mask=bool(self.settings.get("invert_mask", False)),
            sam_masks=self.settings.get("sam_masks"),
        )

