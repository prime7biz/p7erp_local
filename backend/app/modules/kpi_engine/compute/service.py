"""Tier-1 KPI computations. Read-only; finance adapters never post or mutate ledgers."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import safe_async_session_rollback
from app.models.kpi_engine import KpiDefinition
from app.modules.kpi_engine.compute_base import (
    KpiValue,
    apply_target_status,
    blocked,
    no_data,
    pct,
    utcnow,
)

logger = logging.getLogger(__name__)
FORMULA_VERSION = "tier1-v1"

OPEN_ORDER_EXCLUDED = ("COMPLETED", "CANCELLED", "CLOSED", "SHIPPED", "DELIVERED")


async def compute_kpi(
    db: AsyncSession,
    tenant_id: int,
    definition: KpiDefinition,
    *,
    as_of: date | None = None,
) -> KpiValue:
    code = definition.code
    unit = definition.unit or "%"
    if definition.blocked_reason:
        return blocked(code, unit, definition.blocked_reason)
    key = (definition.adapter_key or "").strip()
    try:
        handler = ADAPTERS.get(key)
        if not handler:
            return no_data(code, unit, [f"UNKNOWN_ADAPTER:{key or 'none'}"])
        value = await handler(db, tenant_id, definition, as_of or date.today())
        if value.target_value is None and value.status == "NO_DATA" and not value.missing_inputs:
            pass
        elif value.value is not None and value.status in {"NO_DATA", "NO_TARGET"}:
            value.status = apply_target_status(
                value.value,
                direction=definition.direction or "UP",
                target=value.target_value,
            )
        return value
    except Exception:
        logger.exception("kpi_compute_failed code=%s tenant=%s", code, tenant_id)
        await safe_async_session_rollback(db)
        return no_data(code, unit, ["COMPUTE_ERROR"])


async def _enquiry_to_order(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    from app.models.merch import Inquiry, Order

    enq = (
        await db.execute(select(func.count(Inquiry.id)).where(Inquiry.tenant_id == tid))
    ).scalar_one()
    # Orders that reference an inquiry (if column exists) else use confirmed orders / enquiries ratio loosely.
    has_inquiry = hasattr(Order, "inquiry_id")
    if has_inquiry:
        converted = (
            await db.execute(
                select(func.count(Order.id)).where(
                    Order.tenant_id == tid,
                    Order.inquiry_id.isnot(None),
                    func.upper(Order.status).notin_(OPEN_ORDER_EXCLUDED + ("DRAFT",)),
                )
            )
        ).scalar_one()
    else:
        converted = (
            await db.execute(
                select(func.count(Order.id)).where(
                    Order.tenant_id == tid,
                    func.upper(Order.status).notin_(OPEN_ORDER_EXCLUDED + ("DRAFT",)),
                )
            )
        ).scalar_one()
    den = Decimal(int(enq or 0))
    num = Decimal(int(converted or 0))
    val = pct(num, den)
    return KpiValue(
        code=d.code,
        value=val,
        unit="%",
        as_of=utcnow(),
        formula_version=FORMULA_VERSION,
        numerator=num,
        denominator=den,
        status="NO_DATA" if den == 0 else "NO_TARGET",
        missing_inputs=[] if has_inquiry else ["ORDER_INQUIRY_LINK_HEURISTIC"],
    )


async def _quotation_win_rate(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    from app.models.merch import Quotation

    rows = (
        await db.execute(select(Quotation.status).where(Quotation.tenant_id == tid))
    ).all()
    closed = accepted = 0
    for (st,) in rows:
        s = (st or "").upper()
        if s in {"ACCEPTED", "WON", "APPROVED", "CONVERTED", "ORDERED"}:
            accepted += 1
            closed += 1
        elif s in {"REJECTED", "LOST", "DECLINED", "CANCELLED", "EXPIRED"}:
            closed += 1
    num = Decimal(accepted)
    den = Decimal(closed)
    return KpiValue(
        code=d.code,
        value=pct(num, den),
        unit="%",
        as_of=utcnow(),
        formula_version=FORMULA_VERSION,
        numerator=num,
        denominator=den,
        status="NO_DATA" if den == 0 else "NO_TARGET",
    )


async def _order_book_value(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    from app.models.merch import Order

    # Prefer total_value / amount fields if present.
    amount_col = getattr(Order, "total_value", None) or getattr(Order, "order_value", None) or getattr(Order, "amount", None)
    if amount_col is None:
        # Fallback: quantity * unit_price if both exist.
        qty = getattr(Order, "quantity", None)
        price = getattr(Order, "unit_price", None)
        if qty is not None and price is not None:
            total = (
                await db.execute(
                    select(func.coalesce(func.sum(Order.quantity * Order.unit_price), 0)).where(
                        Order.tenant_id == tid,
                        func.upper(Order.status).notin_(OPEN_ORDER_EXCLUDED),
                    )
                )
            ).scalar_one()
        else:
            return no_data(d.code, "money", ["ORDER_VALUE_COLUMN_MISSING"])
    else:
        total = (
            await db.execute(
                select(func.coalesce(func.sum(amount_col), 0)).where(
                    Order.tenant_id == tid,
                    func.upper(Order.status).notin_(OPEN_ORDER_EXCLUDED),
                )
            )
        ).scalar_one()
    val = Decimal(str(total or 0))
    return KpiValue(
        code=d.code,
        value=val,
        unit="money",
        as_of=utcnow(),
        formula_version=FORMULA_VERSION,
        numerator=val,
        denominator=Decimal("1"),
        status="NO_TARGET",
    )


async def _buyer_retention(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    from app.models.merch import Order

    buyer_col = getattr(Order, "customer_id", None)
    if buyer_col is None:
        return no_data(d.code, "%", ["ORDER_CUSTOMER_ID_MISSING"])
    this_start = date(as_of.year, as_of.month, 1)
    prior_end = this_start - timedelta(days=1)
    prior_start = date(prior_end.year, prior_end.month, 1)
    # Use created_at or order_date.
    date_col = getattr(Order, "order_date", None) or getattr(Order, "created_at", None)
    if date_col is None:
        return no_data(d.code, "%", ["ORDER_DATE_MISSING"])

    async def buyers(start: date, end: date) -> set[int]:
        q = select(Order.customer_id).where(
            Order.tenant_id == tid,
            Order.customer_id.isnot(None),
        )
        if hasattr(Order, "order_date"):
            q = q.where(Order.order_date >= start, Order.order_date <= end)
        else:
            q = q.where(func.date(Order.created_at) >= start, func.date(Order.created_at) <= end)
        rows = (await db.execute(q.distinct())).scalars().all()
        return {int(x) for x in rows if x is not None}

    prior = await buyers(prior_start, prior_end)
    curr = await buyers(this_start, as_of)
    if not prior:
        return no_data(d.code, "%", ["NO_PRIOR_PERIOD_BUYERS"])
    retained = prior & curr
    num = Decimal(len(retained))
    den = Decimal(len(prior))
    return KpiValue(
        code=d.code,
        value=pct(num, den),
        unit="%",
        as_of=utcnow(),
        formula_version=FORMULA_VERSION,
        numerator=num,
        denominator=den,
        status="NO_TARGET",
    )


async def _tna_adherence(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    from app.models.merch import OrderFollowupAction

    rows = (
        await db.execute(
            select(OrderFollowupAction).where(
                OrderFollowupAction.tenant_id == tid,
                OrderFollowupAction.planned_date.isnot(None),
                OrderFollowupAction.planned_date <= as_of,
            )
        )
    ).scalars().all()
    completed_on_time = 0
    for a in rows:
        done = a.actual_completion_date or (a.completed_at.date() if a.completed_at else None)
        status = (a.status or "").upper()
        if done and a.planned_date and done <= a.planned_date:
            completed_on_time += 1
        elif status in {"DONE", "COMPLETED", "CLOSED", "APPROVED"} and a.planned_date and done and done <= a.planned_date:
            completed_on_time += 1
    num = Decimal(completed_on_time)
    den = Decimal(len(rows))
    return KpiValue(
        code=d.code,
        value=pct(num, den),
        unit="%",
        as_of=utcnow(),
        formula_version=FORMULA_VERSION,
        numerator=num,
        denominator=den,
        status="NO_DATA" if den == 0 else "NO_TARGET",
    )


async def _tna_delay_days(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    from app.models.merch import OrderFollowupAction

    rows = (
        await db.execute(
            select(OrderFollowupAction).where(
                OrderFollowupAction.tenant_id == tid,
                OrderFollowupAction.planned_date.isnot(None),
                OrderFollowupAction.planned_date < as_of,
            )
        )
    ).scalars().all()
    total = Decimal("0")
    for a in rows:
        status = (a.status or "").upper()
        if status in {"DONE", "COMPLETED", "CLOSED", "APPROVED"}:
            continue
        if a.planned_date:
            total += Decimal((as_of - a.planned_date).days)
    return KpiValue(
        code=d.code,
        value=total,
        unit="days",
        as_of=utcnow(),
        formula_version=FORMULA_VERSION,
        numerator=total,
        denominator=Decimal("1"),
        status="NO_TARGET",
    )


async def _order_risk_exposure(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    from app.models.merch import Order

    open_n = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.tenant_id == tid,
                func.upper(Order.status).notin_(OPEN_ORDER_EXCLUDED),
            )
        )
    ).scalar_one()
    late_n = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.tenant_id == tid,
                func.upper(Order.status).notin_(OPEN_ORDER_EXCLUDED),
                Order.delivery_date.isnot(None),
                Order.delivery_date < as_of,
            )
        )
    ).scalar_one()
    num = Decimal(int(late_n or 0))
    den = Decimal(int(open_n or 0))
    return KpiValue(
        code=d.code,
        value=pct(num, den),
        unit="%",
        as_of=utcnow(),
        formula_version=FORMULA_VERSION,
        numerator=num,
        denominator=den,
        status="NO_DATA" if den == 0 else "NO_TARGET",
        missing_inputs=["RISK_BAND_VALUE_PROXY_COUNT"],
    )


async def _sample_on_time(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.models.merch import MerchSampleRequest
    except Exception:
        return no_data(d.code, "%", ["SAMPLE_MODEL_MISSING"])
    due_col = getattr(MerchSampleRequest, "due_date", None)
    if due_col is None:
        return no_data(d.code, "%", ["SAMPLE_DUE_DATE_MISSING"])
    rows = (
        await db.execute(
            select(MerchSampleRequest).where(
                MerchSampleRequest.tenant_id == tid,
                MerchSampleRequest.due_date.isnot(None),
                MerchSampleRequest.due_date <= as_of,
            )
        )
    ).scalars().all()
    if not rows:
        return no_data(d.code, "%", ["NO_DUE_SAMPLES"])
    on_time = 0
    for s in rows:
        submitted = getattr(s, "submitted_at", None) or getattr(s, "sent_at", None)
        status = (getattr(s, "status", None) or "").upper()
        if submitted and s.due_date and submitted.date() <= s.due_date:
            on_time += 1
        elif status in {"SUBMITTED", "APPROVED", "SENT"} and s.due_date and s.due_date >= as_of:
            on_time += 1
    num = Decimal(on_time)
    den = Decimal(len(rows))
    return KpiValue(
        code=d.code,
        value=pct(num, den),
        unit="%",
        as_of=utcnow(),
        formula_version=FORMULA_VERSION,
        numerator=num,
        denominator=den,
        status="NO_TARGET",
    )


async def _sample_first_pass(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["SAMPLE_ITERATION_HISTORY_PARTIAL"])


async def _sample_cycle_days(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "days", ["SAMPLE_APPROVAL_TIMESTAMPS_PARTIAL"])


async def _costing_turnaround(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "days", ["COSTING_REQUEST_TIMESTAMP_PARTIAL"])


async def _cost_variance(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["STD_COST_AND_CAC_ADAPTER"])


async def _cm_variance(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "money", ["CM_ACTUAL_VS_QUOTED_ADAPTER"])


async def _supplier_otif(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    # Prefer MI supplier lateness when available.
    try:
        from app.modules.mfg_intelligence.supplier_lateness_service import build_supplier_lateness

        report = await build_supplier_lateness(db, tid)
        rate = None
        if isinstance(report, dict):
            rate = report.get("on_time_rate") or report.get("portfolio_on_time_rate")
            if rate is None and report.get("suppliers"):
                rates = [s.get("on_time_rate") for s in report["suppliers"] if s.get("on_time_rate") is not None]
                if rates:
                    rate = sum(Decimal(str(x)) for x in rates) / Decimal(len(rates))
        if rate is None:
            return no_data(d.code, "%", ["SUPPLIER_LATENESS_EMPTY"])
        val = Decimal(str(rate))
        if val <= 1:
            val = val * Decimal("100")
        return KpiValue(
            code=d.code,
            value=val,
            unit="%",
            as_of=utcnow(),
            formula_version=FORMULA_VERSION,
            status="NO_TARGET",
        )
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "%", ["SUPPLIER_LATENESS_UNAVAILABLE"])


async def _ppv(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "money", ["ITEM_STANDARD_PRICE_PARTIAL"])


async def _supplier_defect_rate(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["GRN_QC_AGGREGATE_PARTIAL"])


async def _material_readiness(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.modules.mfg_intelligence.summary_service import build_summary

        summary = await build_summary(db, tid)
        if isinstance(summary, dict):
            ready = summary.get("material_ready_count") or summary.get("ready_orders")
            total = summary.get("order_count") or summary.get("confirmed_orders")
            if ready is not None and total:
                num = Decimal(int(ready))
                den = Decimal(int(total))
                return KpiValue(
                    code=d.code,
                    value=pct(num, den),
                    unit="%",
                    as_of=utcnow(),
                    formula_version=FORMULA_VERSION,
                    numerator=num,
                    denominator=den,
                    status="NO_TARGET",
                )
        return no_data(d.code, "%", ["MI_SUMMARY_SHAPE"])
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "%", ["MI_READINESS_UNAVAILABLE"])


async def _fabric_readiness(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["FABRIC_BOM_READY_FILTER"])


async def _trim_readiness(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["TRIM_BOM_READY_FILTER"])


async def _inventory_accuracy(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["CYCLE_COUNT_RESULTS_MISSING"])


async def _inventory_days(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.modules.finance.statements.ratio_service import build_ratio_analysis

        report = await build_ratio_analysis(db, tid, as_of=as_of)
        if isinstance(report, dict):
            # Look for inventory turnover days / DIO style field.
            for key in ("inventory_turnover_days", "dio", "inventory_days", "WORKING_CAPITAL"):
                pass
            ratios = report.get("ratios") or report.get("items") or []
            if isinstance(ratios, list):
                for item in ratios:
                    code = (item.get("code") or item.get("id") or item.get("name") or "").upper()
                    if "INVENTORY" in code and "DAY" in code or code in {"DIO", "INVENTORY_DAYS"}:
                        val = item.get("value")
                        if val is not None:
                            return KpiValue(
                                code=d.code,
                                value=Decimal(str(val)),
                                unit="days",
                                as_of=utcnow(),
                                formula_version=FORMULA_VERSION,
                                status="NO_TARGET",
                            )
            if isinstance(ratios, dict):
                for k, v in ratios.items():
                    if "inventory" in k.lower() and v is not None:
                        return KpiValue(
                            code=d.code,
                            value=Decimal(str(v if not isinstance(v, dict) else v.get("value"))),
                            unit="days",
                            as_of=utcnow(),
                            formula_version=FORMULA_VERSION,
                            status="NO_TARGET",
                            missing_inputs=["RATIO_FIELD_HEURISTIC"],
                        )
        return no_data(d.code, "days", ["RATIO_INVENTORY_DAYS_SHAPE"])
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "days", ["RATIO_SERVICE_UNAVAILABLE"])


async def _dead_stock_pct(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["STOCK_AGEING_POLICY_N"])


async def _capacity_utilisation(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.modules.mfg_intelligence.summary_service import build_summary

        summary = await build_summary(db, tid)
        if isinstance(summary, dict):
            util = summary.get("utilization_pct") or summary.get("capacity_utilization_pct")
            if util is not None:
                return KpiValue(
                    code=d.code,
                    value=Decimal(str(util)),
                    unit="%",
                    as_of=utcnow(),
                    formula_version=FORMULA_VERSION,
                    status="NO_TARGET",
                )
        return no_data(d.code, "%", ["MI_UTILIZATION_MISSING"])
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "%", ["MI_CAPACITY_UNAVAILABLE"])


async def _capacity_booking_load(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return await _capacity_utilisation(db, tid, d, as_of)


async def _plan_attainment(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.models.production import HourlyProductionEntry

        good = (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tid,
                    HourlyProductionEntry.production_date == as_of,
                )
            )
        ).scalar_one()
        target_col = getattr(HourlyProductionEntry, "target_qty", None)
        if target_col is None:
            return no_data(d.code, "%", ["HOURLY_TARGET_QTY_MISSING"],)
        planned = (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.target_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tid,
                    HourlyProductionEntry.production_date == as_of,
                )
            )
        ).scalar_one()
        num = Decimal(str(good or 0))
        den = Decimal(str(planned or 0))
        return KpiValue(
            code=d.code,
            value=pct(num, den),
            unit="%",
            as_of=utcnow(),
            formula_version=FORMULA_VERSION,
            numerator=num,
            denominator=den,
            status="NO_DATA" if den == 0 else "NO_TARGET",
        )
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "%", ["HOURLY_ENTRY_UNAVAILABLE"])


async def _schedule_adherence(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return await _tna_adherence(db, tid, d, as_of)


async def _fabric_utilisation(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["MARKER_UTILISATION_FIELDS"])


async def _cut_plan_attainment(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["CUT_TICKET_PLAN_QTY"])


async def _cut_recut_rate(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["RECUT_REASON_CODES"])


async def _sewing_efficiency(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.modules.mfg_intelligence.empirical_efficiency_service import build_line_efficiency

        report = await build_line_efficiency(db, tid, as_of=as_of)
        if isinstance(report, dict):
            eff = report.get("efficiency_pct") or report.get("factory_efficiency_pct")
            if eff is None and report.get("lines"):
                vals = [Decimal(str(x["efficiency_pct"])) for x in report["lines"] if x.get("efficiency_pct") is not None]
                if vals:
                    eff = sum(vals) / Decimal(len(vals))
            if eff is not None:
                return KpiValue(
                    code=d.code,
                    value=Decimal(str(eff)),
                    unit="%",
                    as_of=utcnow(),
                    formula_version=FORMULA_VERSION,
                    status="NO_TARGET",
                    missing_inputs=["SMV_NOT_EFFECTIVE_DATED"],
                )
        return no_data(d.code, "%", ["EFFICIENCY_REPORT_EMPTY"])
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "%", ["EFFICIENCY_SERVICE_UNAVAILABLE"])


async def _operator_efficiency(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["OPERATOR_GRAIN_MISSING"])


async def _earned_minutes(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.modules.mfg_intelligence.empirical_efficiency_service import build_line_efficiency

        report = await build_line_efficiency(db, tid, as_of=as_of)
        if isinstance(report, dict):
            earned = report.get("earned_minutes") or report.get("earned_smv")
            if earned is not None:
                return KpiValue(
                    code=d.code,
                    value=Decimal(str(earned)),
                    unit="minutes",
                    as_of=utcnow(),
                    formula_version=FORMULA_VERSION,
                    status="NO_TARGET",
                )
        return no_data(d.code, "minutes", ["EARNED_MINUTES_MISSING"])
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "minutes", ["EFFICIENCY_SERVICE_UNAVAILABLE"])


async def _hourly_attainment(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return await _plan_attainment(db, tid, d, as_of)


async def _rft(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return blocked(d.code, "%", "QA_04_UNSTRUCTURED_QC")


async def _dhu(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return blocked(d.code, "DHU", "QA_04_UNSTRUCTURED_QC")


async def _reject_rate(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.models.production import HourlyProductionEntry

        good = (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tid,
                    HourlyProductionEntry.production_date == as_of,
                )
            )
        ).scalar_one()
        reject = (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.reject_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tid,
                    HourlyProductionEntry.production_date == as_of,
                )
            )
        ).scalar_one()
        produced = Decimal(str(good or 0)) + Decimal(str(reject or 0))
        num = Decimal(str(reject or 0))
        return KpiValue(
            code=d.code,
            value=pct(num, produced),
            unit="%",
            as_of=utcnow(),
            formula_version=FORMULA_VERSION,
            numerator=num,
            denominator=produced,
            status="NO_DATA" if produced == 0 else "NO_TARGET",
        )
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "%", ["HOURLY_REJECT_UNAVAILABLE"])


async def _final_inspection_pass(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["QC_CHECK_TYPE_FREE_TEXT"])


async def _capa_on_time(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["CAPA_DUE_DATES_PARTIAL"])


async def _shipment_otif(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    """OTIF using commitment revisions when present; else latest Order.delivery_date labelled."""
    from app.models.kpi_engine import OrderCommitmentRevision
    from app.models.merch import Order

    has_revisions = (
        await db.execute(
            select(func.count(OrderCommitmentRevision.id)).where(OrderCommitmentRevision.tenant_id == tid)
        )
    ).scalar_one()
    missing = [] if int(has_revisions or 0) > 0 else ["LATEST_DATE_BASIS"]

    due_orders = (
        await db.execute(
            select(Order).where(
                Order.tenant_id == tid,
                Order.delivery_date.isnot(None),
                Order.delivery_date <= as_of,
                func.upper(Order.status).notin_(("CANCELLED", "DRAFT")),
            )
        )
    ).scalars().all()
    if not due_orders:
        return no_data(d.code, "%", ["NO_DUE_ORDERS"] + missing)

    # Shipped proxy: status in SHIPPED/DELIVERED/COMPLETED or has shipment — status based.
    ok = 0
    for o in due_orders:
        st = (o.status or "").upper()
        committed = o.delivery_date
        if int(has_revisions or 0) > 0:
            rev = (
                await db.execute(
                    select(OrderCommitmentRevision)
                    .where(
                        OrderCommitmentRevision.tenant_id == tid,
                        OrderCommitmentRevision.order_id == o.id,
                    )
                    .order_by(OrderCommitmentRevision.revision_no.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if rev and rev.committed_date:
                committed = rev.committed_date
        if st in {"SHIPPED", "DELIVERED", "COMPLETED", "CLOSED"} and committed and committed <= as_of:
            # Without actual ship date, treat completed by committed date as OTIF pass if status shipped.
            ok += 1
        elif st in {"SHIPPED", "DELIVERED"}:
            ok += 1
    num = Decimal(ok)
    den = Decimal(len(due_orders))
    return KpiValue(
        code=d.code,
        value=pct(num, den),
        unit="%",
        as_of=utcnow(),
        formula_version=FORMULA_VERSION,
        numerator=num,
        denominator=den,
        status="NO_TARGET",
        missing_inputs=missing + ["SHIP_DATE_PROXY_STATUS"],
    )


async def _on_time_ex_factory(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return await _shipment_otif(db, tid, d, as_of)


async def _doc_first_pass(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["DOC_CORRECTION_FLAGS"])


async def _doc_cycle_days(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "days", ["DOC_COMPLETE_TIMESTAMPS"])


async def _export_proceeds_ageing(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "days", ["FX_RECEIPT_VS_INVOICE"])


async def _bond_utilisation(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["BD_BOND_REGISTER_ADAPTER"])


async def _gross_margin_pct(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.modules.finance.statements.ratio_service import build_ratio_analysis

        report = await build_ratio_analysis(db, tid, as_of=as_of)
        ratios = (report or {}).get("ratios") or (report or {}).get("items") or []
        if isinstance(ratios, list):
            for item in ratios:
                code = (item.get("code") or item.get("id") or "").upper()
                if "GROSS" in code and "PROFIT" in code or code in {"GROSS_PROFIT_PCT", "GP_PCT"}:
                    if item.get("value") is not None:
                        return KpiValue(
                            code=d.code,
                            value=Decimal(str(item["value"])),
                            unit="%",
                            as_of=utcnow(),
                            formula_version=FORMULA_VERSION,
                            status="NO_TARGET",
                        )
        return no_data(d.code, "%", ["GROSS_MARGIN_RATIO_SHAPE"])
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "%", ["RATIO_SERVICE_UNAVAILABLE"])


async def _contribution_margin_pct(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["MGMT_CONTRIBUTION_ADAPTER"])


async def _order_profitability(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "money", ["MI_CAC_ORDER_ROLLUP"])


async def _dso(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.modules.finance.statements.ratio_service import build_ratio_analysis

        report = await build_ratio_analysis(db, tid, as_of=as_of)
        ratios = (report or {}).get("ratios") or (report or {}).get("items") or []
        if isinstance(ratios, list):
            for item in ratios:
                code = (item.get("code") or item.get("id") or "").upper()
                if "RECEIVABLE" in code or code in {"DSO", "RECEIVABLE_TURNOVER_DAYS"}:
                    if item.get("value") is not None:
                        return KpiValue(
                            code=d.code,
                            value=Decimal(str(item["value"])),
                            unit="days",
                            as_of=utcnow(),
                            formula_version=FORMULA_VERSION,
                            status="NO_TARGET",
                        )
        return no_data(d.code, "days", ["DSO_RATIO_SHAPE"])
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "days", ["RATIO_SERVICE_UNAVAILABLE"])


async def _cash_conversion_cycle(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "days", ["COMPOSE_DIO_DSO_DPO"])


async def _overdue_ar_pct(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.models.party_ledger import PartyLedgerBill

        total = (
            await db.execute(
                select(func.coalesce(func.sum(PartyLedgerBill.pending_amount), 0)).where(
                    PartyLedgerBill.tenant_id == tid,
                    PartyLedgerBill.bill_type == "RECEIVABLE",
                    PartyLedgerBill.status.in_(("PENDING", "PARTIAL", "OVERDUE")),
                )
            )
        ).scalar_one()
        overdue = (
            await db.execute(
                select(func.coalesce(func.sum(PartyLedgerBill.pending_amount), 0)).where(
                    PartyLedgerBill.tenant_id == tid,
                    PartyLedgerBill.bill_type == "RECEIVABLE",
                    PartyLedgerBill.due_date.isnot(None),
                    PartyLedgerBill.due_date < as_of,
                    PartyLedgerBill.status.in_(("PENDING", "PARTIAL", "OVERDUE")),
                )
            )
        ).scalar_one()
        num = Decimal(str(overdue or 0))
        den = Decimal(str(total or 0))
        return KpiValue(
            code=d.code,
            value=pct(num, den),
            unit="%",
            as_of=utcnow(),
            formula_version=FORMULA_VERSION,
            numerator=num,
            denominator=den,
            status="NO_DATA" if den == 0 else "NO_TARGET",
        )
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "%", ["PARTY_LEDGER_BILL_SHAPE"])


async def _attendance_rate(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.models.hr_attendance import AttendanceEntry

        total = (
            await db.execute(
                select(func.count(AttendanceEntry.id)).where(
                    AttendanceEntry.tenant_id == tid,
                    AttendanceEntry.attendance_date == as_of,
                )
            )
        ).scalar_one()
        present = (
            await db.execute(
                select(func.count(AttendanceEntry.id)).where(
                    AttendanceEntry.tenant_id == tid,
                    AttendanceEntry.attendance_date == as_of,
                    func.upper(AttendanceEntry.status).in_(("PRESENT", "P", "HALF_DAY", "LATE")),
                )
            )
        ).scalar_one()
        num = Decimal(int(present or 0))
        den = Decimal(int(total or 0))
        return KpiValue(
            code=d.code,
            value=pct(num, den),
            unit="%",
            as_of=utcnow(),
            formula_version=FORMULA_VERSION,
            numerator=num,
            denominator=den,
            status="NO_DATA" if den == 0 else "NO_TARGET",
        )
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "%", ["ATTENDANCE_ENTRY_SHAPE"])


async def _absenteeism(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    att = await _attendance_rate(db, tid, d, as_of)
    if att.value is None:
        return no_data(d.code, "%", att.missing_inputs or ["ATTENDANCE_ENTRY_SHAPE"])
    return KpiValue(
        code=d.code,
        value=Decimal("100") - att.value,
        unit="%",
        as_of=utcnow(),
        formula_version=FORMULA_VERSION,
        numerator=(att.denominator or Decimal("0")) - (att.numerator or Decimal("0")),
        denominator=att.denominator,
        status="NO_TARGET",
    )


async def _employee_turnover(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.models.hr import Employee

        active = (
            await db.execute(
                select(func.count(Employee.id)).where(
                    Employee.tenant_id == tid,
                    or_(Employee.is_active.is_(True), Employee.is_active.is_(None)),
                )
            )
        ).scalar_one()
        # Separations this month — status history if present else inactive with updated_at
        return KpiValue(
            code=d.code,
            value=None,
            unit="%",
            as_of=utcnow(),
            formula_version=FORMULA_VERSION,
            status="NO_DATA",
            missing_inputs=["SEPARATION_EVENTS_PARTIAL", f"ACTIVE_HC={int(active or 0)}"],
        )
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "%", ["EMPLOYEE_MODEL_SHAPE"])


async def _overtime_ratio(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["OT_VS_REGULAR_HOURS"])


async def _payroll_accuracy(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["PAYSLIP_CORRECTION_COUNT"])


async def _training_completion(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["ONBOARDING_REQUIRED_TASKS"])


async def _commission_earned(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    try:
        from app.models.commission import CommissionEntry

        total = (
            await db.execute(
                select(func.coalesce(func.sum(CommissionEntry.net_amount), 0)).where(
                    CommissionEntry.tenant_id == tid,
                )
            )
        ).scalar_one()
        val = Decimal(str(total or 0))
        return KpiValue(
            code=d.code,
            value=val,
            unit="money",
            as_of=utcnow(),
            formula_version=FORMULA_VERSION,
            numerator=val,
            denominator=Decimal("1"),
            status="NO_TARGET",
        )
    except Exception:
        await safe_async_session_rollback(db)
        return no_data(d.code, "money", ["COMMISSION_ENTRY_SHAPE"])


async def _commission_billed(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return await _commission_earned(db, tid, d, as_of)


async def _commission_realisation(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "%", ["COMMISSION_PAYMENT_LINK"])


async def _commission_dso(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return no_data(d.code, "days", ["COMMISSION_AR_DAYS"])


async def _sourcing_conversion(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return await _enquiry_to_order(db, tid, d, as_of)


async def _supplier_otif_portfolio(db: AsyncSession, tid: int, d: KpiDefinition, as_of: date) -> KpiValue:
    return await _supplier_otif(db, tid, d, as_of)


ADAPTERS: dict[str, Any] = {
    "enquiry_to_order": _enquiry_to_order,
    "quotation_win_rate": _quotation_win_rate,
    "order_book_value": _order_book_value,
    "buyer_retention": _buyer_retention,
    "tna_adherence": _tna_adherence,
    "tna_delay_days": _tna_delay_days,
    "order_risk_exposure": _order_risk_exposure,
    "sample_on_time": _sample_on_time,
    "sample_first_pass": _sample_first_pass,
    "sample_cycle_days": _sample_cycle_days,
    "costing_turnaround": _costing_turnaround,
    "cost_variance": _cost_variance,
    "cm_variance": _cm_variance,
    "supplier_otif": _supplier_otif,
    "ppv": _ppv,
    "supplier_defect_rate": _supplier_defect_rate,
    "material_readiness": _material_readiness,
    "fabric_readiness": _fabric_readiness,
    "trim_readiness": _trim_readiness,
    "inventory_accuracy": _inventory_accuracy,
    "inventory_days": _inventory_days,
    "dead_stock_pct": _dead_stock_pct,
    "capacity_utilisation": _capacity_utilisation,
    "capacity_booking_load": _capacity_booking_load,
    "plan_attainment": _plan_attainment,
    "schedule_adherence": _schedule_adherence,
    "fabric_utilisation": _fabric_utilisation,
    "cut_plan_attainment": _cut_plan_attainment,
    "cut_recut_rate": _cut_recut_rate,
    "sewing_efficiency": _sewing_efficiency,
    "operator_efficiency": _operator_efficiency,
    "earned_minutes": _earned_minutes,
    "hourly_attainment": _hourly_attainment,
    "rft": _rft,
    "dhu": _dhu,
    "reject_rate": _reject_rate,
    "final_inspection_pass": _final_inspection_pass,
    "capa_on_time": _capa_on_time,
    "shipment_otif": _shipment_otif,
    "on_time_ex_factory": _on_time_ex_factory,
    "doc_first_pass": _doc_first_pass,
    "doc_cycle_days": _doc_cycle_days,
    "export_proceeds_ageing": _export_proceeds_ageing,
    "bond_utilisation": _bond_utilisation,
    "gross_margin_pct": _gross_margin_pct,
    "contribution_margin_pct": _contribution_margin_pct,
    "order_profitability": _order_profitability,
    "dso": _dso,
    "cash_conversion_cycle": _cash_conversion_cycle,
    "overdue_ar_pct": _overdue_ar_pct,
    "attendance_rate": _attendance_rate,
    "absenteeism": _absenteeism,
    "employee_turnover": _employee_turnover,
    "overtime_ratio": _overtime_ratio,
    "payroll_accuracy": _payroll_accuracy,
    "training_completion": _training_completion,
    "commission_earned": _commission_earned,
    "commission_billed": _commission_billed,
    "commission_realisation": _commission_realisation,
    "commission_dso": _commission_dso,
    "sourcing_conversion": _sourcing_conversion,
    "supplier_otif_portfolio": _supplier_otif_portfolio,
}
