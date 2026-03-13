from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Followup, ManufacturingDowntimeEvent, ManufacturingNcr, Order, OutstandingBill, Quotation, StockMovement, User
from app.modules.ai_tool import repository
from app.modules.ai_tool.authz import has_tool_permission


def _to_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


@dataclass(slots=True)
class AnomalyFinding:
    source_area: str
    rule_code: str
    severity: str
    title: str
    explanation: str
    metrics: dict[str, Any]
    dimensions: dict[str, Any]


async def _order_delay_anomaly(db: AsyncSession, tenant_id: int) -> AnomalyFinding | None:
    today = date.today()
    rows = (
        await db.execute(select(Order.delivery_date, Order.status).where(Order.tenant_id == tenant_id))
    ).all()
    due_total = 0
    delayed_open = 0
    for delivery_date, status in rows:
        if not delivery_date or delivery_date >= today:
            continue
        due_total += 1
        st = str(status or "").upper()
        if st not in {"COMPLETED", "CLOSED", "CANCELLED"}:
            delayed_open += 1
    if due_total < 10:
        return None
    ratio = delayed_open / due_total if due_total else 0.0
    if ratio < 0.30:
        return None
    severity = "HIGH" if ratio >= 0.45 else "MEDIUM"
    return AnomalyFinding(
        source_area="orders",
        rule_code="ORDER_DELAY_RATIO_HIGH",
        severity=severity,
        title="Delayed open order ratio is high",
        explanation=f"{delayed_open} of {due_total} past-due orders are still open ({ratio:.1%}).",
        metrics={"delayed_open": delayed_open, "past_due_total": due_total, "delay_ratio": round(ratio, 4)},
        dimensions={"threshold": 0.30},
    )


async def _margin_issue_anomaly(db: AsyncSession, tenant_id: int) -> AnomalyFinding | None:
    rows = (
        await db.execute(
            select(Quotation.quoted_price, Quotation.total_cost, Quotation.status).where(Quotation.tenant_id == tenant_id)
        )
    ).all()
    checked = 0
    negative = 0
    for quoted, total_cost, status in rows:
        st = str(status or "").upper()
        if st in {"DRAFT", "REJECTED"}:
            continue
        q = _to_float(quoted)
        c = _to_float(total_cost)
        if q <= 0 or c <= 0:
            continue
        checked += 1
        if q < c:
            negative += 1
    if checked < 8:
        return None
    ratio = negative / checked if checked else 0.0
    if ratio < 0.2:
        return None
    return AnomalyFinding(
        source_area="merch",
        rule_code="NEGATIVE_MARGIN_QUOTATION_RATIO",
        severity="HIGH" if ratio >= 0.35 else "MEDIUM",
        title="Negative margin quotations detected",
        explanation=f"{negative} of {checked} active quotations appear below estimated cost ({ratio:.1%}).",
        metrics={"negative_margin_count": negative, "checked_quotations": checked, "ratio": round(ratio, 4)},
        dimensions={"threshold": 0.20},
    )


async def _inventory_bottleneck_anomaly(db: AsyncSession, tenant_id: int) -> AnomalyFinding | None:
    recent_since = date.today() - timedelta(days=30)
    all_rows = (
        await db.execute(
            select(StockMovement.item_id, StockMovement.movement_type, StockMovement.quantity).where(StockMovement.tenant_id == tenant_id)
        )
    ).all()
    recent_rows = (
        await db.execute(
            select(StockMovement.item_id, StockMovement.movement_type, StockMovement.quantity)
            .where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.movement_date.is_not(None),
                StockMovement.movement_date >= recent_since,
            )
        )
    ).all()
    on_hand: dict[int, float] = {}
    recent_out: dict[int, float] = {}
    for item_id, movement_type, qty in all_rows:
        on_hand.setdefault(item_id, 0.0)
        q = _to_float(qty)
        on_hand[item_id] += q if movement_type == "IN" else -q
    for item_id, movement_type, qty in recent_rows:
        recent_out.setdefault(item_id, 0.0)
        q = _to_float(qty)
        if movement_type == "OUT":
            recent_out[item_id] += q
    risky = 0
    for item_id, out_30 in recent_out.items():
        if out_30 <= 0:
            continue
        days_cov = on_hand.get(item_id, 0.0) / (out_30 / 30.0)
        if days_cov < 7:
            risky += 1
    if risky < 5:
        return None
    return AnomalyFinding(
        source_area="inventory",
        rule_code="LOW_STOCK_COVERAGE_CLUSTER",
        severity="MEDIUM",
        title="Multiple items have low stock coverage",
        explanation=f"{risky} items appear to have less than 7 days of stock coverage.",
        metrics={"risky_items": risky, "coverage_days_threshold": 7},
        dimensions={"window_days": 30},
    )


