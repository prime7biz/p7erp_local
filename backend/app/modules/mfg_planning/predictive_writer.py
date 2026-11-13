"""Writers for Manufacturing Intelligence Phase 4 (plan 15 sections 5.6, 8, 10, 17.4, 17.5, 17.9, 17.15, 17.17).

Only touches `mfg_prediction_snapshots`, `mfg_predictive_findings`, `ai_agent_decisions` (decision rows) and the
status of `alert_instance` rows of the six `mfg_*` alert rules. Never writes plans, orders, purchase orders,
payroll, financing or shipments. Callers own the transaction (no commit here).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AlertInstance
from app.models.ai_agents import AiAgentDecision
from app.models.mfg_predictive import FINDING_CLEARED, FINDING_OPEN, MfgPredictionSnapshot, MfgPredictiveFinding
from app.modules.mfg_intelligence.bottleneck_service import (
    KEEP_FIRST_DEADLINE,
    KIND_DELIVERY,
    KIND_IDLE,
    KIND_MATERIAL,
    KIND_OUTPUT,
    KIND_OVERLOAD,
    KIND_QUALITY,
)
from app.modules.mfg_intelligence.decimals import ZERO, to_dec
from app.modules.mfg_intelligence.delivery_forecast_service import MODEL_VERSION

logger = logging.getLogger(__name__)

AGENT = "mfg_bottleneck"
ALERT_ACTIVE_STATUSES = ("new", "acknowledged", "in_progress", "waiting_on_buyer", "waiting_on_supplier", "snoozed",
                         "escalated")
MAX_OPEN_FINDINGS = 500
MAX_ELIGIBLE = 20
MAX_ELIGIBLE_PER_DEPARTMENT = 5
SUPPRESS_DECIDED_DAYS = 7
MAX_OUTCOME_ROWS = 500
MAX_ANOMALY_OUTCOMES = 100
MAX_SNAPSHOT_OUTCOMES = 2000
PURGE_AFTER_DAYS = 400
MAX_PURGE_ROWS = 5000
UNKNOWN_AFTER_DAYS = 30
ANOMALY_MET_POINTS = 3
ANOMALY_MET_Z = Decimal("2")
RECEIPT_TOLERANCE = Decimal("0.001")
DECIDED = ("ACCEPTED", "REJECTED")


def rule_key_for(kind: str) -> str:
    """Alert rule key / alert_type of a finding kind (e.g. DELIVERY_RISK -> mfg_delivery_risk)."""
    return f"mfg_{kind.lower()}"


def natural_key_for(finding: Any) -> str:
    """17.4: one alert episode per finding row (a cleared-then-recurring condition is a new row = new alert)."""
    return f"{rule_key_for(finding.kind)}:{finding.id}"


MFG_RULE_KEYS: tuple[str, ...] = tuple(
    rule_key_for(k) for k in (KIND_DELIVERY, KIND_MATERIAL, KIND_OVERLOAD, KIND_IDLE, KIND_OUTPUT, KIND_QUALITY)
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- snapshots


async def upsert_snapshots(db: AsyncSession, tenant_id: int, forecasts: list[dict[str, Any]], *, today: date) -> int:
    """Today's snapshot per forecast order (one row per tenant, order, day and model version)."""
    rows = []
    for f in forecasts:
        p = to_dec(f.get("on_time_probability"))
        rows.append(
            {
                "tenant_id": tenant_id,
                "order_id": int(f["order_id"]),
                "as_of_date": today,
                "target_date": f.get("target_date"),
                "model_version": MODEL_VERSION,
                "band": (f.get("band") or "UNKNOWN")[:16],
                "p50_date": f.get("p50_date"),
                "p80_date": f.get("p80_date"),
                "p90_date": f.get("p90_date"),
                "on_time_probability": p,
                "efficiency_source": (f.get("efficiency_source") or None) and str(f["efficiency_source"])[:16],
                "lateness_source": (f.get("lateness_source") or None) and str(f["lateness_source"])[:24],
                "confidence": (f.get("confidence") or None) and str(f["confidence"])[:8],
                "reason_codes": list(f.get("reason_codes") or [])[:40],
                "inputs_hash": f.get("inputs_hash"),
                "created_at": datetime.utcnow(),
            }
        )
    if not rows:
        return 0
    stmt = pg_insert(MfgPredictionSnapshot).values(rows)
    keep = ("target_date", "band", "p50_date", "p80_date", "p90_date", "on_time_probability", "efficiency_source",
            "lateness_source", "confidence", "reason_codes", "inputs_hash")
    stmt = stmt.on_conflict_do_update(
        index_elements=["tenant_id", "order_id", "as_of_date", "model_version"],
        set_={k: getattr(stmt.excluded, k) for k in keep},
    )
    await db.execute(stmt)
    return len(rows)


