from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FxReceipt, ManufacturingWorkOrder, Order, OutstandingBill, PaymentRun, StockMovement
from app.modules.ai_tool.forecast.base import BaseForecastAdapter


def _to_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _moving_average(values: list[float], window: int = 3) -> float:
    if not values:
        return 0.0
    subset = values[-window:] if len(values) >= window else values
    return sum(subset) / len(subset)


def _linear_slope(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    x_vals = list(range(n))
    sum_x = sum(x_vals)
    sum_y = sum(values)
    sum_xy = sum(x * y for x, y in zip(x_vals, values))
    sum_x2 = sum(x * x for x in x_vals)
    denom = n * sum_x2 - sum_x * sum_x
    if denom == 0:
        return 0.0
    return (n * sum_xy - sum_x * sum_y) / denom


def _project_series(values: list[float], periods: int) -> list[float]:
    if periods <= 0:
        return []
    if not values:
        return [0.0 for _ in range(periods)]
    avg = _moving_average(values, window=3)
    slope = _linear_slope(values)
    last = values[-1]
    projections: list[float] = []
    for step in range(1, periods + 1):
        projected = last + slope * step
        smoothed = (projected + avg) / 2
        projections.append(round(smoothed, 2))
    return projections


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _parse_iso_date(value: Any) -> date | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


@dataclass
class CashFlowProjectionAdapter(BaseForecastAdapter):
    db: AsyncSession
    tenant_id: int

    async def run(self, payload: dict) -> dict:
        horizon_days = int(payload.get("horizon_days", 90))
        months = max(1, min(12, horizon_days // 30))
        from_date = _parse_iso_date(payload.get("from_date"))
        to_date = _parse_iso_date(payload.get("to_date")) or date.today()
        since = from_date or (to_date - timedelta(days=365))

        out_rows = (
            await self.db.execute(
                select(PaymentRun.run_date, PaymentRun.total_amount).where(
                    PaymentRun.tenant_id == self.tenant_id,
                    PaymentRun.run_date >= since,
                    PaymentRun.run_date <= to_date,
                )
            )
        ).all()
        in_rows = (
            await self.db.execute(
                select(FxReceipt.receipt_date, FxReceipt.base_amount).where(
                    FxReceipt.tenant_id == self.tenant_id,
                    FxReceipt.receipt_date >= since,
                    FxReceipt.receipt_date <= to_date,
                )
            )
        ).all()

        monthly: dict[str, dict[str, float]] = {}
        for run_date, amount in out_rows:
            if not run_date:
                continue
            key = _month_key(run_date)
            monthly.setdefault(key, {"inflow": 0.0, "outflow": 0.0})
            monthly[key]["outflow"] += _to_float(amount)
        for rec_date, amount in in_rows:
            if not rec_date:
                continue
            key = _month_key(rec_date)
            monthly.setdefault(key, {"inflow": 0.0, "outflow": 0.0})
            monthly[key]["inflow"] += _to_float(amount)

        keys = sorted(monthly.keys())
        history_nets = [round(monthly[k]["inflow"] - monthly[k]["outflow"], 2) for k in keys]
        projected_nets = _project_series(history_nets, periods=months)
        confidence = min(0.9, 0.45 + 0.08 * len(history_nets))
        return {
            "forecast_points": [{"period_index": i + 1, "projected_net_cash": v} for i, v in enumerate(projected_nets)],
            "history": [{"month": k, "net_cash": n} for k, n in zip(keys, history_nets)],
            "assumptions": {
                "method": "moving-average-plus-linear-trend",
                "lookback_months": len(history_nets),
                "horizon_months": months,
            },
            "confidence_score": round(confidence, 2),
            "limitations": "Uses payment runs and FX receipts as proxy inflow/outflow; does not include all GL events.",
        }


@dataclass
class InventoryShortageForecastAdapter(BaseForecastAdapter):
    db: AsyncSession
    tenant_id: int

    async def run(self, payload: dict) -> dict:
        horizon_days = int(payload.get("horizon_days", 30))
        lookback_days = min(180, max(30, int(payload.get("lookback_days", 90))))
        today = _parse_iso_date(payload.get("to_date")) or date.today()
        since = _parse_iso_date(payload.get("from_date")) or (today - timedelta(days=lookback_days))
        lookback_days = max(1, (today - since).days or lookback_days)

        all_rows = (
            await self.db.execute(
                select(StockMovement.item_id, StockMovement.movement_type, StockMovement.quantity)
                .where(StockMovement.tenant_id == self.tenant_id)
            )
        ).all()
        recent_rows = (
            await self.db.execute(
                select(StockMovement.item_id, StockMovement.movement_type, StockMovement.quantity)
                .where(
                    StockMovement.tenant_id == self.tenant_id,
                    StockMovement.movement_date.is_not(None),
                    StockMovement.movement_date >= since,
                    StockMovement.movement_date <= today,
                )
            )
        ).all()

        on_hand: dict[int, float] = {}
        for item_id, movement_type, qty in all_rows:
            on_hand.setdefault(item_id, 0.0)
            delta = _to_float(qty)
            on_hand[item_id] += delta if movement_type == "IN" else -delta

        consumption: dict[int, float] = {}
        for item_id, movement_type, qty in recent_rows:
            consumption.setdefault(item_id, 0.0)
            delta = _to_float(qty)
            consumption[item_id] += delta if movement_type == "OUT" else -delta

        risk_items: list[dict] = []
        for item_id, current in on_hand.items():
            daily_net_out = max(consumption.get(item_id, 0.0), 0.0) / lookback_days
            if daily_net_out <= 0:
                continue
            days_to_stockout = current / daily_net_out if daily_net_out > 0 else None
            if days_to_stockout is not None and days_to_stockout <= horizon_days:
                risk_items.append(
                    {
                        "item_id": item_id,
                        "current_on_hand": round(current, 3),
                        "avg_daily_net_out": round(daily_net_out, 3),
                        "days_to_stockout": round(days_to_stockout, 1),
                    }
                )
        risk_items.sort(key=lambda x: x["days_to_stockout"])
        confidence = 0.7 if len(recent_rows) >= 50 else 0.55
        return {
            "forecast_points": risk_items[:50],
            "assumptions": {
                "method": "days-to-stockout-using-recent-net-consumption",
                "lookback_days": lookback_days,
                "horizon_days": horizon_days,
            },
            "confidence_score": round(confidence, 2),
            "limitations": "Does not include planned purchase receipts not yet posted to stock movements.",
        }


@dataclass
class ProductionOutputForecastAdapter(BaseForecastAdapter):
    db: AsyncSession
    tenant_id: int

    async def run(self, payload: dict) -> dict:
        horizon_days = int(payload.get("horizon_days", 90))
        months = max(1, min(12, horizon_days // 30))
        to_date = _parse_iso_date(payload.get("to_date")) or date.today()
        since = _parse_iso_date(payload.get("from_date")) or (to_date - timedelta(days=365))
        rows = (
            await self.db.execute(
                select(ManufacturingWorkOrder.created_at, ManufacturingWorkOrder.status, ManufacturingWorkOrder.qty_completed).where(
                    ManufacturingWorkOrder.tenant_id == self.tenant_id,
                    ManufacturingWorkOrder.created_at >= since,
                    ManufacturingWorkOrder.created_at <= to_date,
                )
            )
        ).all()
        monthly_qty: dict[str, float] = {}
        for created_at, status, qty_completed in rows:
            if not created_at:
                continue
            key = _month_key(created_at.date())
            monthly_qty.setdefault(key, 0.0)
            if str(status).lower() in {"completed", "closed"}:
                monthly_qty[key] += _to_float(qty_completed)

        keys = sorted(monthly_qty.keys())
        history = [round(monthly_qty[k], 2) for k in keys]
        projections = _project_series(history, months)
        confidence = min(0.88, 0.4 + 0.1 * len(history))
        return {
            "forecast_points": [{"period_index": i + 1, "projected_output_qty": v} for i, v in enumerate(projections)],
            "history": [{"month": k, "completed_output_qty": v} for k, v in zip(keys, history)],
            "assumptions": {"method": "monthly-output-trend", "horizon_months": months},
            "confidence_score": round(confidence, 2),
            "limitations": "Depends on work-order status consistency and completed quantities.",
        }


@dataclass
class ShipmentDelayRiskForecastAdapter(BaseForecastAdapter):
    db: AsyncSession
    tenant_id: int

    async def run(self, payload: dict) -> dict:
        horizon_days = int(payload.get("horizon_days", 30))
        today = _parse_iso_date(payload.get("to_date")) or date.today()
        horizon_end = today + timedelta(days=horizon_days)
        rows = (
            await self.db.execute(
                select(Order.delivery_date, Order.status).where(Order.tenant_id == self.tenant_id)
            )
        ).all()
        due_past = 0
        overdue_open = 0
        due_next = 0
        for delivery_date, status in rows:
            if not delivery_date:
                continue
            st = str(status or "").upper()
            is_open = st not in {"COMPLETED", "CLOSED", "CANCELLED"}
            if delivery_date < today:
                due_past += 1
                if is_open:
                    overdue_open += 1
            elif today <= delivery_date <= horizon_end:
                due_next += 1

        baseline_rate = (overdue_open / due_past) if due_past > 0 else 0.0
        projected_delayed_next = round(due_next * min(1.0, baseline_rate * 1.1))
        risk_level = "LOW"
        if baseline_rate >= 0.35:
            risk_level = "HIGH"
        elif baseline_rate >= 0.18:
            risk_level = "MEDIUM"
        confidence = 0.75 if due_past >= 20 else 0.58
        return {
            "forecast_points": [
                {
                    "horizon_days": horizon_days,
                    "due_next_orders": due_next,
                    "projected_delayed_orders": projected_delayed_next,
                    "baseline_delay_rate": round(baseline_rate, 3),
                    "risk_level": risk_level,
                }
            ],
            "assumptions": {"method": "historical-overdue-ratio-projection"},
            "confidence_score": round(confidence, 2),
            "limitations": "Uses overdue-open ratio proxy due to limited actual shipment completion timestamps.",
        }


@dataclass
class ReceivableRiskForecastAdapter(BaseForecastAdapter):
    db: AsyncSession
    tenant_id: int

    async def run(self, payload: dict) -> dict:
        horizon_days = int(payload.get("horizon_days", 30))
        today = _parse_iso_date(payload.get("to_date")) or date.today()
        horizon_end = today + timedelta(days=horizon_days)
        rows = (
            await self.db.execute(
                select(OutstandingBill.due_date, OutstandingBill.amount, OutstandingBill.paid_amount, OutstandingBill.status, OutstandingBill.bill_type)
                .where(OutstandingBill.tenant_id == self.tenant_id)
            )
        ).all()

        open_receivables: list[tuple[date, float]] = []
        for due_date, amount, paid_amount, status, bill_type in rows:
            if not due_date:
                continue
            if "RECEIV" not in str(bill_type or "").upper():
                continue
            if str(status or "").upper() not in {"OPEN", "PARTIAL", "OVERDUE"}:
                continue
            outstanding = max(_to_float(amount) - _to_float(paid_amount), 0.0)
            if outstanding > 0:
                open_receivables.append((due_date, outstanding))

        overdue_30 = overdue_60 = overdue_90p = 0.0
        due_next_30 = 0.0
        total_open = 0.0
        for due_date, outstanding in open_receivables:
            total_open += outstanding
            delta = (today - due_date).days
            if delta > 0:
                if delta <= 30:
                    overdue_30 += outstanding
                elif delta <= 60:
                    overdue_60 += outstanding
                else:
                    overdue_90p += outstanding
            elif today <= due_date <= horizon_end:
                due_next_30 += outstanding

        overdue_total = overdue_30 + overdue_60 + overdue_90p
        overdue_ratio = (overdue_total / total_open) if total_open > 0 else 0.0
        projected_new_overdue = round(due_next_30 * overdue_ratio, 2)
        confidence = 0.78 if len(open_receivables) >= 20 else 0.6
        return {
            "forecast_points": [
                {
                    "horizon_days": horizon_days,
                    "current_open_receivable": round(total_open, 2),
                    "current_overdue_total": round(overdue_total, 2),
                    "projected_new_overdue": projected_new_overdue,
                }
            ],
            "aging_buckets": {
                "overdue_0_30": round(overdue_30, 2),
                "overdue_31_60": round(overdue_60, 2),
                "overdue_61_plus": round(overdue_90p, 2),
            },
            "assumptions": {"method": "overdue-ratio-applied-to-next-due-window"},
            "confidence_score": round(confidence, 2),
            "limitations": "Relies on bill status quality and outstanding amount updates.",
        }


@dataclass
class CapacityShortfallForecastAdapter(BaseForecastAdapter):
    db: AsyncSession
    tenant_id: int

    async def run(self, payload: dict) -> dict:
        horizon_days = int(payload.get("horizon_days", 30))
        to_date = _parse_iso_date(payload.get("to_date")) or date.today()
        since = _parse_iso_date(payload.get("from_date")) or (to_date - timedelta(days=90))
        rows = (
            await self.db.execute(
                select(
                    ManufacturingWorkOrder.created_at,
                    ManufacturingWorkOrder.status,
                    ManufacturingWorkOrder.qty_planned,
                    ManufacturingWorkOrder.qty_completed,
                ).where(ManufacturingWorkOrder.tenant_id == self.tenant_id)
            )
        ).all()
        backlog_qty = 0.0
        throughput_recent_qty = 0.0
        for created_at, status, qty_planned, qty_completed in rows:
            st = str(status or "").lower()
            planned = _to_float(qty_planned)
            completed = _to_float(qty_completed)
            if st not in {"completed", "closed", "cancelled"}:
                backlog_qty += max(planned - completed, 0.0)
            if st in {"completed", "closed"} and created_at and since <= created_at.date() <= to_date:
                throughput_recent_qty += completed
        span_days = max(1, (to_date - since).days)
        throughput_per_day = throughput_recent_qty / span_days
        projected_capacity = throughput_per_day * horizon_days
        projected_shortfall = max(backlog_qty - projected_capacity, 0.0)
        confidence = 0.72 if throughput_recent_qty > 0 else 0.5
        return {
            "forecast_points": [
                {
                    "horizon_days": horizon_days,
                    "backlog_qty": round(backlog_qty, 2),
                    "projected_capacity_qty": round(projected_capacity, 2),
                    "projected_shortfall_qty": round(projected_shortfall, 2),
                }
            ],
            "assumptions": {"method": "recent-completion-throughput-vs-backlog"},
            "confidence_score": round(confidence, 2),
            "limitations": "Capacity proxy does not yet include machine-level constraints or shift calendars.",
        }