async def _process_bottleneck_anomaly(db: AsyncSession, tenant_id: int) -> AnomalyFinding | None:
    downtimes = (
        await db.execute(
            select(func.count(ManufacturingDowntimeEvent.id)).where(
                ManufacturingDowntimeEvent.tenant_id == tenant_id,
                func.lower(ManufacturingDowntimeEvent.status).in_(["open", "investigating"]),
            )
        )
    ).scalar() or 0
    ncr_open = (
        await db.execute(
            select(func.count(ManufacturingNcr.id)).where(
                ManufacturingNcr.tenant_id == tenant_id,
                func.lower(ManufacturingNcr.status).in_(["open", "in_progress"]),
            )
        )
    ).scalar() or 0
    followups_open = (
        await db.execute(
            select(func.count(Followup.id)).where(
                Followup.tenant_id == tenant_id,
                Followup.status == "OPEN",
            )
        )
    ).scalar() or 0
    if downtimes < 3 and ncr_open < 5 and followups_open < 20:
        return None
    return AnomalyFinding(
        source_area="manufacturing",
        rule_code="PROCESS_BOTTLENECK_SIGNALS",
        severity="HIGH" if downtimes >= 5 or ncr_open >= 8 else "MEDIUM",
        title="Process bottleneck signals detected",
        explanation=f"Open downtimes={downtimes}, open NCRs={ncr_open}, open follow-ups={followups_open}.",
        metrics={"open_downtime_events": int(downtimes), "open_ncr": int(ncr_open), "open_followups": int(followups_open)},
        dimensions={"downtime_threshold": 3, "ncr_threshold": 5, "followup_threshold": 20},
    )


async def _receivable_risk_anomaly(db: AsyncSession, tenant_id: int) -> AnomalyFinding | None:
    today = date.today()
    rows = (
        await db.execute(
            select(OutstandingBill.bill_type, OutstandingBill.due_date, OutstandingBill.amount, OutstandingBill.paid_amount, OutstandingBill.status).where(
                OutstandingBill.tenant_id == tenant_id
            )
        )
    ).all()
    open_total = 0.0
    overdue_total = 0.0
    for bill_type, due_date, amount, paid_amount, status in rows:
        if "RECEIV" not in str(bill_type or "").upper():
            continue
        if str(status or "").upper() not in {"OPEN", "PARTIAL", "OVERDUE"}:
            continue
        outstanding = max(_to_float(amount) - _to_float(paid_amount), 0.0)
        if outstanding <= 0:
            continue
        open_total += outstanding
        if due_date and due_date < today:
            overdue_total += outstanding
    if open_total <= 0:
        return None
    ratio = overdue_total / open_total
    if ratio < 0.35:
        return None
    return AnomalyFinding(
        source_area="finance",
        rule_code="RECEIVABLE_OVERDUE_RATIO_HIGH",
        severity="HIGH" if ratio >= 0.5 else "MEDIUM",
        title="Receivable overdue exposure is high",
        explanation=f"Overdue receivables are {ratio:.1%} of open receivables.",
        metrics={"open_receivable": round(open_total, 2), "overdue_receivable": round(overdue_total, 2), "overdue_ratio": round(ratio, 4)},
        dimensions={"threshold": 0.35},
    )


def _build_narrative(findings: list[AnomalyFinding]) -> str:
    if not findings:
        return "No major anomaly signal crossed configured thresholds in this run."
    lines = [f"- {f.title}: {f.explanation}" for f in findings[:5]]
    return "Anomaly summary (rule-based):\n" + "\n".join(lines) + "\nAll insights are derived from explicit thresholds and trend comparisons."


async def generate_anomaly_insights(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    request_id: str,
    session_id: int | None = None,
) -> dict[str, Any]:
    # Restricted finance anomaly is permission-gated.
    allow_finance = await has_tool_permission(db, user, "ai.tools.finance.read")

    detectors = [
        _order_delay_anomaly,
        _margin_issue_anomaly,
        _inventory_bottleneck_anomaly,
        _process_bottleneck_anomaly,
    ]
    if allow_finance:
        detectors.append(_receivable_risk_anomaly)

    findings: list[AnomalyFinding] = []
    for detector in detectors:
        item = await detector(db, tenant_id)
        if item:
            findings.append(item)

    persisted_ids: list[int] = []
    for finding in findings:
        row = await repository.create_anomaly_event(
            db,
            tenant_id=tenant_id,
            user_id=user.id,
            session_id=session_id,
            request_id=request_id,
            source_area=finding.source_area,
            rule_code=finding.rule_code,
            severity=finding.severity,
            title=finding.title,
            explanation=finding.explanation,
            metrics_json=finding.metrics,
            dimensions_json=finding.dimensions,
        )
        persisted_ids.append(row.id)

    narrative = _build_narrative(findings)
    return {
        "summary": narrative,
        "events": [
            {
                "source_area": x.source_area,
                "rule_code": x.rule_code,
                "severity": x.severity,
                "title": x.title,
                "explanation": x.explanation,
                "metrics": x.metrics,
                "dimensions": x.dimensions,
            }
            for x in findings
        ],
        "persisted_event_ids": persisted_ids,
        "logic_version": "phase7-rules-v1",
        "scheduler_ready": True,
    }