async def backfill_snapshot_outcomes(db: AsyncSession, tenant_id: int, *, today: date) -> int:
    """Resolve open snapshot outcomes with the 17.2 rules (bounded)."""
    from app.modules.mfg_intelligence.predictive_read_service import load_order_outcomes

    snap = MfgPredictionSnapshot
    rows = list(
        (
            await db.execute(
                select(snap)
                .where(snap.tenant_id == tenant_id, snap.outcome_at.is_(None), snap.target_date.isnot(None))
                .order_by(snap.target_date, snap.id)
                .limit(MAX_SNAPSHOT_OUTCOMES)
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return 0
    outcomes = await load_order_outcomes(db, tenant_id, [r.order_id for r in rows], today=today)
    now = datetime.utcnow()
    done = 0
    for r in rows:
        oc = outcomes.get(int(r.order_id))
        if oc is None or oc.cancelled:
            continue
        hit = oc.resolve_by(r.target_date, today)
        if hit is None:
            continue
        r.on_time = hit
        r.actual_date = oc.actual_date
        r.outcome_at = now
        done += 1
    await db.flush()
    return done


# --------------------------------------------------------------------------- findings


async def _decided_keys(db: AsyncSession, tenant_id: int, *, since: datetime) -> set[str]:
    f = MfgPredictiveFinding
    return set(
        (
            await db.execute(
                select(f.finding_key)
                .join(AiAgentDecision, AiAgentDecision.finding_id == f.id)
                .where(
                    AiAgentDecision.tenant_id == tenant_id,
                    f.tenant_id == tenant_id,
                    AiAgentDecision.decided_at >= since,
                    AiAgentDecision.decision.in_((*DECIDED, "DISMISSED")),
                )
            )
        ).scalars()
    )


def choose_eligible(rows: list[Any], suppressed_keys: set[str]) -> set[int]:
    """17.17 / D19: top 20 OPEN findings per tenant, at most 5 per department; decided ones never (pure)."""
    picked: set[int] = set()
    per_dept: dict[str, int] = {}
    for r in sorted(rows, key=lambda x: (-Decimal(x.priority), x.id)):
        if len(picked) >= MAX_ELIGIBLE:
            break
        if r.decision_status is not None or r.finding_key in suppressed_keys:
            continue
        dept = r.department or ""
        if per_dept.get(dept, 0) >= MAX_ELIGIBLE_PER_DEPARTMENT:
            continue
        per_dept[dept] = per_dept.get(dept, 0) + 1
        picked.add(r.id)
    return picked


async def sync_findings(db: AsyncSession, tenant_id: int, built: list[dict[str, Any]], *, today: date) -> dict[str, Any]:
    """Upsert the built findings, clear the OPEN ones no longer found, then mark the alert-eligible set."""
    f = MfgPredictiveFinding
    built = built[:MAX_OPEN_FINDINGS]
    existing = {
        r.finding_key: r
        for r in (
            await db.execute(select(f).where(f.tenant_id == tenant_id, f.status == FINDING_OPEN).limit(MAX_OPEN_FINDINGS * 2))
        )
        .scalars()
        .all()
    }
    created = updated = cleared = 0
    seen: set[str] = set()
    for b in built:
        key = b["finding_key"][:160]
        seen.add(key)
        row = existing.get(key)
        if row is None:
            row = f(
                tenant_id=tenant_id,
                finding_key=key,
                kind=b["kind"],
                status=FINDING_OPEN,
                first_detected_on=today,
                last_detected_on=today,
                deadline_date=b.get("deadline_date"),
            )
            db.add(row)
            existing[key] = row
            created += 1
        else:
            updated += 1
            row.last_detected_on = today
            if b["kind"] not in KEEP_FIRST_DEADLINE or row.deadline_date is None:
                row.deadline_date = b.get("deadline_date")
        row.severity = b["severity"]
        row.priority = b["priority"]
        row.department = b.get("department")
        row.order_id = b.get("order_id")
        row.line_id = b.get("line_id")
        row.payload = b.get("payload") or {}
        row.updated_at = datetime.utcnow()
    for key, row in existing.items():
        if key in seen or row.status != FINDING_OPEN:
            continue
        row.status = FINDING_CLEARED
        row.cleared_on = today
        row.alert_eligible = False
        row.updated_at = datetime.utcnow()
        cleared += 1
    await db.flush()
    open_rows = [r for r in existing.values() if r.status == FINDING_OPEN]
    suppressed = await _decided_keys(db, tenant_id, since=datetime.utcnow() - timedelta(days=SUPPRESS_DECIDED_DAYS))
    eligible = choose_eligible(open_rows, suppressed)
    for r in open_rows:
        r.alert_eligible = r.id in eligible
    await db.flush()
    return {
        "created": created,
        "updated": updated,
        "cleared": cleared,
        "open": len(open_rows),
        "eligible": len(eligible),
        "eligible_natural_keys": sorted(natural_key_for(r) for r in open_rows if r.id in eligible),
    }


# --------------------------------------------------------------------------- alert cleanup (17.4 / 17.5)


async def resolve_stale_alerts(db: AsyncSession, tenant_id: int, keep_natural_keys: set[str]) -> int:
    """Resolve active `mfg_*` alerts whose finding is no longer OPEN and eligible (bounded UPDATE)."""
    stmt = (
        update(AlertInstance)
        .where(
            AlertInstance.tenant_id == tenant_id,
            AlertInstance.alert_type.in_(MFG_RULE_KEYS),
            AlertInstance.status.in_(ALERT_ACTIVE_STATUSES),
        )
        .values(status="resolved", resolved_at=_utcnow(), updated_at=_utcnow())
        .execution_options(synchronize_session=False)
    )
    if keep_natural_keys:
        stmt = stmt.where(AlertInstance.natural_key.notin_(sorted(keep_natural_keys)))
    result = await db.execute(stmt)
    return int(result.rowcount or 0)


async def resolve_all_mfg_alerts(db: AsyncSession, tenant_id: int) -> int:
    """Flag switched off: resolve every active `mfg_*` alert of the tenant once (one bounded UPDATE)."""
    return await resolve_stale_alerts(db, tenant_id, set())


# --------------------------------------------------------------------------- decisions (17.9)


class DecisionError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


async def _stored_decision(db: AsyncSession, tenant_id: int, finding_id: int) -> AiAgentDecision | None:
    return (
        await db.execute(
            select(AiAgentDecision)
            .where(
                AiAgentDecision.tenant_id == tenant_id,
                AiAgentDecision.finding_id == finding_id,
                AiAgentDecision.decision.in_(DECIDED),
            )
            .order_by(AiAgentDecision.id)
            .limit(1)
        )
    ).scalar_one_or_none()


async def lock_finding(db: AsyncSession, tenant_id: int, finding_id: int) -> MfgPredictiveFinding:
    """Row lock on the tenant's finding; another tenant's id looks like a missing one (404)."""
    row = (
        await db.execute(
            select(MfgPredictiveFinding)
            .where(MfgPredictiveFinding.tenant_id == tenant_id, MfgPredictiveFinding.id == finding_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise DecisionError(404, "Recommendation not found")
    return row


async def record_decision(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    finding: MfgPredictiveFinding,
    decision: str,
    note: str | None,
) -> tuple[AiAgentDecision, bool]:
    """(decision row, replayed). The caller holds the finding row lock. Never writes business data.

    A stored ACCEPTED / REJECTED decision is returned as it is (idempotent replay, even for the opposite choice).
    The partial unique index (tenant_id, finding_id) catches a concurrent double submit: IntegrityError -> re-read.
    """
    stored = await _stored_decision(db, tenant_id, finding.id)
    if stored is not None:
        return stored, True
    if finding.outcome_status is not None:
        # Owner rule: a decision after the measured outcome would distort the outcome statistics.
        raise DecisionError(409, "The deadline has passed; the outcome is already recorded")
    if finding.decision_status in DECIDED:
        raise DecisionError(409, "This recommendation was already dismissed in AI agents.")
    if finding.status != FINDING_OPEN:
        raise DecisionError(409, "This recommendation is no longer open. Refresh the list.")
    payload = finding.payload if isinstance(finding.payload, dict) else {}
    row = AiAgentDecision(
        tenant_id=tenant_id,
        agent=AGENT,
        exception_key=natural_key_for(finding),
        decision=decision,
        note=note,
        recipients_count=0,
        decided_by=user_id,
        recommendation_json={
            "kind": finding.kind,
            "severity": finding.severity,
            "recommendation": payload.get("recommendation"),
            "alternatives": payload.get("alternatives"),
            "approval_requirement": payload.get("approval_requirement"),
            "subject": payload.get("subject"),
        },
        deadline_date=finding.deadline_date,
        finding_id=finding.id,
    )
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        stored = await _stored_decision(db, tenant_id, finding.id)
        if stored is None:
            raise
        return stored, True
    finding.decision_status = decision
    finding.alert_eligible = False
    finding.updated_at = datetime.utcnow()
    await db.flush()
    return row, False


async def mark_rejected_from_governed(db: AsyncSession, tenant_id: int, finding_id: int) -> None:
    """Governed-AI DISMISSED on an mfg key = REJECTED on the finding (shared writer, 17.9). NOTIFIED is no decision."""
    row = (
        await db.execute(
            select(MfgPredictiveFinding)
            .where(MfgPredictiveFinding.tenant_id == tenant_id, MfgPredictiveFinding.id == finding_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None or row.decision_status is not None:
        return
    row.decision_status = "REJECTED"
    row.alert_eligible = False
    row.updated_at = datetime.utcnow()
    await db.flush()


# --------------------------------------------------------------------------- outcomes (5.6 / 17.15)


async def _receipts_by(db: AsyncSession, tenant_id: int, line_ids: list[int], until: date) -> dict[int, Decimal]:
    from app.models.inventory import GoodsReceiving, GoodsReceivingItem
    from app.modules.inventory.open_po_supply_service import usable_received_qty

    out: dict[int, Decimal] = {}
    if not line_ids:
        return out
    for lid, accepted, received in (
        await db.execute(
            select(GoodsReceivingItem.purchase_order_line_id, GoodsReceivingItem.accepted_qty, GoodsReceivingItem.received_qty)
            .join(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
            .where(
                GoodsReceiving.tenant_id == tenant_id,
                GoodsReceivingItem.tenant_id == tenant_id,
                GoodsReceivingItem.purchase_order_line_id.in_(line_ids),
                GoodsReceiving.status == "RECEIVED",
                GoodsReceiving.received_date.isnot(None),
                GoodsReceiving.received_date <= until,
            )
        )
    ).all():
        out[int(lid)] = out.get(int(lid), ZERO) + usable_received_qty(accepted, received)
    return out


async def measure_outcomes(
    db: AsyncSession, tenant_id: int, *, today: date, integrated_planning: bool = False
) -> dict[str, int]:
    """Findings past their deadline: IGNORED when nobody decided, then MET / NOT_MET / UNKNOWN (bounded)."""
    from app.modules.mfg_intelligence.anomaly_service import (
        METRIC_EFFICIENCY,
        METRIC_REJECTION,
        line_point_scores,
    )
    from app.modules.mfg_intelligence.predictive_read_service import load_order_outcomes

    f = MfgPredictiveFinding
    rows = list(
        (
            await db.execute(
                select(f)
                .where(
                    f.tenant_id == tenant_id,
                    f.outcome_status.is_(None),
                    f.deadline_date.isnot(None),
                    f.deadline_date < today,
                )
                .order_by(f.deadline_date, f.id)
                .limit(MAX_OUTCOME_ROWS)
            )
        )
        .scalars()
        .all()
    )
    counts = {"ignored": 0, "MET": 0, "NOT_MET": 0, "UNKNOWN": 0}
    if not rows:
        return counts
    delivery_orders = [r.order_id for r in rows if r.kind == KIND_DELIVERY and r.order_id is not None]
    outcomes = await load_order_outcomes(db, tenant_id, delivery_orders, today=today) if delivery_orders else {}
    po_line_ids: set[int] = set()
    for r in rows:
        if r.kind == KIND_MATERIAL:
            for p in ((r.payload or {}).get("material") or {}).get("po_lines") or []:
                if p.get("po_line_id") is not None:
                    po_line_ids.add(int(p["po_line_id"]))
    anomaly_budget = MAX_ANOMALY_OUTCOMES
    now = datetime.utcnow()
    for r in rows:
        if r.decision_status is None:
            r.decision_status = "IGNORED"
            counts["ignored"] += 1
        status: str | None = None
        detail: dict[str, Any] = {}
        expired = today > r.deadline_date + timedelta(days=UNKNOWN_AFTER_DAYS)
        if r.kind == KIND_DELIVERY:
            oc = outcomes.get(int(r.order_id)) if r.order_id is not None else None
            hit = oc.resolve_by(r.deadline_date, today) if oc is not None and not oc.cancelled else None
            if hit is not None:
                status = "MET" if hit else "NOT_MET"
                detail = {"actual_date": oc.actual_date.isoformat() if oc.actual_date else None}
            elif expired or oc is None or oc.cancelled:
                status = "UNKNOWN"
        elif r.kind == KIND_MATERIAL:
            lines = ((r.payload or {}).get("material") or {}).get("po_lines") or []
            if lines:
                got = await _receipts_by(db, tenant_id, [int(p["po_line_id"]) for p in lines if p.get("po_line_id")],
                                         r.deadline_date)
                need: dict[int, Decimal] = {}
                for p in lines:
                    if p.get("po_line_id") is not None:
                        need[int(p["po_line_id"])] = need.get(int(p["po_line_id"]), ZERO) + (to_dec(p.get("qty_used")) or ZERO)
                ok = all(got.get(lid, ZERO) + RECEIPT_TOLERANCE >= qty for lid, qty in need.items())
                status = "MET" if ok else "NOT_MET"
            else:
                status = "MET" if r.status == FINDING_CLEARED and r.cleared_on and r.cleared_on <= r.deadline_date else "NOT_MET"
        elif r.kind in (KIND_OVERLOAD, KIND_IDLE):
            cleared_in_time = r.status == FINDING_CLEARED and r.cleared_on is not None and r.cleared_on <= r.deadline_date
            status = "MET" if cleared_in_time else "NOT_MET"
        elif r.kind in (KIND_OUTPUT, KIND_QUALITY):
            anomaly = (r.payload or {}).get("anomaly") or {}
            latest = anomaly.get("latest_day")
            if r.line_id is None or not latest or anomaly_budget <= 0:
                status = "UNKNOWN" if expired or r.line_id is None or not latest else None
            else:
                anomaly_budget -= 1
                metric = anomaly.get("metric") or METRIC_EFFICIENCY
                scores = await line_point_scores(
                    db, tenant_id, line_id=int(r.line_id), metric=metric,
                    hour_slot=anomaly.get("hour_slot") if metric not in (METRIC_EFFICIENCY, METRIC_REJECTION) else None,
                    date_from=date.fromisoformat(latest) + timedelta(days=1), date_to=today - timedelta(days=1),
                    integrated_planning=integrated_planning,
                )
                scored = [(d, z) for d, z in scores if z is not None][:ANOMALY_MET_POINTS]
                bad = [z for _d, z in scored if abs(z) >= ANOMALY_MET_Z]
                if bad:
                    status = "NOT_MET"
                elif len(scored) >= ANOMALY_MET_POINTS:
                    status = "MET"
                elif expired:
                    status = "UNKNOWN"
                detail = {"points": len(scored)}
        if status is not None:
            r.outcome_status = status
            r.outcome_json = {"measured_on": today.isoformat(), **detail}
            r.outcome_measured_at = now
            counts[status] += 1
        r.updated_at = now
    await db.flush()
    return counts


# --------------------------------------------------------------------------- retention (D25)


async def purge_old_rows(db: AsyncSession, tenant_id: int, *, today: date) -> int:
    """Snapshots and cleared findings older than 400 days, at most 5,000 rows per table per run."""
    cutoff = today - timedelta(days=PURGE_AFTER_DAYS)
    snap, fnd = MfgPredictionSnapshot, MfgPredictiveFinding
    snap_ids = select(snap.id).where(snap.tenant_id == tenant_id, snap.as_of_date < cutoff).limit(MAX_PURGE_ROWS)
    r1 = await db.execute(
        delete(snap).where(snap.id.in_(snap_ids.scalar_subquery())).execution_options(synchronize_session=False)
    )
    fnd_ids = (
        select(fnd.id)
        .where(fnd.tenant_id == tenant_id, fnd.status == FINDING_CLEARED, fnd.cleared_on < cutoff)
        .limit(MAX_PURGE_ROWS)
    )
    r2 = await db.execute(
        delete(fnd).where(fnd.id.in_(fnd_ids.scalar_subquery())).execution_options(synchronize_session=False)
    )
    return int(r1.rowcount or 0) + int(r2.rowcount or 0)


async def open_finding_count(db: AsyncSession, tenant_id: int) -> int:
    return int(
        (
            await db.execute(
                select(func.count()).select_from(MfgPredictiveFinding).where(
                    MfgPredictiveFinding.tenant_id == tenant_id, MfgPredictiveFinding.status == FINDING_OPEN
                )
            )
        ).scalar()
        or 0
    )
