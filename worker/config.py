"""Worker configuration."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    REDIS_URL: str = "redis://localhost:6379/0"
    QUEUE_NAME: str = "eyecontact"
    MASK_QUEUE_NAME: str = "eyecontact-fast"

    # Use a sync driver for the worker (psycopg2). Strip async drivers if present.
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/eyecontact"

    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    CLOUDINARY_UPLOAD_FOLDER: str = "eyecontact"

    # Eye contact pipeline knobs
    GAZE_WARP_STRENGTH: float = 1.0
    TEMPORAL_SMOOTH: float = 0.5
    MAX_SHIFT_IRIS_RADII: float = 1.4

    # Beauty defaults (used when payload omits them)
    DEFAULT_SKIN_SMOOTH: float = 0.5
    DEFAULT_TEETH_WHITEN: float = 0.5
    DEFAULT_EYE_BRIGHTEN: float = 0.4

    # SAM2 segmentation
    SAM2_MODEL: str = "sam2_hiera_tiny"
    SAM2_DEVICE: str = "cpu"
    SAM2_WEIGHTS_DIR: str = "/models/sam2"
    # If sam2 isn't installed or weights aren't downloadable, the worker
    # falls back to MediaPipe Selfie for "auto" and reports a clear error
    # for "sam".
    SAM2_ENABLED: bool = True

    # Encoding
    ALLOW_WEBM_ALPHA: bool = True

    TMP_DIR: str = "/tmp/eyecontact"

    @property
    def sync_database_url(self) -> str:
        url = self.DATABASE_URL
        for prefix in ("postgresql+asyncpg://", "postgres+asyncpg://"):
            if url.startswith(prefix):
                return "postgresql://" + url[len(prefix):]
        return url


@lru_cache
def get_settings() -> WorkerSettings:
    return WorkerSettings()


settings = get_settings()
