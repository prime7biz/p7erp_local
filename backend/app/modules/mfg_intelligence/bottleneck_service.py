"""Bottleneck findings builder (Phase 4, read-only, deterministic). Plan 15 sections D17-D19, 5.6, 17.3, 17.13.

Builds (never stores) one finding per natural key from B1 results:
- DELIVERY_RISK     confirmed order whose forecast band is LATE or AT_RISK            key DELIVERY_RISK:order:<id>
- LATE_MATERIAL     purchase order material pushes the start, or the shortage is not
                    on order / has no ETA                                              key LATE_MATERIAL:order:<id>
- CAPACITY_OVERLOAD line-days OVERLOADED in the next 14 days (corrected capacity)     key CAPACITY_OVERLOAD:line:<id>
- LINE_IDLE         line-days IDLE in the next 14 days                                 key LINE_IDLE:line:<id>
- OUTPUT_DROP       efficiency / hourly output anomaly in the last 3 days              key OUTPUT_DROP:line:<id>
- QUALITY_SPIKE     rejection-rate anomaly in the last 3 days                          key QUALITY_SPIKE:line:<id>
Severity: critical if delay >= 7 days or (due within 14 days and p < 0.3); high if delay >= 3 or p < 0.5; else
medium ("delay" = days affected for line kinds). Priority = severity weight (critical 4, high 3, medium 2) x days
affected x max(1, orders affected) x confidence weight (HIGH 1.0, MEDIUM 0.75, LOW 0.5). No value / money weight.
At most 500 findings are returned (highest priority first). Payload facts carry no money.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant
from app.modules.mfg_intelligence.decimals import to_dec
from app.modules.mfg_intelligence.flags import allocation_v1_on, integrated_planning_on

KIND_DELIVERY = "DELIVERY_RISK"
KIND_MATERIAL = "LATE_MATERIAL"
KIND_OVERLOAD = "CAPACITY_OVERLOAD"
KIND_IDLE = "LINE_IDLE"
KIND_OUTPUT = "OUTPUT_DROP"
KIND_QUALITY = "QUALITY_SPIKE"

DEPARTMENT = {
    KIND_DELIVERY: "Production Planning",
    KIND_MATERIAL: "Merchandising / Procurement",
    KIND_OVERLOAD: "Production Planning",
    KIND_IDLE: "Production Planning",
    KIND_OUTPUT: "Production",
    KIND_QUALITY: "Quality",
}
KIND_LABEL = {
    KIND_DELIVERY: "Delivery risk",
    KIND_MATERIAL: "Late material",
    KIND_OVERLOAD: "Line overloaded",
    KIND_IDLE: "Line idle",
    KIND_OUTPUT: "Output drop",
    KIND_QUALITY: "Quality spike",
}
SEVERITY_WEIGHT = {"critical": Decimal(4), "high": Decimal(3), "medium": Decimal(2)}
SEVERITY_RANK = {"medium": 0, "high": 1, "critical": 2}
CONFIDENCE_WEIGHT = {"HIGH": Decimal("1.0"), "MEDIUM": Decimal("0.75"), "LOW": Decimal("0.5")}
CAPACITY_HORIZON_DAYS = 14
ANOMALY_LOOKBACK_DAYS = 3
ANOMALY_OUTCOME_DAYS = 7
MAX_FINDINGS = 500
# Line-kind findings keep the deadline of their first detection (17.15: never recomputed for past dates).
KEEP_FIRST_DEADLINE = frozenset({KIND_OVERLOAD, KIND_IDLE})
MATERIAL_UNKNOWN_CODES = ("MATERIAL_NOT_ON_ORDER", "MATERIAL_ETA_UNKNOWN")


def severity_for(delay_days: int, *, due_in_days: int | None = None, probability: Decimal | None = None) -> str:
    """D18 severity (pure)."""
    low_p = probability is not None
    if delay_days >= 7 or (due_in_days is not None and due_in_days <= 14 and low_p and probability < Decimal("0.3")):
        return "critical"
    if delay_days >= 3 or (low_p and probability < Decimal("0.5")):
        return "high"
    return "medium"


def priority_for(severity: str, days_affected: int, orders_affected: int, confidence: str) -> Decimal:
    return (
        SEVERITY_WEIGHT[severity]
        * Decimal(max(1, days_affected))
        * Decimal(max(1, orders_affected))
        * CONFIDENCE_WEIGHT.get(confidence, CONFIDENCE_WEIGHT["LOW"])
    ).quantize(Decimal("0.0001"))


def _fact(fid: str, label: str, value: Any, unit: str) -> dict[str, Any] | None:
    d = to_dec(value)
    if d is None:
        return None
    return {"id": fid, "label": label, "value": format(d, "f"), "unit": unit}


def _iso(d: Any) -> str | None:
    if d is None:
        return None
    return d.isoformat() if hasattr(d, "isoformat") else str(d)


def _finding(
    *,
    kind: str,
    key: str,
    severity: str,
    days_affected: int,
    orders_affected: int,
    confidence: str,
    deadline: date | None,
    order_id: int | None = None,
    line_id: int | None = None,
    subject: dict[str, Any],
    facts: list[dict[str, Any] | None],
    dates: dict[str, Any],
    affected_dates: list[date],
    reason_codes: list[str],
    action: str,
    screen: dict[str, str],
    alternatives: list[str],
    approval: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "kind": kind,
        "kind_label": KIND_LABEL[kind],
        "subject": subject,
        "facts": [f for f in facts if f is not None],
        "dates": {k: _iso(v) for k, v in dates.items()},
        "affected_dates": [_iso(d) for d in affected_dates],
        "days_affected": days_affected,
        "orders_affected": orders_affected,
        "reason_codes": list(dict.fromkeys(reason_codes)),
        "confidence": confidence,
        "recommendation": {"action": action, "screen": screen},
        "alternatives": alternatives,
        "approval_requirement": approval,
        "assumptions": [
            "Deterministic rule result; the recommendation records a decision only and changes no plan, order or "
            "purchase order.",
        ],
    }
    if extra:
        payload.update(extra)
    return {
        "finding_key": key,
        "kind": kind,
        "severity": severity,
        "priority": priority_for(severity, days_affected, orders_affected, confidence),
        "department": DEPARTMENT[kind],
        "order_id": order_id,
        "line_id": line_id,
        "deadline_date": deadline,
        "payload": payload,
    }


def _plan_screen(order_id: int, integrated: bool) -> dict[str, str]:
    if integrated:
        return {"href": f"/app/control-tower?tab=plan-changes&order={order_id}", "label": "Plan changes"}
    return {"href": f"/app/production/line-plan?order={order_id}", "label": "Line plan"}


def delivery_findings(forecasts: list[dict[str, Any]], *, today: date, integrated: bool) -> list[dict[str, Any]]:
    """DELIVERY_RISK from forecast results (pure)."""
    out: list[dict[str, Any]] = []
    for f in forecasts:
        if f.get("band") not in ("LATE", "AT_RISK"):
            continue
        target = f.get("target_date")
        delay = int(f.get("delay_days") or 0)
        p = to_dec(f.get("on_time_probability"))
        due_in = (target - today).days if target is not None else None
        severity = severity_for(delay, due_in_days=due_in, probability=p)
        out.append(
            _finding(
                kind=KIND_DELIVERY,
                key=f"{KIND_DELIVERY}:order:{f['order_id']}",
                severity=severity,
                days_affected=max(1, delay),
                orders_affected=1,
                confidence=f.get("confidence") or "LOW",
                deadline=target,
                order_id=f["order_id"],
                subject={"order_code": f.get("order_code")},
                facts=[
                    _fact("on_time_probability", "chance of shipping on time", p * 100 if p is not None else None,
                          "percent"),
                    _fact("delay_days", "likely delay", delay, "days"),
                    _fact("remaining_qty", "pieces still to sew", f.get("remaining_qty"), "count"),
                    _fact("working_days_needed", "working days still needed", f.get("working_days_needed"), "days"),
                ],
                dates={
                    "target_date": target,
                    "p50_date": f.get("p50_date"),
                    "p80_date": f.get("p80_date"),
                    "p90_date": f.get("p90_date"),
                    "start_date": f.get("start_date"),
                },
                affected_dates=[d for d in (target,) if d is not None],
                reason_codes=[f.get("band") or "", *(f.get("reason_codes") or [])],
                action="Review the order's line plan (add a line, overtime or re-sequence) before the ex-factory date.",
                screen=_plan_screen(f["order_id"], integrated),
                alternatives=["Agree a new ex-factory date with the buyer.", "Accept the risk and monitor daily."],
                approval="Plan changes follow the existing plan approval; this finding changes nothing by itself.",
                extra={"band": f.get("band"), "spread_mode": f.get("spread_mode")},
            )
        )
    return out


def material_findings(forecasts: list[dict[str, Any]], *, today: date, allocation: bool) -> list[dict[str, Any]]:
    """LATE_MATERIAL from forecast results (pure). PO detail stays in the payload (gated MI endpoints only)."""
    out: list[dict[str, Any]] = []
    screen = (
        {"href": "/app/control-tower?tab=materials", "label": "Materials"}
        if allocation
        else {"href": "/app/inventory/purchase-orders", "label": "Purchase orders"}
    )
    for f in forecasts:
        material = f.get("material") or {}
        reasons = f.get("reason_codes") or []
        need_days = [ln.get("capacity_date") for ln in (f.get("lines") or []) if ln.get("capacity_date")]
        need_date = min(need_days) if need_days else None
        unknown = [c for c in reasons if c in MATERIAL_UNKNOWN_CODES]
        wait = 0
        if material.get("status") == "DATED":
            wait = next((int(d["impact_days"]) for d in f.get("drivers") or [] if d.get("driver") == "MATERIAL"), 0)
        if not unknown and wait <= 0:
            continue
        target = f.get("target_date")
        delay = int(f.get("delay_days") or 0)
        severity = severity_for(max(wait, delay if unknown else 0), due_in_days=(target - today).days if target else None)
        if unknown and severity == "medium":
            severity = "high"  # the shortage has no dated supply at all
        po_lines = [
            {"po_line_id": p.get("po_line_id"), "qty_used": p.get("qty_used"), "receipt_p80": _iso(p.get("receipt_p80"))}
            for p in material.get("po_lines") or []
        ]
        out.append(
            _finding(
                kind=KIND_MATERIAL,
                key=f"{KIND_MATERIAL}:order:{f['order_id']}",
                severity=severity,
                days_affected=max(1, wait),
                orders_affected=1,
                confidence=f.get("confidence") or "LOW",
                deadline=need_date,
                order_id=f["order_id"],
                subject={"order_code": f.get("order_code")},
                facts=[
                    _fact("material_wait_days", "days the start waits for material", wait, "days"),
                    _fact("po_lines", "purchase order lines needed", len(po_lines), "count"),
                ],
                dates={
                    "need_date": need_date,
                    "ready_p50": material.get("ready_p50"),
                    "ready_p80": material.get("ready_p80"),
                    "ready_p90": material.get("ready_p90"),
                    "target_date": target,
                },
                affected_dates=[d for d in (need_date,) if d is not None],
                reason_codes=[*(unknown or ["MATERIAL_WAIT"]), *(material.get("reason_codes") or [])],
                action="Expedite the purchase order lines with the supplier or move material from free stock.",
                screen=screen,
                alternatives=["Start the order later in the line plan.", "Use an approved substitute material."],
                approval="Purchase order and allocation changes follow their existing approvals.",
                extra={"material": {"status": material.get("status"), "po_lines": po_lines}},
            )
        )
    return out


def capacity_findings(lines: list[Any], loading: Any, *, today: date) -> list[dict[str, Any]]:
    """CAPACITY_OVERLOAD / LINE_IDLE from a `compute_capacity` result over the next 14 days (pure)."""
    orders_by_line_day: dict[tuple[int, date], set[int]] = defaultdict(set)
    for item in getattr(loading, "rows", []) or []:
        oid = getattr(item.cfg, "order_id", None)
        if oid is None:
            continue
        for day in item.allocation:
            orders_by_line_day[(int(item.cfg.line_id), day)].add(int(oid))
    out: list[dict[str, Any]] = []
    for lc in lines:
        line = lc.line
        over = [d for d in lc.days if d.status == "OVERLOADED"]
        idle = [d for d in lc.days if d.status == "IDLE"]
        if over:
            days = [d.day for d in over]
            orders = set().union(*(orders_by_line_day.get((line.id, d), set()) for d in days))
            peak = max((d.utilization_pct for d in over if d.utilization_pct is not None), default=None)
            out.append(
                _finding(
                    kind=KIND_OVERLOAD,
                    key=f"{KIND_OVERLOAD}:line:{line.id}",
                    severity=severity_for(len(days)),
                    days_affected=len(days),
                    orders_affected=len(orders),
                    confidence="MEDIUM",
                    deadline=days[0],
                    line_id=line.id,
                    subject={"line_code": line.line_code},
                    facts=[
                        _fact("overloaded_days", "overloaded working days in the next two weeks", len(days), "days"),
                        _fact("orders_affected", "orders on the overloaded days", len(orders), "count"),
                        _fact("peak_utilization", "highest firm load versus capacity", peak, "percent"),
                    ],
                    dates={"first_day": days[0], "last_day": days[-1]},
                    affected_dates=days,
                    reason_codes=["FIRM_LOAD_ABOVE_PRACTICAL_CAPACITY"],
                    action="Move firm bookings to a free line or add a shift on the overloaded days.",
                    screen={"href": f"/app/production/line-plan?line={line.id}", "label": "Line plan"},
                    alternatives=["Plan overtime for the line.", "Subcontract part of the quantity."],
                    approval="Plan changes follow the existing plan approval.",
                    extra={"order_ids": sorted(orders)},
                )
            )
        if idle:
            days = [d.day for d in idle]
            out.append(
                _finding(
                    kind=KIND_IDLE,
                    key=f"{KIND_IDLE}:line:{line.id}",
                    severity=severity_for(len(days)),
                    days_affected=len(days),
                    orders_affected=0,
                    confidence="MEDIUM",
                    deadline=days[0],
                    line_id=line.id,
                    subject={"line_code": line.line_code},
                    facts=[_fact("idle_days", "idle working days in the next two weeks", len(days), "days")],
                    dates={"first_day": days[0], "last_day": days[-1]},
                    affected_dates=days,
                    reason_codes=["NO_FIRM_LOAD_ON_WORKING_DAY"],
                    action="Pull forward a confirmed order or book tentative demand on the idle days.",
                    screen={"href": f"/app/production/line-plan?line={line.id}", "label": "Line plan"},
                    alternatives=["Lend operators to another line.", "Use the time for training or maintenance."],
                    approval="Plan changes follow the existing plan approval.",
                )
            )
    return out


def anomaly_findings(anomalies: list[dict[str, Any]], *, today: date) -> list[dict[str, Any]]:
    """OUTPUT_DROP / QUALITY_SPIKE from `anomalies_payload()["anomalies"]` (pure), one per line and kind."""
    grouped: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    for a in anomalies:
        kind = KIND_QUALITY if a["metric"] == "REJECTION_RATE" else KIND_OUTPUT
        grouped[(kind, int(a["line_id"]))].append(a)
    out: list[dict[str, Any]] = []
    for (kind, line_id), items in sorted(grouped.items()):
        days = sorted({date.fromisoformat(str(a["date"])) if isinstance(a["date"], str) else a["date"] for a in items})
        latest = days[-1]
        worst = max(items, key=lambda a: abs(Decimal(a["robust_z"])))
        out.append(
            _finding(
                kind=kind,
                key=f"{kind}:line:{line_id}",
                severity=severity_for(len(days)) if len(days) > 1 else "medium",
                days_affected=len(days),
                orders_affected=0,
                confidence="MEDIUM",
                deadline=latest + timedelta(days=ANOMALY_OUTCOME_DAYS),
                line_id=line_id,
                subject={"line_code": worst.get("line_code")},
                facts=[
                    _fact("anomaly_days", "days with the unusual result", len(days), "days"),
                    _fact("points", "unusual readings", len(items), "count"),
                ],
                dates={"latest_day": latest},
                affected_dates=days,
                reason_codes=sorted({a["metric"] for a in items}),
                action=(
                    "Check the line's quality checkpoints and the defect log for the affected days."
                    if kind == KIND_QUALITY
                    else "Check the line for absence, machine breakdown or a style change on the affected days."
                ),
                screen={"href": f"/app/production/line-plan?line={line_id}", "label": "Line plan"},
                alternatives=["Monitor the next production days before acting."],
                approval="No approval needed; the finding records a decision only.",
                extra={
                    "anomaly": {
                        "metric": worst["metric"],
                        "hour_slot": worst.get("hour_slot"),
                        "latest_day": latest.isoformat(),
                    }
                },
            )
        )
    return out


def rank_and_cap(findings: list[dict[str, Any]], limit: int = MAX_FINDINGS) -> list[dict[str, Any]]:
    """Highest priority first, one per key, at most `limit`."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for f in sorted(findings, key=lambda x: (-x["priority"], x["finding_key"])):
        if f["finding_key"] in seen:
            continue
        seen.add(f["finding_key"])
        out.append(f)
        if len(out) >= limit:
            break
    return out


