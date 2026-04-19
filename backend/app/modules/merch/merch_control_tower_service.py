"""Aggregated merchandising metrics for the merch control tower (efficient COUNT queries + capped drift scan)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CommercialChangeRequest, Inquiry, Order, Quotation
from app.models.merch import Bom, MerchSampleRequest, OrderFollowupAction
from app.modules.merch.merch_control_tower_schemas import (
    BomStatusCountsOut,
    CountAndDate,
    MerchControlTowerSummaryOut,
    QuotationsAtRiskOut,
    TnaOverdueOut,
)
from app.modules.orders.commercial_snapshot_service import list_commercial_discrepancies

_INQUIRY_OPEN = ("DRAFT", "SUBMITTED")
_QUOTE_TERMINAL = ("CONVERTED", "CANCELLED", "REJECTED")
_DRIFT_SCAN_CAP = 250
_TNA_OPEN = ("completed", "approved", "cancelled")
_PIPELINE_DONE = ("SHIPPED", "PAYMENT_RECEIVED", "COMPLETED")
_EXTRA_DRIFT_CODES = frozenset({"DELIVERY_DATE_DRIFT", "QTY_ORDER_VS_QUOTE_PROJECTION"})
_SAMPLE_PENDING = ("requested", "in_progress", "submitted")


def _is_commercial_drift_code(code: str | None) -> bool:
    c = code or ""
    return c.startswith("DRIFT_") or c in _EXTRA_DRIFT_CODES


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _count_orders_commercial_drift(db: AsyncSession, *, tenant_id: int) -> int:
    """Count orders (recent cap) where live quotation differs from frozen snapshot (DRIFT_* codes)."""
    o_stmt = (
        select(Order.id, Order.quotation_id, Order.commercial_snapshot_json)
        .where(
            Order.tenant_id == tenant_id,
            Order.quotation_id.isnot(None),
            Order.commercial_snapshot_json.isnot(None),
        )
        .order_by(Order.id.desc())
        .limit(_DRIFT_SCAN_CAP)
    )
    o_rows = (await db.execute(o_stmt)).all()
    if not o_rows:
        return 0
    oids = [r.id for r in o_rows]
    qids = [r.quotation_id for r in o_rows if r.quotation_id]
    if not qids:
        return 0
    orders_list = (await db.scalars(select(Order).where(Order.id.in_(oids), Order.tenant_id == tenant_id))).all()
    omap = {o.id: o for o in orders_list}
    qmap = {
        q.id: q
        for q in (await db.scalars(select(Quotation).where(Quotation.id.in_(qids), Quotation.tenant_id == tenant_id))).all()
    }
    drift = 0
    for row in o_rows:
        oid, qid, snap = row.id, row.quotation_id, row.commercial_snapshot_json
        if not qid:
            continue
        order = omap.get(oid)
        q = qmap.get(qid)
        if not order or not q:
            continue
        disc = list_commercial_discrepancies(order=order, live_quotation=q, frozen=snap if isinstance(snap, dict) else {})
        if any(_is_commercial_drift_code(d.get("code")) for d in disc):
            drift += 1
    return drift


async def build_merch_control_tower_summary(db: AsyncSession, *, tenant_id: int) -> MerchControlTowerSummaryOut:
    today = date.today()
    soon = today + timedelta(days=14)

    inq_count = int(
        await db.scalar(
            select(func.count())
            .select_from(Inquiry)
            .where(Inquiry.tenant_id == tenant_id, Inquiry.status.in_(_INQUIRY_OPEN))
        )
        or 0
    )
    oldest_inq = await db.scalar(
        select(func.min(Inquiry.created_at)).where(
            Inquiry.tenant_id == tenant_id,
            Inquiry.status.in_(_INQUIRY_OPEN),
        )
    )
    oldest_day: date | None = None
    if oldest_inq:
        oldest_day = oldest_inq.date() if hasattr(oldest_inq, "date") else None

    incomplete_q = int(
        await db.scalar(
            select(func.count())
            .select_from(Quotation)
            .where(
                Quotation.tenant_id == tenant_id,
                Quotation.status.notin_(_QUOTE_TERMINAL),
                or_(
                    Quotation.total_cost.is_(None),
                    Quotation.material_cost.is_(None),
                ),
            )
        )
        or 0
    )

    expiring_q = int(
        await db.scalar(
            select(func.count())
            .select_from(Quotation)
            .where(
                Quotation.tenant_id == tenant_id,
                Quotation.valid_until.isnot(None),
                Quotation.valid_until >= today,
                Quotation.valid_until <= soon,
                Quotation.status.notin_(_QUOTE_TERMINAL),
            )
        )
        or 0
    )

    pending_cr = int(
        await db.scalar(
            select(func.count())
            .select_from(CommercialChangeRequest)
            .where(
                CommercialChangeRequest.tenant_id == tenant_id,
                CommercialChangeRequest.status == "pending_approval",
            )
        )
        or 0
    )

    # BOM status buckets (case-insensitive)
    bom_draft = int(
        await db.scalar(
            select(func.count())
            .select_from(Bom)
            .where(Bom.tenant_id == tenant_id, Bom.is_active.is_(True), func.upper(Bom.status) == "DRAFT")
        )
        or 0
    )
    bom_sub = int(
        await db.scalar(
            select(func.count())
            .select_from(Bom)
            .where(Bom.tenant_id == tenant_id, Bom.is_active.is_(True), func.upper(Bom.status) == "SUBMITTED")
        )
        or 0
    )
    bom_app = int(
        await db.scalar(
            select(func.count())
            .select_from(Bom)
            .where(Bom.tenant_id == tenant_id, Bom.is_active.is_(True), func.upper(Bom.status) == "APPROVED")
        )
        or 0
    )
    bom_fr = int(
        await db.scalar(
            select(func.count())
            .select_from(Bom)
            .where(Bom.tenant_id == tenant_id, Bom.is_active.is_(True), func.upper(Bom.status) == "FROZEN")
        )
        or 0
    )

    tna_all = int(
        await db.scalar(
            select(func.count())
            .select_from(OrderFollowupAction)
            .where(
                OrderFollowupAction.tenant_id == tenant_id,
                OrderFollowupAction.is_active.is_(True),
                OrderFollowupAction.planned_date.isnot(None),
                OrderFollowupAction.planned_date < today,
                OrderFollowupAction.status.notin_(_TNA_OPEN),
            )
        )
        or 0
    )
    tna_crit = int(
        await db.scalar(
            select(func.count())
            .select_from(OrderFollowupAction)
            .where(
                OrderFollowupAction.tenant_id == tenant_id,
                OrderFollowupAction.is_active.is_(True),
                OrderFollowupAction.is_mandatory.is_(True),
                OrderFollowupAction.planned_date.isnot(None),
                OrderFollowupAction.planned_date < today,
                OrderFollowupAction.status.notin_(_TNA_OPEN),
            )
        )
        or 0
    )

    planning = int(
        await db.scalar(
            select(func.count())
            .select_from(Order)
            .where(
                Order.tenant_id == tenant_id,
                Order.delivery_date.isnot(None),
                Order.delivery_date >= today,
                Order.delivery_date <= soon,
                Order.pipeline_status.notin_(_PIPELINE_DONE),
                Order.status.notin_(("CANCELLED",)),
            )
        )
        or 0
    )

    drift_count = await _count_orders_commercial_drift(db, tenant_id=tenant_id)

    sample_pending = int(
        await db.scalar(
            select(func.count())
            .select_from(MerchSampleRequest)
            .where(
                MerchSampleRequest.tenant_id == tenant_id,
                MerchSampleRequest.status.in_(_SAMPLE_PENDING),
            )
        )
        or 0
    )

    sample_overdue_target = int(
        await db.scalar(
            select(func.count())
            .select_from(MerchSampleRequest)
            .where(
                MerchSampleRequest.tenant_id == tenant_id,
                MerchSampleRequest.status.in_(_SAMPLE_PENDING),
                MerchSampleRequest.target_date.isnot(None),
                MerchSampleRequest.target_date < today,
            )
        )
        or 0
    )

    return MerchControlTowerSummaryOut(
        generated_at=_utc_now(),
        inquiries_needing_action=CountAndDate(count=inq_count, oldest_date=oldest_day),
        quotations_at_risk=QuotationsAtRiskOut(
            incomplete_count=incomplete_q,
            anomaly_count=0,
            expiring_soon_count=expiring_q,
        ),
        orders_with_drift=drift_count,
        pending_change_requests=pending_cr,
        bom_status=BomStatusCountsOut(
            draft_count=bom_draft,
            submitted_count=bom_sub,
            approved_count=bom_app,
            frozen_count=bom_fr,
        ),
        tna_overdue=TnaOverdueOut(count=tna_all, critical_count=tna_crit),
        planning_risk=planning,
        sample_pending=sample_pending,
        sample_overdue_target=sample_overdue_target,
    )
