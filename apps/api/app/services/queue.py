"""Redis + RQ queue helpers for enqueuing video processing jobs.

Two queues:
  - default render queue (heavy work, long timeout)
  - fast preview queue (single-frame SAM2 mask, short timeout) — keeps the
    inspector subject picker snappy even while a render is in flight.
"""
from __future__ import annotations

import uuid
from functools import lru_cache
from typing import Any, Mapping

import redis
from rq import Queue

from app.core.config import settings


@lru_cache
def get_redis() -> redis.Redis:
    return redis.from_url(settings.REDIS_URL)


@lru_cache
def get_render_queue() -> Queue:
    return Queue(
        settings.QUEUE_NAME,
        connection=get_redis(),
        default_timeout=60 * 30,
    )


@lru_cache
def get_mask_queue() -> Queue:
    return Queue(
        settings.MASK_QUEUE_NAME,
        connection=get_redis(),
        default_timeout=60 * 5,
    )


def enqueue_render(job_id: uuid.UUID, effects: Mapping[str, Any]) -> str:
    """Enqueue the full multi-effect render task."""
    rq_job = get_render_queue().enqueue(
        "worker.main.process_render_job",
        str(job_id),
        dict(effects),
        job_id=f"render-{job_id}",
        result_ttl=3600,
        failure_ttl=24 * 3600,
    )
    return rq_job.id


def enqueue_mask_preview(
    job_id: uuid.UUID,
    frame_time: float,
    points: list[dict[str, Any]],
) -> str:
    """Enqueue a single-frame SAM2 mask preview."""
    rq_job = get_mask_queue().enqueue(
        "worker.main.process_mask_preview",
        str(job_id),
        float(frame_time),
        list(points),
        job_id=f"mask-{job_id}-{int(frame_time * 1000)}",
        result_ttl=900,
        failure_ttl=3600,
    )
    return rq_job.id