async def build_findings(
    db: AsyncSession, tenant: Tenant, *, today: date, forecasts: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """All Phase 4 findings for one tenant (bounded: capacity <= 500 lines x 14 days, anomalies <= 3 days)."""
    from app.modules.mfg_intelligence.anomaly_service import anomalies_payload
    from app.modules.mfg_intelligence.capacity_service import compute_capacity

    integrated = integrated_planning_on(tenant)
    found = delivery_findings(forecasts, today=today, integrated=integrated)
    found += material_findings(forecasts, today=today, allocation=allocation_v1_on(tenant))
    cap = await compute_capacity(
        db,
        tenant.id,
        window_start=today,
        window_end=today + timedelta(days=CAPACITY_HORIZON_DAYS - 1),
        include_tentative=integrated,
        integrated_planning=integrated,
        today=today,
    )
    found += capacity_findings(cap.lines, cap.loading, today=today)
    anomalies = await anomalies_payload(
        db,
        tenant.id,
        date_from=today - timedelta(days=ANOMALY_LOOKBACK_DAYS),
        date_to=today - timedelta(days=1),
        integrated_planning=integrated,
    )
    found += anomaly_findings(anomalies["anomalies"], today=today)
    return rank_and_cap(found)


__all__ = [
    "CONFIDENCE_WEIGHT",
    "DEPARTMENT",
    "KEEP_FIRST_DEADLINE",
    "KIND_LABEL",
    "SEVERITY_RANK",
    "anomaly_findings",
    "build_findings",
    "capacity_findings",
    "delivery_findings",
    "material_findings",
    "priority_for",
    "rank_and_cap",
    "severity_for",
]
