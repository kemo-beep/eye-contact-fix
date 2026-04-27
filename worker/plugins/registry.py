"""Plugin registry + adapter from the current effects payload."""
from __future__ import annotations

from typing import Any, Mapping, Optional

from worker.core.plugin_base import VideoPlugin
from worker.plugins.auto_frame.plugin import AutoFramePlugin
from worker.plugins.background_blur.plugin import BackgroundBlurPlugin
from worker.plugins.eye_contact.plugin import EyeContactPlugin
from worker.plugins.eye_enhance.plugin import EyeEnhancePlugin
from worker.plugins.face_relight.plugin import FaceRelightPlugin
from worker.plugins.skin_retouch.plugin import SkinRetouchPlugin
from worker.plugins.teeth_whiten.plugin import TeethWhitenPlugin


PLUGIN_REGISTRY: dict[str, type[VideoPlugin]] = {
    EyeContactPlugin.id: EyeContactPlugin,
    SkinRetouchPlugin.id: SkinRetouchPlugin,
    TeethWhitenPlugin.id: TeethWhitenPlugin,
    EyeEnhancePlugin.id: EyeEnhancePlugin,
    FaceRelightPlugin.id: FaceRelightPlugin,
    BackgroundBlurPlugin.id: BackgroundBlurPlugin,
    AutoFramePlugin.id: AutoFramePlugin,
}


def load_plugins(plugin_configs: list[Mapping[str, Any]]) -> list[VideoPlugin]:
    plugins: list[VideoPlugin] = []
    for config in plugin_configs:
        if not config.get("enabled", True):
            continue
        plugin_id = str(config["id"])
        plugin_class = PLUGIN_REGISTRY[plugin_id]
        plugins.append(plugin_class(dict(config.get("settings") or {})))
    return sorted(plugins, key=lambda plugin: plugin.order)


def configs_from_effects(
    effects: Mapping[str, Any],
    sam_masks: Optional[dict[int, Any]] = None,
) -> list[dict[str, Any]]:
    configs: list[dict[str, Any]] = []

    background = effects.get("background") or {}
    if background.get("enabled"):
        settings = dict(background)
        settings["sam_masks"] = sam_masks
        configs.append(
            {
                "id": "background_blur",
                "enabled": True,
                "settings": settings,
            }
        )

    relight = effects.get("face_relight") or {}
    if relight.get("enabled"):
        configs.append(
            {
                "id": "face_relight",
                "enabled": True,
                "settings": dict(relight),
            }
        )

    beauty = effects.get("beauty") or {}
    if beauty.get("enabled"):
        skin_smooth = float(beauty.get("skin_smooth", 0.0))
        eye_brighten = float(beauty.get("eye_brighten", 0.0))
        teeth_whiten = float(beauty.get("teeth_whiten", 0.0))
        if skin_smooth > 0:
            configs.append(
                {
                    "id": "skin_retouch",
                    "enabled": True,
                    "settings": {"skin_smooth": skin_smooth},
                }
            )
        if eye_brighten > 0:
            configs.append(
                {
                    "id": "eye_enhance",
                    "enabled": True,
                    "settings": {"eye_brighten": eye_brighten},
                }
            )
        if teeth_whiten > 0:
            configs.append(
                {
                    "id": "teeth_whiten",
                    "enabled": True,
                    "settings": {"teeth_whiten": teeth_whiten},
                }
            )

    eye_contact = effects.get("eye_contact") or {}
    if eye_contact.get("enabled"):
        configs.append(
            {
                "id": "eye_contact",
                "enabled": True,
                "settings": dict(eye_contact),
            }
        )

    auto_frame = effects.get("auto_frame") or {}
    if auto_frame.get("enabled"):
        configs.append(
            {
                "id": "auto_frame",
                "enabled": True,
                "settings": dict(auto_frame),
            }
        )

    return configs

