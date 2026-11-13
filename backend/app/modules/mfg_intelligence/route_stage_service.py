"""External route stages of an order (read-only; Phase 2, R4).

Stages are the order's follow-up (TNA) actions that carry route fields copied from their template (migration 299).
An EXTERNAL_PROCESS (wash / print / embroidery outside) or SUBCONTRACT stage is a lead-time stage only: there is no
subcontractor capacity. Before / after sewing is `stage_position` PRE_SEWING / POST_SEWING; subcontract sewing itself
is position SEWING.

- open = active, not cancelled, not completed (status `completed` or an actual completion date)
- `post_sewing_open_lead_time_days` = sum of lead_time_days of the open POST_SEWING external stages (stages are
  assumed to run one after another; calendar days). Delivery prediction adds it after the sewing finish date, only
  when the tenant flag `mfg_integrated_planning_v1` is on.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OrderFollowupAction
from app.modules.merch.route_stages import EXTERNAL_STAGE_KINDS

POSITIONS = ("PRE_SEWING", "SEWING", "POST_SEWING")
MAX_STAGES_PER_ORDER = 200
_DONE = "completed"
_CANCELLED = "cancelled"


def _is_done(a: Any) -> bool:
    return (a.status or "").strip().lower() == _DONE or a.actual_completion_date is not None


def _stage_out(a: Any) -> dict[str, Any]:
    return {
        "action_id": a.id,
        "title": a.title,
        "route_code": a.route_code,
        "stage_kind": a.stage_kind,
        "stage_position": a.stage_position,
        "gate_class": a.gate_class,
        "lead_time_days": int(a.lead_time_days) if a.lead_time_days is not None else None,
        "status": a.status,
        "planned_date": a.planned_date,
        "actual_completion_date": a.actual_completion_date,
        "is_open": not _is_done(a),
    }


async def external_stages_for_orders(db: AsyncSession, tenant_id: int, order_ids: list[int]) -> dict[int, list[Any]]:
    """Active, not cancelled external / subcontract stages per order (one batched query)."""
    if not order_ids:
        return {}
    a = OrderFollowupAction
    rows = (
        await db.execute(
            select(a)
            .where(
                a.tenant_id == tenant_id,
                a.order_id.in_(order_ids),
                a.is_active.is_(True),
                a.stage_kind.in_(EXTERNAL_STAGE_KINDS),
                a.stage_position.in_(POSITIONS),
            )
            .order_by(a.order_id, a.sequence_no, a.id)
            .limit(MAX_STAGES_PER_ORDER * max(1, len(order_ids)))
        )
    ).scalars().all()
    out: dict[int, list[Any]] = {}
    for r in rows:
        if (r.status or "").strip().lower() == _CANCELLED:
            continue
        out.setdefault(int(r.order_id), []).append(r)
    return out


def open_post_sewing_lead_days(stages: list[Any]) -> int:
    return sum(
        int(s.lead_time_days or 0) for s in stages if s.stage_position == "POST_SEWING" and not _is_done(s)
    )


async def route_stages_payload(db: AsyncSession, tenant_id: int, order: Any) -> dict[str, Any]:
    stages = (await external_stages_for_orders(db, tenant_id, [order.id])).get(order.id, [])
    by_pos: dict[str, list[dict[str, Any]]] = {p: [] for p in POSITIONS}
    for s in stages:
        by_pos[s.stage_position].append(_stage_out(s))
    missing_lead = [s.id for s in stages if s.lead_time_days is None and not _is_done(s)]
    return {
        "order_id": order.id,
        "order_code": order.order_code,
        "route_codes": sorted({s.route_code for s in stages if s.route_code}),
        "pre_sewing": by_pos["PRE_SEWING"],
        "subcontract_sewing": by_pos["SEWING"],
        "post_sewing": by_pos["POST_SEWING"],
        "pre_sewing_open_lead_time_days": sum(
            int(s.lead_time_days or 0) for s in stages if s.stage_position == "PRE_SEWING" and not _is_done(s)
        ),
        "post_sewing_open_lead_time_days": open_post_sewing_lead_days(stages),
        "stages_without_lead_time": missing_lead,
        "assumptions": [
            "External and subcontract stages are lead-time stages only (no subcontractor capacity).",
            "Open stages of the same position run one after another; lead times are calendar days.",
        ],
    }
