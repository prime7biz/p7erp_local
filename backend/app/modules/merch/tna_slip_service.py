"""Read-only TNA critical-path slip cascade (flag ``tna_auto_plan_v1``).

Never mutates planned dates. Surfaces projected slip days for downstream milestones
when an upstream action is late (or a provided ETA exceeds its planned date).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.tenant_feature_keys import is_tna_auto_plan_v1_enabled
from app.models import Tenant
from app.models.merch import FollowupActionTemplate, OrderFollowupAction
from app.modules.merch.constants import TNA_DEFAULT_PREDECESSORS

_DONE = frozenset({"completed", "approved", "cancelled"})
_KEY_DOWNSTREAM = ("cutting_start", "sewing_start", "finishing_start", "packing_complete", "ex_factory")


@dataclass(frozen=True)
class SlipWarning:
    milestone_code: str
    title: str
    planned_date: date | None
    projected_date: date | None
    slip_days: int
    cause_codes: tuple[str, ...]
    severity: str  # low | medium | high | critical

    def as_dict(self) -> dict[str, Any]:
        return {
            "milestone_code": self.milestone_code,
            "title": self.title,
            "planned_date": self.planned_date.isoformat() if self.planned_date else None,
            "projected_date": self.projected_date.isoformat() if self.projected_date else None,
            "slip_days": self.slip_days,
            "cause_codes": list(self.cause_codes),
            "severity": self.severity,
        }


def _severity(slip_days: int) -> str:
    if slip_days >= 14:
        return "critical"
    if slip_days >= 7:
        return "high"
    if slip_days >= 3:
        return "medium"
    return "low"


def _predecessors_for(code: str, tmpl: FollowupActionTemplate | None) -> tuple[str, ...]:
    if tmpl and isinstance(tmpl.predecessor_codes, list) and tmpl.predecessor_codes:
        return tuple(str(c).strip().lower() for c in tmpl.predecessor_codes if str(c).strip())
    return TNA_DEFAULT_PREDECESSORS.get((code or "").strip().lower(), ())


def compute_tna_slip_impact(
    *,
    actions: list[OrderFollowupAction],
    templates_by_id: dict[int, FollowupActionTemplate],
    as_of: date,
    eta_by_milestone: dict[str, date] | None = None,
) -> list[SlipWarning]:
    """Pure calculator. ``eta_by_milestone`` can inject external ETAs (e.g. PO ETA for fabric_in_house)."""
    by_code: dict[str, OrderFollowupAction] = {}
    for a in actions:
        code = (a.milestone_type or "").strip().lower()
        if not code and a.template_id and a.template_id in templates_by_id:
            code = (templates_by_id[a.template_id].code or "").strip().lower()
        if code:
            by_code[code] = a

    eta_by_milestone = eta_by_milestone or {}
    warnings: list[SlipWarning] = []

    # Effective completion / ETA date per upstream code.
    effective: dict[str, date] = {}
    for code, action in by_code.items():
        st = (action.status or "").strip().lower()
        if st in _DONE and action.actual_completion_date:
            effective[code] = action.actual_completion_date
        elif code in eta_by_milestone:
            effective[code] = eta_by_milestone[code]
        elif action.planned_date and st not in _DONE and action.planned_date < as_of:
            # Open and already past planned → treat as slipped to as_of.
            effective[code] = as_of

    for code in _KEY_DOWNSTREAM:
        action = by_code.get(code)
        if not action:
            continue
        st = (action.status or "").strip().lower()
        if st in _DONE:
            continue
        tmpl = templates_by_id.get(action.template_id) if action.template_id else None
        preds = _predecessors_for(code, tmpl)
        if not preds:
            continue
        planned = action.planned_date
        if not planned:
            continue
        cause: list[str] = []
        latest_pred: date | None = None
        for p in preds:
            if p not in effective:
                continue
            pred_date = effective[p]
            pred_action = by_code.get(p)
            pred_planned = pred_action.planned_date if pred_action else None
            # Only count as a cause when the predecessor is later than its own plan or later than as_of open slip.
            if pred_planned and pred_date > pred_planned:
                cause.append(p)
                if latest_pred is None or pred_date > latest_pred:
                    latest_pred = pred_date
            elif pred_action and (pred_action.status or "").lower() not in _DONE and pred_date >= as_of:
                cause.append(p)
                if latest_pred is None or pred_date > latest_pred:
                    latest_pred = pred_date
        if not cause or latest_pred is None:
            continue
        # Projected start = max(planned, latest_pred + 1 calendar day) as a simple lag.
        projected = max(planned, latest_pred + timedelta(days=1))
        slip = (projected - planned).days
        if slip <= 0:
            continue
        warnings.append(
            SlipWarning(
                milestone_code=code,
                title=action.title or code,
                planned_date=planned,
                projected_date=projected,
                slip_days=slip,
                cause_codes=tuple(cause),
                severity=_severity(slip),
            )
        )
    warnings.sort(key=lambda w: (-w.slip_days, w.milestone_code))
    return warnings


async def get_order_tna_slip_warnings(
    db: AsyncSession,
    *,
    tenant: Tenant,
    order_id: int,
    eta_by_milestone: dict[str, date] | None = None,
) -> list[dict[str, Any]]:
    if not is_tna_auto_plan_v1_enabled(tenant.feature_flags):
        return []
    rows = list(
        (
            await db.execute(
                select(OrderFollowupAction).where(
                    OrderFollowupAction.tenant_id == tenant.id,
                    OrderFollowupAction.order_id == order_id,
                    OrderFollowupAction.is_active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return []
    template_ids = {r.template_id for r in rows if r.template_id}
    templates_by_id: dict[int, FollowupActionTemplate] = {}
    if template_ids:
        tres = await db.execute(
            select(FollowupActionTemplate).where(
                FollowupActionTemplate.tenant_id == tenant.id,
                FollowupActionTemplate.id.in_(template_ids),
            )
        )
        templates_by_id = {t.id: t for t in tres.scalars().all()}
    as_of = today_local(tenant)
    return [
        w.as_dict()
        for w in compute_tna_slip_impact(
            actions=rows,
            templates_by_id=templates_by_id,
            as_of=as_of,
            eta_by_milestone=eta_by_milestone,
        )
    ]
