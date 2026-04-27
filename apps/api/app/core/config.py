"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "EyeContactFixer API"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    API_PREFIX: str = "/api/v1"

    # CORS
    CORS_ORIGINS: List[str] | str = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )

    # Database (NeonDB / Postgres)
    # Example: postgresql+asyncpg://user:pass@ep-xxxx.neon.tech/dbname?sslmode=require
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/eyecontact"

    # Redis / Queue
    REDIS_URL: str = "redis://localhost:6379/0"
    QUEUE_NAME: str = "eyecontact"
    MASK_QUEUE_NAME: str = "eyecontact-fast"

    # Cloudinary (storage)
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    CLOUDINARY_UPLOAD_FOLDER: str = "eyecontact"

    # Upload limits
    MAX_UPLOAD_BYTES: int = 200 * 1024 * 1024  # 200 MB
    ALLOWED_VIDEO_MIME: List[str] | str = Field(
        default_factory=lambda: [
            "video/mp4",
            "video/quicktime",
            "video/x-matroska",
            "video/webm",
        ]
    )

    # Local cache for input copies the API needs to extract preview frames from.
    PREVIEW_CACHE_DIR: str = "/tmp/eyecontact-preview"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("ALLOWED_VIDEO_MIME", mode="before")
    @classmethod
    def _split_mimes(cls, value):
        if isinstance(value, str):
            return [m.strip() for m in value.split(",") if m.strip()]
        return value

    @property
    def async_database_url(self) -> str:
        """Return DATABASE_URL normalized to an asyncpg SQLAlchemy URL."""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://") :]
        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://") :]

        # Neon/Postgres URLs often use sslmode=require; asyncpg expects `ssl=...`.
        parsed = urlparse(url)
        query_items = parse_qsl(parsed.query, keep_blank_values=True)
        normalized_query: list[tuple[str, str]] = []
        drop_for_asyncpg = {"channel_binding", "gssencmode", "target_session_attrs"}
        for key, value in query_items:
            if key in drop_for_asyncpg:
                continue
            if key == "sslmode":
                normalized_query.append(("ssl", value))
            else:
                normalized_query.append((key, value))
        return urlunparse(parsed._replace(query=urlencode(normalized_query)))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
