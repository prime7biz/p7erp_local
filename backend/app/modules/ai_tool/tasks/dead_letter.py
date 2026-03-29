from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_tool import AiSystemTaskDeadLetter


async def record_dead_letter(
    db: AsyncSession,
    *,
    tenant_id: int,
    original_task_id: int,
    failure_reason: str,
    last_payload: dict[str, Any] | None,
    retry_exhausted: bool = True,
) -> AiSystemTaskDeadLetter:
    row = AiSystemTaskDeadLetter(
        tenant_id=tenant_id,
        original_task_id=original_task_id,
        failure_reason=failure_reason,
        last_payload=last_payload,
        retry_exhausted=retry_exhausted,
        acknowledged=False,
    )
    db.add(row)
    await db.flush()
    return row
