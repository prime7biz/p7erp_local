"""Deterministic metrics and rollups for merch sample workspace."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GarmentStyle, MerchSampleRequest
from app.models.merch import MerchSampleCostLine, MerchSampleTask


async def load_style_labels(
    db: AsyncSession, *, tenant_id: int, style_ids: set[int]
) -> dict[int, tuple[str | None, str | None]]:
    if not style_ids:
        return {}
    rows = (
        await db.scalars(
            select(GarmentStyle).where(
                GarmentStyle.tenant_id == tenant_id,
                GarmentStyle.id.in_(style_ids),
            )
        )
    ).all()
    return {s.id: (s.style_code, s.name) for s in rows}


def compute_sample_metrics(
    *,
    sample: MerchSampleRequest,
    tasks: list[MerchSampleTask],
    cost_lines: list[MerchSampleCostLine],
) -> dict[str, Any]:
    """Productivity + costing rollups (no LLM)."""
    lead_days: int | None = None
    if sample.actual_date and sample.created_at:
        try:
            c = sample.created_at.date() if hasattr(sample.created_at, "date") else sample.created_at
            lead_days = (sample.actual_date - c).days
        except (TypeError, ValueError):
            lead_days = None

    planned_slip_days: int | None = None
    if sample.target_date and sample.actual_date:
        planned_slip_days = (sample.actual_date - sample.target_date).days

    total_planned_span = 0
    bottleneck_step: str | None = None
    max_span = 0
    for t in tasks:
        if t.planned_start and t.planned_end:
            span = (t.planned_end - t.planned_start).days + 1
            total_planned_span += span
            if span > max_span:
                max_span = span
                bottleneck_step = t.step_name

    avg_pct = None
    if tasks:
        pcts = [float(t.pct_complete or 0) for t in tasks]
        avg_pct = sum(pcts) / len(pcts)

    total_cost = Decimal("0")
    for line in cost_lines:
        if line.amount is not None:
            total_cost += line.amount
        elif line.qty is not None and line.rate is not None:
            total_cost += line.qty * line.rate

    return {
        "lead_time_days": lead_days,
        "planned_vs_actual_days": planned_slip_days,
        "task_count": len(tasks),
        "avg_task_pct_complete": round(avg_pct, 2) if avg_pct is not None else None,
        "planned_span_days_sum": total_planned_span,
        "bottleneck_step": bottleneck_step,
        "total_cost_amount": str(total_cost) if total_cost else "0",
    }
