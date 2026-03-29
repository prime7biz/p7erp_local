from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_tool import AiSystemTask
from app.modules.ai_tool.tasks.dead_letter import record_dead_letter
from app.modules.ai_tool.tasks.lifecycle import can_transition

logger = logging.getLogger(__name__)

TaskHandler = Callable[[AsyncSession, AiSystemTask], Awaitable[dict[str, Any]]]


async def _handler_echo(_db: AsyncSession, task: AiSystemTask) -> dict[str, Any]:
    """Default handler: acknowledge task and echo payload (safe placeholder)."""
    return {
        "handled": True,
        "task_type": task.task_type,
        "message": "Task executed in placeholder mode; register a domain handler to perform real work.",
        "payload": task.payload or {},
    }


TASK_HANDLERS: dict[str, TaskHandler] = {}


def register_handler(task_type: str, fn: TaskHandler) -> None:
    TASK_HANDLERS[task_type.lower()] = fn


# Built-in examples (optional keys)
register_handler("data_quality_ping", _handler_echo)
register_handler("echo", _handler_echo)


async def execute_system_task_inline(db: AsyncSession, row: AiSystemTask) -> None:
    """
    Run task synchronously inside the request/MCP transaction.
    On repeated failures, moves to dead-letter after max_retries.
    """
    if row.simulation:
        row.status = "running"
        row.started_at = datetime.utcnow()
        await db.flush()
        handler = TASK_HANDLERS.get(row.task_type.lower()) or _handler_echo
        try:
            preview = await handler(db, row)
            row.result_json = {"simulated": True, "preview": preview}
            row.status = "completed"
            row.completed_at = datetime.utcnow()
            row.error_text = None
        except Exception as exc:  # noqa: BLE001
            row.status = "failed"
            row.error_text = str(exc)
            row.completed_at = datetime.utcnow()
        await db.flush()
        return

    if row.scheduled_at and row.scheduled_at > datetime.utcnow():
        return

    prev = row.status
    if not can_transition(prev, "running"):
        logger.warning("Skipping illegal transition %s -> running for task %s", prev, row.id)
        return

    row.status = "running"
    row.started_at = datetime.utcnow()
    await db.flush()

    handler = TASK_HANDLERS.get(row.task_type.lower()) or _handler_echo
    try:
        result = await handler(db, row)
        row.result_json = result
        row.status = "completed"
        row.completed_at = datetime.utcnow()
        row.error_text = None
    except Exception as exc:  # noqa: BLE001
        logger.exception("System task %s failed", row.id)
        row.retry_count = int(row.retry_count or 0) + 1
        row.error_text = str(exc)
        if row.retry_count >= row.max_retries:
            row.status = "failed"
            row.completed_at = datetime.utcnow()
            await record_dead_letter(
                db,
                tenant_id=row.tenant_id,
                original_task_id=row.id,
                failure_reason=str(exc),
                last_payload=row.payload,
                retry_exhausted=True,
            )
        else:
            backoff_seconds = min(300, 2 ** int(row.retry_count or 0))
            row.status = "queued"
            row.queued_at = datetime.utcnow()
            row.scheduled_at = datetime.utcnow() + timedelta(seconds=backoff_seconds)
    await db.flush()
