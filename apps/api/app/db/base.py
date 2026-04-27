"""Async SQLAlchemy engine, session factory, and declarative base."""
from __future__ import annotations

import logging
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base class for all ORM models."""


# Neon (and PgBouncer transaction mode) require disabling the asyncpg
# statement cache; otherwise DDL / boot migrations can fail or appear to
# no-op while the ORM still expects new columns — see asyncpg + PgBouncer.
engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    pool_pre_ping=True,
    future=True,
    connect_args={"statement_cache_size": 0},
)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async session."""
    async with AsyncSessionLocal() as session:
        yield session


# Idempotent migrations applied at startup. We don't have Alembic configured yet
# and this project still uses Base.metadata.create_all(), which is additive at
# the table level but does NOT add new columns to existing tables nor add new
# enum values. These statements pick up the gap in a way that's safe to re-run.
_BOOT_MIGRATIONS: list[str] = [
    # New columns on jobs (status is varchar-backed; see _ensure_job_status_storage).
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS effects JSONB",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS subject_points JSONB",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS subject_frame_time JSONB",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS preview_frame_url TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mask_preview_url TEXT",
]


async def _ddl_autocommit(stmt: str) -> None:
    """Run a single DDL statement with DBAPI autocommit (Neon pooler safe)."""
    async with engine.connect() as conn:
        # AsyncConnection.execution_options is async (unlike sync Connection).
        ac = await conn.execution_options(isolation_level="AUTOCOMMIT")
        await ac.execute(text(stmt))


async def _scalar_one(sql: str) -> object | None:
    """Run a read-only statement and return first column of first row."""
    async with engine.connect() as conn:
        return await conn.scalar(text(sql))


_ALLOWED_JOBS_UDT_COLUMNS: frozenset[str] = frozenset({"status", "output_format"})


async def _jobs_column_udt_name(column: str) -> str | None:
    """Return information_schema.columns.udt_name, or None if column absent."""
    if column not in _ALLOWED_JOBS_UDT_COLUMNS:
        raise ValueError(f"invalid jobs column for udt lookup: {column!r}")
    return await _scalar_one(
        f"""
        SELECT c.udt_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'jobs'
          AND c.column_name = '{column}'
        """
    )


async def _ensure_job_status_storage() -> None:
    """Migrate legacy native job_status enum to varchar (lowercase values)."""
    udt = await _jobs_column_udt_name("status")
    if udt is None:
        await _ddl_autocommit(
            """
            ALTER TABLE public.jobs
            ADD COLUMN IF NOT EXISTS status character varying(32)
            NOT NULL DEFAULT 'draft'
            """
        )
    elif udt == "job_status":
        await _ddl_autocommit(
            "ALTER TABLE public.jobs ALTER COLUMN status DROP DEFAULT"
        )
        await _ddl_autocommit(
            """
            ALTER TABLE public.jobs
            ALTER COLUMN status TYPE character varying(32)
            USING (
                CASE status::text
                    WHEN 'DRAFT' THEN 'draft'
                    WHEN 'UPLOADED' THEN 'uploaded'
                    WHEN 'QUEUED' THEN 'queued'
                    WHEN 'PROCESSING' THEN 'processing'
                    WHEN 'COMPLETED' THEN 'completed'
                    WHEN 'FAILED' THEN 'failed'
                    WHEN 'draft' THEN 'draft'
                    WHEN 'uploaded' THEN 'uploaded'
                    WHEN 'queued' THEN 'queued'
                    WHEN 'processing' THEN 'processing'
                    WHEN 'completed' THEN 'completed'
                    WHEN 'failed' THEN 'failed'
                    ELSE lower(status::text)
                END
            )
            """
        )
        await _ddl_autocommit(
            "ALTER TABLE public.jobs ALTER COLUMN status SET DEFAULT 'draft'"
        )
        await _ddl_autocommit(
            "ALTER TABLE public.jobs ALTER COLUMN status SET NOT NULL"
        )
    await _ddl_autocommit("DROP TYPE IF EXISTS public.job_status")


async def _ensure_job_output_format() -> None:
    """Ensure output_format exists as varchar(32) with lowercase values (mp4 / webm_alpha)."""
    udt = await _jobs_column_udt_name("output_format")
    if udt is None:
        await _ddl_autocommit(
            """
            ALTER TABLE public.jobs
            ADD COLUMN IF NOT EXISTS output_format character varying(32)
            NOT NULL DEFAULT 'mp4'
            """
        )
    elif udt == "job_output_format":
        # Legacy native enum used SQLAlchemy member names (MP4, WEBM_ALPHA), not values.
        await _ddl_autocommit(
            "ALTER TABLE public.jobs ALTER COLUMN output_format DROP DEFAULT"
        )
        await _ddl_autocommit(
            """
            ALTER TABLE public.jobs
            ALTER COLUMN output_format TYPE character varying(32)
            USING (
                CASE output_format::text
                    WHEN 'MP4' THEN 'mp4'
                    WHEN 'WEBM_ALPHA' THEN 'webm_alpha'
                    WHEN 'mp4' THEN 'mp4'
                    WHEN 'webm_alpha' THEN 'webm_alpha'
                    ELSE lower(output_format::text)
                END
            )
            """
        )
        await _ddl_autocommit(
            "ALTER TABLE public.jobs ALTER COLUMN output_format SET DEFAULT 'mp4'"
        )
        await _ddl_autocommit(
            "ALTER TABLE public.jobs ALTER COLUMN output_format SET NOT NULL"
        )
    # Remove orphaned native enum so future tooling does not confuse it with the column.
    await _ddl_autocommit("DROP TYPE IF EXISTS public.job_output_format")


async def _assert_jobs_bootstrap_columns() -> None:
    for col in ("status", "output_format"):
        row = await _scalar_one(
            f"""
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'jobs'
              AND column_name = '{col}'
            """
        )
        if row is None:
            raise RuntimeError(
                f"Database bootstrap failed: public.jobs.{col} is still missing "
                "after migrations. If you use Neon, try DATABASE_URL without "
                "`-pooler` for the API service."
            )


async def init_db() -> None:
    """Create tables on startup and apply additive migrations."""
    from app.models import job  # noqa: F401  (ensure models are imported)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # DDL must not run inside a pooled implicit transaction: Neon/PgBouncer
    # transaction mode can roll back or isolate schema changes. Use autocommit.
    for stmt in _BOOT_MIGRATIONS:
        try:
            await _ddl_autocommit(stmt)
        except Exception as exc:  # pragma: no cover - best-effort, log and continue
            logger.warning("boot migration skipped (%s): %s", stmt, exc)

    try:
        await _ensure_job_status_storage()
        await _ensure_job_output_format()
    except Exception as exc:  # pragma: no cover
        logger.error("jobs column boot migration failed: %s", exc, exc_info=True)
        raise

    await _assert_jobs_bootstrap_columns()
    # DDL invalidates asyncpg prepared plans on pooled connections; discard pool.
    await engine.dispose()
