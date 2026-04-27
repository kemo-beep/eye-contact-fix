"""SAM2 wrappers: click-driven image masks + propagated video masks.

The full SAM2 stack (PyTorch + sam2) is heavy. We import lazily so the
worker process boots without the dependency, and we expose two entry points:

- ``predict_image_mask(frame_bgr, points, labels)``: one-shot mask for a
  single still. Used by ``process_mask_preview`` to show the user what
  their clicks select.
- ``propagate_masks(frames_dir, frame_idx, points, labels)``: run the SAM2
  video predictor over all extracted JPEG frames in ``frames_dir`` and
  return a dict of frame_idx -> binary uint8 mask.

Weights are cached under ``settings.SAM2_WEIGHTS_DIR`` so repeated jobs
don't re-download. On CPU this is multiples slower than auto mode; we log
a clear warning so operators know to run on a GPU host for long clips.
"""
from __future__ import annotations

import logging
import os
import urllib.request
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np

from worker.config import settings

logger = logging.getLogger(__name__)


# Default model: sam2.1_hiera_tiny (~150MB). Smallest variant — best fit
# for CPU, lower mIoU than the large model but still very usable for
# talking-head clips.
_MODEL_SPECS = {
    "sam2_hiera_tiny": {
        "weights_url": (
            "https://dl.fbaipublicfiles.com/segment_anything_2/072824/"
            "sam2_hiera_tiny.pt"
        ),
        "config": "sam2_hiera_t.yaml",
        "weights_filename": "sam2_hiera_tiny.pt",
    },
    "sam2.1_hiera_tiny": {
        "weights_url": (
            "https://dl.fbaipublicfiles.com/segment_anything_2/092824/"
            "sam2.1_hiera_tiny.pt"
        ),
        "config": "configs/sam2.1/sam2.1_hiera_t.yaml",
        "weights_filename": "sam2.1_hiera_tiny.pt",
    },
}


def _is_available() -> bool:
    if not settings.SAM2_ENABLED:
        return False
    try:
        import sam2  # noqa: F401
        import torch  # noqa: F401
        return True
    except Exception:
        return False


def _ensure_weights() -> str:
    spec = _MODEL_SPECS.get(settings.SAM2_MODEL) or _MODEL_SPECS["sam2_hiera_tiny"]
    target_dir = settings.SAM2_WEIGHTS_DIR
    os.makedirs(target_dir, exist_ok=True)
    target = os.path.join(target_dir, spec["weights_filename"])
    if not os.path.exists(target) or os.path.getsize(target) < 1024:
        logger.info("Downloading SAM2 weights from %s ...", spec["weights_url"])
        urllib.request.urlretrieve(spec["weights_url"], target)
    return target


# ---------------------------------------------------------------------------
# Image predictor (single frame)
# ---------------------------------------------------------------------------


@dataclass
class _LoadedImagePredictor:
    predictor: object
    device: str


_IMG_CACHE: Optional[_LoadedImagePredictor] = None


def _load_image_predictor() -> _LoadedImagePredictor:
    global _IMG_CACHE
    if _IMG_CACHE is not None:
        return _IMG_CACHE

    from sam2.build_sam import build_sam2  # type: ignore
    from sam2.sam2_image_predictor import SAM2ImagePredictor  # type: ignore

    spec = _MODEL_SPECS.get(settings.SAM2_MODEL) or _MODEL_SPECS["sam2_hiera_tiny"]
    weights = _ensure_weights()
    device = settings.SAM2_DEVICE

    logger.info(
        "Loading SAM2 image predictor model=%s device=%s",
        settings.SAM2_MODEL, device,
    )
    sam2_model = build_sam2(spec["config"], weights, device=device)
    predictor = SAM2ImagePredictor(sam2_model)
    _IMG_CACHE = _LoadedImagePredictor(predictor=predictor, device=device)
    return _IMG_CACHE


def predict_image_mask(
    frame_bgr: np.ndarray,
    points: List[Tuple[float, float]],
    labels: List[int],
) -> np.ndarray:
    """Return a binary uint8 mask (HxW) for the subject defined by ``points``.

    Raises ``RuntimeError`` if SAM2 isn't available — callers should catch
    and fall back to MediaPipe Selfie.
    """
    if not _is_available():
        raise RuntimeError(
            "SAM2 is not installed in this worker image. "
            "Install with `pip install sam2` (and torch) to enable refine-subject."
        )

    import cv2

    loaded = _load_image_predictor()

    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    loaded.predictor.set_image(rgb)
    point_coords = np.array(points, dtype=np.float32) if points else None
    point_labels = np.array(labels, dtype=np.int32) if labels else None

    masks, scores, _ = loaded.predictor.predict(
        point_coords=point_coords,
        point_labels=point_labels,
        multimask_output=True,
    )
    if masks is None or len(masks) == 0:
        return np.zeros(frame_bgr.shape[:2], dtype=np.uint8)
    best = int(np.argmax(scores))
    mask = (masks[best] > 0).astype(np.uint8) * 255
    return mask


# ---------------------------------------------------------------------------
# Video predictor (whole clip)
# ---------------------------------------------------------------------------


def propagate_masks(
    frames_dir: str,
    frame_idx: int,
    points: List[Tuple[float, float]],
    labels: List[int],
) -> Dict[int, np.ndarray]:
    """Run SAM2 video predictor; return ``{frame_idx: binary_mask}``.

    ``frames_dir`` must already contain JPEGs named ``00000.jpg`` etc. SAM2
    expects this layout. Mask values are uint8 0/255.
    """
    if not _is_available():
        raise RuntimeError("SAM2 is not installed in this worker image.")

    from sam2.build_sam import build_sam2_video_predictor  # type: ignore

    spec = _MODEL_SPECS.get(settings.SAM2_MODEL) or _MODEL_SPECS["sam2_hiera_tiny"]
    weights = _ensure_weights()
    device = settings.SAM2_DEVICE

    if device == "cpu":
        logger.warning(
            "SAM2 video predictor running on CPU; this is multiples slower "
            "than GPU. For clips longer than ~30s, run the worker on a GPU host."
        )

    logger.info(
        "Loading SAM2 video predictor model=%s device=%s",
        settings.SAM2_MODEL, device,
    )
    predictor = build_sam2_video_predictor(spec["config"], weights, device=device)

    state = predictor.init_state(video_path=frames_dir)
    predictor.reset_state(state)
    if points:
        predictor.add_new_points_or_box(
            inference_state=state,
            frame_idx=int(frame_idx),
            obj_id=1,
            points=np.array(points, dtype=np.float32),
            labels=np.array(labels, dtype=np.int32),
        )

    out: Dict[int, np.ndarray] = {}
    for out_frame_idx, out_obj_ids, out_mask_logits in predictor.propagate_in_video(state):
        # mask_logits: (num_objs, 1, H, W) torch tensor.
        m = (out_mask_logits[0] > 0.0).cpu().numpy().squeeze().astype(np.uint8) * 255
        out[int(out_frame_idx)] = m

    return out


# Convenience:
def is_available() -> bool:
    return _is_available()
