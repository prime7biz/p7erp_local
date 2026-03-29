"""Task creation policy: whitelist, cooldown, hourly frequency (Phase-2)."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_tool import AiSystemTask, AiTaskPolicy


async def evaluate_task_creation_policy(
    db: AsyncSession,
    *,
    tenant_id: int,
    task_type: str,
    simulation: bool,
) -> tuple[bool, str | None]:
    """Returns (allowed, reason). No matching rows => allow."""
    q = await db.execute(
        select(AiTaskPolicy).where(
            or_(AiTaskPolicy.tenant_id.is_(None), AiTaskPolicy.tenant_id == tenant_id),
            AiTaskPolicy.task_type.in_(("*", task_type)),
        )
    )
    rows = list(q.scalars().all())
    if not rows:
        return True, None

    def sort_key(p: AiTaskPolicy) -> tuple[int, int, int]:
        return (
            p.priority,
            1 if p.tenant_id == tenant_id else 0,
            1 if p.task_type == task_type else 0,
        )

    rows.sort(key=sort_key, reverse=True)
    policy = rows[0]

    if not policy.is_enabled:
        return False, "This task type is disabled by policy."

    if simulation and not policy.allow_simulation:
        return False, "Simulation mode is not allowed for this task type."

    if policy.cooldown_seconds and policy.cooldown_seconds > 0:
        last = (
            await db.execute(
                select(func.max(AiSystemTask.created_at)).where(
                    AiSystemTask.tenant_id == tenant_id,
                    AiSystemTask.task_type == task_type,
                )
            )
        ).scalar_one_or_none()
        if last and (datetime.utcnow() - last).total_seconds() < policy.cooldown_seconds:
            return False, "Task cooldown is active for this task type."

    if policy.max_frequency_per_hour and policy.max_frequency_per_hour > 0:
        since = datetime.utcnow() - timedelta(hours=1)
        cnt = (
            await db.execute(
                select(func.count())
                .select_from(AiSystemTask)
                .where(
                    AiSystemTask.tenant_id == tenant_id,
                    AiSystemTask.task_type == task_type,
                    AiSystemTask.created_at >= since,
                )
            )
        ).scalar_one()
        if int(cnt or 0) >= policy.max_frequency_per_hour:
            return False, "Hourly frequency limit reached for this task type."

    return True, None
