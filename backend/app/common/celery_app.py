"""Celery application factory (optional; used when Redis broker is configured)."""

from __future__ import annotations

from celery import Celery

from app.config import get_settings


def make_celery() -> Celery:
    settings = get_settings()
    broker = (getattr(settings, "celery_broker_url", None) or "").strip() or (settings.redis_url or "redis://localhost:6379/0")
    backend = (getattr(settings, "celery_result_backend", None) or "").strip() or broker
    app = Celery(
        "p7erp",
        broker=str(broker),
        backend=str(backend),
    )
    app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
    )
    return app


celery_app = make_celery()

# Register tasks (decorators need celery_app defined above).
from app.workers import forecast_worker as _forecast_worker  # noqa: E402, F401
from app.workers import platform_worker as _platform_worker  # noqa: E402, F401
from app.workers import task_worker as _task_worker  # noqa: E402, F401
