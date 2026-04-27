"""Pydantic response/request schemas for jobs."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.job import JobStatus, OutputFormat


# ---------------------------------------------------------------------------
# Effects payload
# ---------------------------------------------------------------------------


class EyeContactEffect(BaseModel):
    enabled: bool = False
    # 0..1.2 — fraction of full correction toward the camera-facing target.
    strength: float = Field(default=1.0, ge=0.0, le=1.2)


class BeautyEffect(BaseModel):
    enabled: bool = False
    skin_smooth: float = Field(default=0.0, ge=0.0, le=1.0)
    teeth_whiten: float = Field(default=0.0, ge=0.0, le=1.0)
    eye_brighten: float = Field(default=0.0, ge=0.0, le=1.0)
    eye_size: float = Field(default=0.0, ge=-1.0, le=1.0)
    eye_distance: float = Field(default=0.0, ge=-1.0, le=1.0)
    inner_eye: float = Field(default=0.0, ge=-1.0, le=1.0)
    eye_position: float = Field(default=0.0, ge=-1.0, le=1.0)
    nose_width: float = Field(default=0.0, ge=-1.0, le=1.0)
    nose_bridge: float = Field(default=0.0, ge=-1.0, le=1.0)
    nose_height: float = Field(default=0.0, ge=-1.0, le=1.0)
    nose_root: float = Field(default=0.0, ge=-1.0, le=1.0)
    nose_size: float = Field(default=0.0, ge=-1.0, le=1.0)
    mouth_position: float = Field(default=0.0, ge=-1.0, le=1.0)
    smile: float = Field(default=0.0, ge=-1.0, le=1.0)
    mouth_size: float = Field(default=0.0, ge=-1.0, le=1.0)


class ClickPoint(BaseModel):
    x: float
    y: float
    # 1 = positive (this is the subject), 0 = negative (this is background)
    label: int = 1


class BackgroundEffect(BaseModel):
    enabled: bool = False
    # auto: MediaPipe Selfie segmentation (no clicks needed).
    # sam:  use the SAM2-tracked mask refined via subject_points.
    mode: Literal["auto", "sam"] = "auto"
    # transparent only valid when output_format == "webm_alpha".
    output: Literal["transparent", "color", "blur"] = "blur"
    color: Optional[str] = "#000000"
    blur_strength: int = Field(default=25, ge=1, le=99)
    invert_mask: bool = False


class EffectsPayload(BaseModel):
    eye_contact: EyeContactEffect = Field(default_factory=EyeContactEffect)
    beauty: BeautyEffect = Field(default_factory=BeautyEffect)
    background: BackgroundEffect = Field(default_factory=BackgroundEffect)
    output_format: OutputFormat = OutputFormat.MP4


class RenderRequest(BaseModel):
    effects: EffectsPayload


class SubjectMaskRequest(BaseModel):
    frame_time: float = Field(ge=0.0)
    points: List[ClickPoint]


class SubjectMaskResponse(BaseModel):
    mask_url: str
    frame_url: str


class PreviewFrameResponse(BaseModel):
    url: str
    width: int
    height: int
    duration: Optional[float] = None


class RetouchBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class RetouchFeatures(BaseModel):
    skin: bool = False
    eyes: bool = False
    teeth: bool = False


class RetouchAnalysisResponse(BaseModel):
    width: int
    height: int
    face: Optional[RetouchBox] = None
    left_eye: Optional[RetouchBox] = None
    right_eye: Optional[RetouchBox] = None
    teeth: Optional[RetouchBox] = None
    features: RetouchFeatures


# ---------------------------------------------------------------------------
# Job read shape
# ---------------------------------------------------------------------------


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: JobStatus
    original_filename: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    input_url: Optional[str] = None
    output_url: Optional[str] = None
    output_format: OutputFormat = OutputFormat.MP4
    progress: int = 0
    error: Optional[str] = None
    effects: Optional[dict[str, Any]] = None
    subject_points: Optional[list[dict[str, Any]]] = None
    preview_frame_url: Optional[str] = None
    mask_preview_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class JobCreateResponse(BaseModel):
    job: JobRead


class JobList(BaseModel):
    items: List[JobRead]
    total: int
