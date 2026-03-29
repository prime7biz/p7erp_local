"""Forecast Celery tasks (stub: enqueue sync path via HTTP/MCP in production)."""

from __future__ import annotations

import logging

from app.common.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="ai.forecast.run_placeholder", bind=True)
def run_forecast_placeholder(self, tenant_id: int, target_variable: str, timeframe: str) -> dict:
    """Placeholder task — wire to job_manager + async session in worker process when enabling Celery."""
    logger.info(
        "forecast placeholder task",
        extra={"tenant_id": tenant_id, "target": target_variable, "task_id": self.request.id},
    )
    return {"ok": True, "tenant_id": tenant_id, "target_variable": target_variable, "timeframe": timeframe}
