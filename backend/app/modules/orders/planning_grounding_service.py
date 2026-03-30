"""Aggregate deterministic planning signals for an order (read-only, explainable)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bom, Order, Quotation
from app.modules.orders.change_request_service import pending_counts_for_orders
from app.modules.orders.planning_grounding_schemas import (
    GroundingSignal,
    PlanningGroundingSnapshot,
    PlanningGroundingSummaryRow,
)
from app.modules.orders.promise_checks import run_order_promise_check
from app.modules.orders.order_simulation_service import scan_capacity_bottlenecks_for_order
from sqlalchemy import select

from app.modules.production.readiness_service import get_order_chain_readiness


def _map_chain_to_signal_status(overall: str) -> tuple[str, str]:
    o = (overall or "").lower()
    if o == "blocked":
        return "blocked", "high"
    if o == "warning":
        return "warning", "medium"
    if o == "ready":
        return "ok", "high"
    if o == "not_started":
        return "unavailable", "low"
    return "warning", "medium"


async def compute_planning_grounding_snapshot(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
) -> PlanningGroundingSnapshot | None:
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
        return None

    computed_at = datetime.utcnow()
    signals: list[GroundingSignal] = []
    assumptions: list[str] = []
    limitations: list[str] = [
        "Not a finite-capacity APS; line overlap is a date-window heuristic only.",
        "ATP uses latest APPROVED/FROZEN BOM and net stock movements (no reservations).",
        "Production chain matches order.style_ref to garment_styles.style_code (not quotation.style_id).",
    ]

    promise = await run_order_promise_check(db, tenant_id=tenant_id, order=order)
    if promise.atp_ok and promise.ctp_ok:
        mat_status, mat_conf = "ok", "high"
        mat_expl = "ATP and CTP checks passed for current delivery date and quantity."
    else:
        mat_status = "blocked" if not promise.atp_ok else "warning"
        mat_conf = "high" if order.quotation_id else "medium"
        mat_expl = "; ".join(promise.reasons) or "ATP/CTP not fully satisfied."
    signals.append(
        GroundingSignal(
            code="material_atp_ctp",
            status=mat_status,
            confidence=mat_conf,
            value={"atp_ok": promise.atp_ok, "ctp_ok": promise.ctp_ok, "line_count": len(promise.lines)},
            explanation=mat_expl,
            source="promise_checks",
        )
    )

    chain = await get_order_chain_readiness(db, tenant_id, order_id)
    if chain.get("error"):
        signals.append(
            GroundingSignal(
                code="production_readiness_chain",
                status="unavailable",
                confidence="low",
                value=None,
                explanation="Order chain could not be resolved.",
                source="readiness_service",
            )
        )
        overall_chain = "blocked"
    else:
        overall_chain = str(chain.get("overall_status") or "not_started")
        st, conf = _map_chain_to_signal_status(overall_chain)
        signals.append(
            GroundingSignal(
                code="production_readiness_chain",
                status=st,
                confidence=conf,
                value={"overall_status": overall_chain, "chain": chain.get("chain")},
                explanation=f"Readiness chain rollup: {overall_chain}.",
                source="readiness_service",
            )
        )

    cap = await scan_capacity_bottlenecks_for_order(db, tenant_id=tenant_id, order=order)
    sev = int(cap.get("severity_score") or 0)
    if cap.get("config_count", 0) == 0:
        cap_status, cap_conf = "unavailable", "low"
        cap_expl = "No sewing line style configs for this order."
    elif sev >= 60:
        cap_status, cap_conf = "warning", "medium"
        cap_expl = f"Elevated line-load / overlap heuristic score ({sev}/100)."
    else:
        cap_status, cap_conf = "ok", "medium"
        cap_expl = f"Line board context: {cap.get('config_count')} config(s), overlap_hits={cap.get('overlap_hits')}."
    signals.append(
        GroundingSignal(
            code="line_capacity_context",
            status=cap_status,
            confidence=cap_conf,
            value={
                "config_count": cap.get("config_count"),
                "overlap_hits": cap.get("overlap_hits"),
                "severity_score": sev,
            },
            explanation=cap_expl,
            source="order_simulation_service",
        )
    )
    limitations.extend(cap.get("limitations") or [])

    has_quotation = bool(order.quotation_id)
    q_style_id = False
    has_bom = False
    if has_quotation:
        q = await db.get(Quotation, order.quotation_id)
        if q and q.tenant_id == tenant_id:
            q_style_id = bool(q.style_id)
            if q.style_id:
                bom_r = await db.execute(
                    select(Bom.id)
                    .where(
                        Bom.tenant_id == tenant_id,
                        Bom.style_id == q.style_id,
                        Bom.status.in_(("APPROVED", "FROZEN")),
                    )
                    .limit(1)
                )
                has_bom = bom_r.scalar_one_or_none() is not None

    style_linked = False
    if not chain.get("error"):
        style_linked = (chain.get("chain") or {}).get("style_linked", {}).get("status") == "ready"

    tna_total = 0
    if not chain.get("error") and chain.get("chain"):
        ca = chain["chain"].get("customer_approval") or {}
        tna_total = int(ca.get("total") or 0)

    deps = {
        "quotation_linked": has_quotation,
        "quotation_style_id": q_style_id,
        "approved_bom": has_bom,
        "style_ref_resolved": style_linked,
        "tna_actions_present": tna_total > 0,
        "line_allocated": (cap.get("config_count") or 0) > 0,
    }
    dep_incomplete = sum(1 for v in deps.values() if not v)
    if dep_incomplete >= 4:
        dep_status = "blocked"
    elif dep_incomplete >= 2:
        dep_status = "warning"
    else:
        dep_status = "ok"
    signals.append(
        GroundingSignal(
            code="dependency_completeness",
            status=dep_status,
            confidence="high",
            value=deps,
            explanation=f"Dependency checklist: {dep_incomplete} missing/partial.",
            source="derived",
        )
    )

    dd = order.delivery_date
    if dd:
        days = (dd - date.today()).days
        if days < 0:
            date_status, date_expl = "blocked", f"Delivery date is {abs(days)} day(s) in the past."
        elif days <= 7:
            date_status, date_expl = "warning", f"Delivery in {days} day(s)."
        else:
            date_status, date_expl = "ok", f"Delivery in {days} day(s)."
        assumptions.append("Delivery date is the shipment/customer commitment proxy; ex-factory may differ.")
    else:
        date_status, date_expl = "unavailable", "No delivery date on order header."
    signals.append(
        GroundingSignal(
            code="delivery_window",
            status=date_status,
            confidence="high" if dd else "low",
            value={"delivery_date": dd.isoformat() if dd else None},
            explanation=date_expl,
            source="order_header",
        )
    )

    # Roll up overall_readiness
    if any(s.status == "blocked" for s in signals):
        overall = "blocked"
    elif mat_status == "blocked" or overall_chain == "blocked":
        overall = "blocked"
    elif any(s.status == "warning" for s in signals) or mat_status == "warning":
        overall = "at_risk"
    elif any(s.status == "unavailable" for s in signals) and dep_incomplete >= 2:
        overall = "incomplete"
    elif dep_incomplete >= 3:
        overall = "incomplete"
    else:
        overall = "ready"

    return PlanningGroundingSnapshot(
        order_id=order_id,
        computed_at=computed_at,
        overall_readiness=overall,
        signals=signals,
        dependency_completeness=deps,
        assumptions=assumptions,
        limitations=limitations,
    )


async def compute_planning_grounding_summaries(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_ids: list[int],
) -> list[PlanningGroundingSummaryRow]:
    ids = order_ids[:80]
    counts = await pending_counts_for_orders(db, tenant_id=tenant_id, order_ids=ids)
    out: list[PlanningGroundingSummaryRow] = []
    for oid in ids:
        snap = await compute_planning_grounding_snapshot(db, tenant_id=tenant_id, order_id=oid)
        if snap:
            out.append(
                PlanningGroundingSummaryRow(
                    order_id=snap.order_id,
                    overall_readiness=snap.overall_readiness,
                    pending_change_requests=int(counts.get(oid, 0)),
                )
            )
    return out
