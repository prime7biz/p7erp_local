"""Calendar-aware TNA planned dates and re-plan on delivery-date change (flag ``tna_auto_plan_v1``).

Extends the existing order-router auto-generate path. Never overwrites completed / approved /
cancelled actions. Never raises into the caller when used as a soft helper.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import is_tna_auto_plan_v1_enabled
from app.models import FactoryCalendarOverride, Order, Tenant, TenantProductionSettings
from app.models.merch import FollowupActionTemplate, OrderFollowupAction
from app.modules.merch.route_stages import action_route_values
from app.modules.production.calendar_service import is_working_day

logger = logging.getLogger(__name__)

_DONE = frozenset({"completed", "approved", "cancelled"})


def subtract_working_days(
    end: date,
    working_days: int,
    *,
    weekend_days: list[str] | None,
    overrides: dict[date, str],
) -> date:
    """Move backward ``working_days`` working days from ``end``."""
    if working_days is None or working_days <= 0:
        return end
    cur = end
    remaining = int(working_days)
    while remaining > 0:
        if is_working_day(cur, weekend_days=weekend_days, overrides=overrides):
            remaining -= 1
            if remaining <= 0:
                return cur
        cur -= timedelta(days=1)
        if (end - cur).days > 3660:
            return cur
    return cur


def planned_date_from_delivery(
    delivery: date,
    days_before: int | None,
    *,
    use_working_calendar: bool,
    weekend_days: list[str] | None,
    overrides: dict[date, str],
) -> date | None:
    if days_before is None:
        return None
    n = max(0, int(days_before))
    if use_working_calendar:
        return subtract_working_days(delivery, n, weekend_days=weekend_days, overrides=overrides)
    return delivery - timedelta(days=n)


async def _load_calendar(db: AsyncSession, tenant_id: int) -> tuple[list[str] | None, dict[date, str]]:
    weekend_days: list[str] | None = None
    r = await db.execute(
        select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant_id).limit(1)
    )
    settings = r.scalar_one_or_none()
    if settings and isinstance(settings.weekend_days, list):
        weekend_days = list(settings.weekend_days)
    overrides: dict[date, str] = {}
    ores = await db.execute(
        select(FactoryCalendarOverride).where(FactoryCalendarOverride.tenant_id == tenant_id)
    )
    for row in ores.scalars().all():
        kind = (row.override_type or "").strip().lower()
        if kind in ("holiday", "working_day") and row.override_date:
            overrides[row.override_date] = kind
    return weekend_days, overrides


async def ensure_followup_actions_for_order(
    db: AsyncSession,
    *,
    tenant: Tenant,
    order: Order,
    next_status: str,
) -> int:
    """Create missing follow-up actions (idempotent). Returns number of rows added."""
    status_key = (next_status or "").strip().upper()
    if status_key not in {"NEW", "CONFIRMED", "IN_PROGRESS"}:
        return 0

    existing = await db.execute(
        select(func.count())
        .select_from(OrderFollowupAction)
        .where(
            OrderFollowupAction.tenant_id == tenant.id,
            OrderFollowupAction.order_id == order.id,
        )
    )
    if (existing.scalar() or 0) > 0:
        return 0

    templates_result = await db.execute(
        select(FollowupActionTemplate)
        .where(
            FollowupActionTemplate.tenant_id == tenant.id,
            FollowupActionTemplate.is_active == True,  # noqa: E712
            or_(
                FollowupActionTemplate.buyer_id.is_(None),
                FollowupActionTemplate.buyer_id == order.customer_id,
            ),
        )
        .order_by(FollowupActionTemplate.sequence_no.asc(), FollowupActionTemplate.id.asc())
    )
    templates = list(templates_result.scalars().all())
    if not templates:
        return 0

    use_cal = is_tna_auto_plan_v1_enabled(tenant.feature_flags)
    weekend_days, overrides = (await _load_calendar(db, tenant.id)) if use_cal else (None, {})
    added = 0
    for template in templates:
        planned_date = None
        if order.delivery_date and template.default_days_before_delivery is not None:
            planned_date = planned_date_from_delivery(
                order.delivery_date,
                template.default_days_before_delivery,
                use_working_calendar=use_cal,
                weekend_days=weekend_days,
                overrides=overrides,
            )
        db.add(
            OrderFollowupAction(
                tenant_id=tenant.id,
                order_id=order.id,
                template_id=template.id,
                sequence_no=template.sequence_no,
                phase=template.phase,
                action_group=template.action_group,
                title=template.name,
                is_template_generated=True,
                is_mandatory=template.is_mandatory,
                is_active=template.is_active,
                planned_date=planned_date,
                status="pending",
                milestone_type=template.code,
                **action_route_values(template),
            )
        )
        added += 1
    return added


async def replan_open_followup_actions_on_delivery_change(
    db: AsyncSession,
    *,
    tenant: Tenant,
    order: Order,
    old_delivery_date: date | None,
) -> int:
    """Recompute planned_date for open template-generated actions when delivery date changes."""
    if not is_tna_auto_plan_v1_enabled(tenant.feature_flags):
        return 0
    if not order.delivery_date:
        return 0
    if old_delivery_date == order.delivery_date:
        return 0

    weekend_days, overrides = await _load_calendar(db, tenant.id)
    rows = (
        await db.execute(
            select(OrderFollowupAction).where(
                OrderFollowupAction.tenant_id == tenant.id,
                OrderFollowupAction.order_id == order.id,
                OrderFollowupAction.is_active.is_(True),
            )
        )
    ).scalars().all()
    if not rows:
        return 0

    template_ids = {r.template_id for r in rows if r.template_id}
    tmpl_by_id: dict[int, FollowupActionTemplate] = {}
    if template_ids:
        tres = await db.execute(
            select(FollowupActionTemplate).where(
                FollowupActionTemplate.tenant_id == tenant.id,
                FollowupActionTemplate.id.in_(template_ids),
            )
        )
        tmpl_by_id = {t.id: t for t in tres.scalars().all()}

    updated = 0
    for row in rows:
        st = (row.status or "").strip().lower()
        if st in _DONE:
            continue
        tmpl = tmpl_by_id.get(row.template_id) if row.template_id else None
        days = tmpl.default_days_before_delivery if tmpl else None
        if days is None:
            continue
        new_planned = planned_date_from_delivery(
            order.delivery_date,
            days,
            use_working_calendar=True,
            weekend_days=weekend_days,
            overrides=overrides,
        )
        if new_planned != row.planned_date:
            row.planned_date = new_planned
            updated += 1
    return updated
