"""System-task Celery tasks (stub)."""

from __future__ import annotations

import logging

from app.common.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="ai.system_task.run_placeholder", bind=True)
def run_system_task_placeholder(self, task_id: int, tenant_id: int) -> dict:
    """Placeholder — inline executor runs in API/MCP today; move to worker for long jobs."""
    logger.info(
        "system task placeholder",
        extra={"task_id": task_id, "tenant_id": tenant_id, "celery_id": self.request.id},
    )
    return {"ok": True, "task_id": task_id, "tenant_id": tenant_id}
