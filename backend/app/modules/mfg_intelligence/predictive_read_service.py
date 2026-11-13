"""Reads of the Phase 4 tables: calibration of stored forecasts and the recommendation list (read-only).

Actual ex-factory (plan 15 section 17.2): shipped = delivery challan status POSTED only; actual date = latest
`delivery_challans.delivery_date` of POSTED challans linked through `delivery_challan_orders` (NULL dates ignored).
The outcome is final when the order status is COMPLETED, or its pipeline status is PAYMENT_RECEIVED / COMPLETED, or
30 days have passed since the latest POSTED challan. Censoring: once today is after the target and no POSTED challan
is dated on or before the target, on_time = false is known at once; the P80 / P90 coverage resolves false the same
way once today is after the P80 / P90 date. Only CANCELLED orders are excluded.

Calibration (5.7, D14): one snapshot per order per lead bucket (28 / 14 / 7 days before the target, +/- 3);
Brier = mean (p - o)^2, reliability bins of width 0.2, P80 / P90 coverage. Fewer than 30 resolved outcomes ->
status INSUFFICIENT_OUTCOMES (no Brier / bins). Never recalibrates anything.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order, SewingLine
from app.models.inventory import DeliveryChallan, DeliveryChallanOrder
from app.models.mfg_predictive import FINDING_CLEARED, FINDING_KINDS, FINDING_OPEN, MfgPredictionSnapshot, MfgPredictiveFinding
from app.modules.mfg_intelligence import predictive_stats as st
from app.modules.mfg_intelligence.decimals import dec_str
from app.modules.mfg_intelligence.delivery_forecast_service import MODEL_VERSION

LEAD_BUCKETS: tuple[int, ...] = (28, 14, 7)
LEAD_TOLERANCE = 3
MIN_OUTCOMES = 30
HISTORY_DAYS = 400
MAX_SNAPSHOTS = 20000
FINAL_AFTER_LAST_CHALLAN_DAYS = 30
FINAL_PIPELINE_STATUSES = ("PAYMENT_RECEIVED", "COMPLETED")
SHIPPED_CHALLAN_STATUS = "POSTED"
MAX_RECOMMENDATIONS = 100

CALIBRATION_ASSUMPTIONS = [
    "Actual ex-factory date = latest delivery date of POSTED delivery challans linked to the order.",
    "An outcome is final when the order is completed (status or pipeline) or 30 days after the latest POSTED challan.",
    "Once the target date has passed without a POSTED challan dated on or before it, the order counts as late.",
    "One forecast per order is used for each lead time (28, 14 and 7 days before the target, +/- 3 days).",
    "Results are shown only; the model is never recalibrated automatically.",
]


@dataclass
class OrderOutcome:
    cancelled: bool
    final: bool
    actual_date: date | None
    posted_dates: list[date] = field(default_factory=list)

    def resolve_by(self, deadline: date | None, today: date) -> bool | None:
        """True / False when known, None while pending. `deadline` = target (on time) or a P80 / P90 date."""
        if deadline is None or self.cancelled:
            return None
        if self.final and self.actual_date is not None:
            return self.actual_date <= deadline
        if today > deadline and not any(d <= deadline for d in self.posted_dates):
            return False
        return None


async def load_order_outcomes(
    db: AsyncSession, tenant_id: int, order_ids: list[int], *, today: date
) -> dict[int, OrderOutcome]:
    """Outcome facts per order (two bounded queries, any number of orders)."""
    ids = sorted({int(i) for i in order_ids})
    if not ids:
        return {}
    orders = {
        int(oid): (status, pipeline)
        for oid, status, pipeline in (
            await db.execute(
                select(Order.id, Order.status, Order.pipeline_status).where(Order.tenant_id == tenant_id, Order.id.in_(ids))
            )
        ).all()
    }
    dates: dict[int, list[date]] = defaultdict(list)
    for oid, d in (
        await db.execute(
            select(DeliveryChallanOrder.order_id, DeliveryChallan.delivery_date)
            .join(DeliveryChallan, DeliveryChallan.id == DeliveryChallanOrder.delivery_challan_id)
            .where(
                DeliveryChallanOrder.tenant_id == tenant_id,
                DeliveryChallan.tenant_id == tenant_id,
                DeliveryChallanOrder.order_id.in_(ids),
                func.upper(func.trim(DeliveryChallan.status)) == SHIPPED_CHALLAN_STATUS,
                DeliveryChallan.delivery_date.isnot(None),
            )
        )
    ).all():
        dates[int(oid)].append(d)
    out: dict[int, OrderOutcome] = {}
    for oid in ids:
        if oid not in orders:
            continue
        status, pipeline = orders[oid]
        status_u = (status or "").strip().upper()
        pipeline_u = (pipeline or "").strip().upper()
        posted = sorted(dates.get(oid, []))
        latest = posted[-1] if posted else None
        final = (
            status_u == "COMPLETED"
            or pipeline_u in FINAL_PIPELINE_STATUSES
            or (latest is not None and today >= latest + timedelta(days=FINAL_AFTER_LAST_CHALLAN_DAYS))
        )
        out[oid] = OrderOutcome(cancelled=status_u == "CANCELLED", final=final, actual_date=latest, posted_dates=posted)
    return out


def pick_bucket_snapshots(rows: list[Any]) -> dict[int, list[Any]]:
    """Per lead bucket, one snapshot per order: lead within +/- 3 days, closest lead first, then the later as-of."""
    best: dict[tuple[int, int], tuple[tuple[int, int], Any]] = {}
    for r in rows:
        if r.target_date is None:
            continue
        lead = (r.target_date - r.as_of_date).days
        for bucket in LEAD_BUCKETS:
            gap = abs(lead - bucket)
            if gap > LEAD_TOLERANCE:
                continue
            key = (bucket, int(r.order_id))
            rank = (gap, -r.as_of_date.toordinal())
            if key not in best or rank < best[key][0]:
                best[key] = (rank, r)
    out: dict[int, list[Any]] = {b: [] for b in LEAD_BUCKETS}
    for (bucket, _oid), (_rank, r) in sorted(best.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        out[bucket].append(r)
    return out


async def calibration_payload(db: AsyncSession, tenant_id: int, *, today: date) -> dict[str, Any]:
    snap = MfgPredictionSnapshot
    rows = list(
        (
            await db.execute(
                select(snap)
                .where(
                    snap.tenant_id == tenant_id,
                    snap.model_version == MODEL_VERSION,
                    snap.as_of_date >= today - timedelta(days=HISTORY_DAYS),
                    snap.target_date.isnot(None),
                )
                .order_by(snap.as_of_date.desc(), snap.id.desc())
                .limit(MAX_SNAPSHOTS + 1)
            )
        )
        .scalars()
        .all()
    )
    notices: list[str] = []
    if len(rows) > MAX_SNAPSHOTS:
        rows = rows[:MAX_SNAPSHOTS]
        notices.append(f"SNAPSHOTS_TRUNCATED: only the latest {MAX_SNAPSHOTS} snapshots were used")
    buckets = pick_bucket_snapshots(rows)
    picked = [r for b in LEAD_BUCKETS for r in buckets[b]]
    outcomes = await load_order_outcomes(db, tenant_id, [r.order_id for r in picked], today=today)

    pairs: list[tuple[Decimal, bool]] = []
    bucket_pairs: dict[int, list[tuple[Decimal, bool]]] = {b: [] for b in LEAD_BUCKETS}
    coverage: dict[str, list[bool]] = {"p80": [], "p90": []}
    n_pending = n_excluded = 0
    for bucket in LEAD_BUCKETS:
        for r in buckets[bucket]:
            oc = outcomes.get(int(r.order_id))
            if oc is None or oc.cancelled:
                n_excluded += 1
                continue
            on_time = r.on_time if r.outcome_at is not None and r.on_time is not None else oc.resolve_by(r.target_date, today)
            for key, d in (("p80", r.p80_date), ("p90", r.p90_date)):
                hit = oc.resolve_by(d, today)
                if hit is not None:
                    coverage[key].append(hit)
            if on_time is None:
                n_pending += 1
                continue
            if r.on_time_probability is None:
                n_excluded += 1  # fixed-band fallback forecasts carry no probability (17.12)
                continue
            pair = (Decimal(r.on_time_probability), bool(on_time))
            pairs.append(pair)
            bucket_pairs[bucket].append(pair)

    enough = len(pairs) >= MIN_OUTCOMES

    def share(values: list[bool]) -> str | None:
        if not values or not enough:
            return None
        return dec_str(Decimal(sum(1 for v in values if v)) / Decimal(len(values)), 4)

    bins_out = []
    if enough:
        for b in st.reliability_bins(pairs):
            bins_out.append(
                {
                    "lower": dec_str(b["lower"], 1),
                    "upper": dec_str(b["upper"], 1),
                    "n": b["n"],
                    "mean_probability": dec_str(b["mean_probability"], 4),
                    "hit_rate": dec_str(b["hit_rate"], 4),
                }
            )
    return {
        "as_of": today,
        "model_version": MODEL_VERSION,
        "status": "OK" if enough else "INSUFFICIENT_OUTCOMES",
        "calibrated": enough,
        "min_outcomes": MIN_OUTCOMES,
        "n": len(pairs),
        "n_snapshots_considered": len(picked),
        "n_pending": n_pending,
        "n_excluded": n_excluded,
        "brier": dec_str(st.brier(pairs), 4) if enough else None,
        "bins": bins_out,
        "coverage": {
            "p80": {"n": len(coverage["p80"]), "share": share(coverage["p80"])},
            "p90": {"n": len(coverage["p90"]), "share": share(coverage["p90"])},
        },
        "lead_buckets": [
            {
                "lead_days": b,
                "n": len(bucket_pairs[b]),
                "brier": dec_str(st.brier(bucket_pairs[b]), 4) if enough and bucket_pairs[b] else None,
            }
            for b in LEAD_BUCKETS
        ],
        "notices": notices,
        "assumptions": list(CALIBRATION_ASSUMPTIONS),
    }


STATUS_FILTERS = (FINDING_OPEN, FINDING_CLEARED, "ALL")


async def recommendations_payload(
    db: AsyncSession,
    tenant_id: int,
    *,
    status: str,
    kind: str | None,
    limit: int,
    hidden_kinds: tuple[str, ...] = (),
) -> dict[str, Any]:
    """Stored findings, highest priority first. `hidden_kinds` (no source permission) are never returned."""
    f = MfgPredictiveFinding
    stmt = (
        select(f, Order.order_code, SewingLine.line_code)
        .outerjoin(Order, (Order.id == f.order_id) & (Order.tenant_id == tenant_id))
        .outerjoin(SewingLine, (SewingLine.id == f.line_id) & (SewingLine.tenant_id == tenant_id))
        .where(f.tenant_id == tenant_id)
    )
    if status != "ALL":
        stmt = stmt.where(f.status == status)
    if kind is not None:
        stmt = stmt.where(f.kind == kind)
    if hidden_kinds:
        stmt = stmt.where(f.kind.notin_(hidden_kinds))
    rows = (await db.execute(stmt.order_by(f.priority.desc(), f.id.desc()).limit(limit + 1))).all()
    items = []
    for finding, order_code, line_code in rows[:limit]:
        items.append(
            {
                "id": finding.id,
                "finding_key": finding.finding_key,
                "kind": finding.kind,
                "severity": finding.severity,
                "priority": dec_str(Decimal(finding.priority), 4),
                "department": finding.department,
                "order_id": finding.order_id,
                "order_code": order_code,
                "line_id": finding.line_id,
                "line_code": line_code,
                "status": finding.status,
                "alert_eligible": bool(finding.alert_eligible),
                "first_detected_on": finding.first_detected_on,
                "last_detected_on": finding.last_detected_on,
                "cleared_on": finding.cleared_on,
                "deadline_date": finding.deadline_date,
                "decision_status": finding.decision_status,
                "outcome_status": finding.outcome_status,
                "payload": finding.payload or {},
            }
        )
    notices = []
    if hidden_kinds:
        notices.append("HIDDEN_KINDS_NO_SOURCE_ACCESS: " + ", ".join(hidden_kinds))
    return {
        "status": status,
        "kind": kind,
        "limit": limit,
        "items": items,
        "truncated": len(rows) > limit,
        "kinds": list(FINDING_KINDS),
        "notices": notices,
    }
