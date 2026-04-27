"""Run an RQ worker against the configured Redis queues.

We listen to two queues, with the fast (mask preview) queue first so an
interactive subject-picker request never has to wait behind a long render.
"""
from __future__ import annotations

import logging

import redis
from rq import Queue, Worker

from worker.config import settings


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    conn = redis.from_url(settings.REDIS_URL)
    queues = [
        Queue(settings.MASK_QUEUE_NAME, connection=conn),
        Queue(settings.QUEUE_NAME, connection=conn),
    ]
    Worker(queues, connection=conn).work(with_scheduler=True)


if __name__ == "__main__":
    main()
