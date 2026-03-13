from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ManufacturingDowntimeEvent, ManufacturingNcr, ManufacturingTnaPlanTask, ManufacturingWorkOrder
from app.modules.ai_tool.query_parser import parse_search_query


async def get_production_summary(db: AsyncSession, *, tenant_id: int) -> dict:
    work_order_rows = (
        await db.execute(
            select(ManufacturingWorkOrder.status, func.count())
            .where(ManufacturingWorkOrder.tenant_id == tenant_id)
            .group_by(ManufacturingWorkOrder.status)
        )
    ).all()
    tna_task_rows = (
        await db.execute(
            select(ManufacturingTnaPlanTask.status, func.count())
            .where(ManufacturingTnaPlanTask.tenant_id == tenant_id)
            .group_by(ManufacturingTnaPlanTask.status)
        )
    ).all()

    wo_status = {str(status or "unknown"): int(count) for status, count in work_order_rows}
    tna_status = {str(status or "unknown"): int(count) for status, count in tna_task_rows}

    total_work_orders = sum(wo_status.values())
    in_progress = wo_status.get("in_progress", 0) + wo_status.get("released", 0)
    return {
        "title": "Production Summary",
        "summary": f"{total_work_orders} work order(s), {in_progress} currently active.",
        "data": {
            "work_orders_by_status": wo_status,
            "tna_tasks_by_status": tna_status,
        },
    }


async def search_production_issues(db: AsyncSession, *, tenant_id: int, prompt: str) -> dict:
    query = parse_search_query(prompt)
    open_ncr = int(
        (
            await db.execute(
                select(func.count()).select_from(ManufacturingNcr).where(
                    ManufacturingNcr.tenant_id == tenant_id,
                    ManufacturingNcr.status.in_(["open", "OPEN", "in_progress", "IN_PROGRESS"]),
                )
            )
        ).scalar()
        or 0
    )
    open_downtime = int(
        (
            await db.execute(
                select(func.count()).select_from(ManufacturingDowntimeEvent).where(
                    ManufacturingDowntimeEvent.tenant_id == tenant_id,
                    ManufacturingDowntimeEvent.ended_at.is_(None),
                )
            )
        ).scalar()
        or 0
    )
    ncr_rows = (
        await db.execute(
            select(ManufacturingNcr)
            .where(ManufacturingNcr.tenant_id == tenant_id)
            .order_by(ManufacturingNcr.created_at.desc())
            .limit(query.top_n)
        )
    ).scalars().all()
    items = [
        {
            "ncr_code": row.ncr_code,
            "status": row.status,
            "defect_code": row.defect_code,
            "severity": row.severity,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in ncr_rows
    ]
    return {
        "title": "Production Issues",
        "summary": f"{open_ncr} open NCR(s), {open_downtime} ongoing downtime event(s).",
        "data": {
            "applied_filters": ["latest production issues"],
            "open_ncr": open_ncr,
            "open_downtime_events": open_downtime,
            "items": items,
        },
    }
