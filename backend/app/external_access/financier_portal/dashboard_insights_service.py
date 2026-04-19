"""Party-scoped dashboard rollups for financier portal (credit monitoring scope)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BtbLc, BtbMaturityTranche, Order
from app.models.facility import Facility, FacilityUtilization, RepaymentScheduleLine
from app.models.production import SewingLineStyleConfig

from app.external_access.financier_portal import facility_selectors as fsel
from app.external_access.financier_portal.schemas import (
    FinancierDashboardNextDue,
    FinancierDashboardPartyInsights,
)


async def _next_emi_for_party(
    db: AsyncSession, tenant_id: int, party_id: int
) -> FinancierDashboardNextDue | None:
    r = await db.execute(
        select(RepaymentScheduleLine, FacilityUtilization.utilization_code, FacilityUtilization.currency)
        .join(FacilityUtilization, FacilityUtilization.id == RepaymentScheduleLine.facility_utilization_id)
        .join(Facility, Facility.id == FacilityUtilization.facility_id)
        .where(
            RepaymentScheduleLine.tenant_id == tenant_id,
            Facility.tenant_id == tenant_id,
            Facility.financier_party_id == party_id,
            RepaymentScheduleLine.status.in_(("upcoming", "due", "overdue", "partially_paid")),
        )
        .order_by(RepaymentScheduleLine.due_date.asc())
        .limit(1)
    )
    row = r.first()
    if not row:
        return None
    ln, ucode, ccy = row[0], row[1], row[2]
    amt = float(ln.emi_amount or 0) if ln.emi_amount is not None else None
    return FinancierDashboardNextDue(
        due_date=ln.due_date,
        amount=amt,
        currency=(ccy or "").strip() or None,
        reference=ucode,
    )


async def _next_btb_tranche_for_party(
    db: AsyncSession, tenant_id: int, party_id: int
) -> FinancierDashboardNextDue | None:
    btb_ids = await fsel.linked_btb_lc_ids_for_party(db, tenant_id, party_id)
    if not btb_ids:
        return None
    r = await db.execute(
        select(BtbMaturityTranche, BtbLc.reference, BtbLc.currency)
        .join(BtbLc, BtbLc.id == BtbMaturityTranche.btb_lc_id)
        .where(
            BtbMaturityTranche.tenant_id == tenant_id,
            BtbMaturityTranche.btb_lc_id.in_(btb_ids),
            BtbMaturityTranche.status.in_(("UPCOMING", "DUE")),
        )
        .order_by(BtbMaturityTranche.maturity_date.asc())
        .limit(1)
    )
    row = r.first()
    if not row:
        return None
    tr, ref, lc_ccy = row[0], row[1], row[2]
    amt = float(tr.amount) if tr.amount is not None else None
    ccy = (tr.currency or lc_ccy or "").strip() or None
    return FinancierDashboardNextDue(
        due_date=tr.maturity_date,
        amount=amt,
        currency=ccy,
        reference=ref,
    )


async def build_financier_dashboard_party_insights(
    db: AsyncSession, tenant_id: int, party_id: int
) -> FinancierDashboardPartyInsights:
    next_emi = await _next_emi_for_party(db, tenant_id, party_id)
    next_btb = await _next_btb_tranche_for_party(db, tenant_id, party_id)

    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    oids = list(order_btbs.keys())
    if not oids:
        return FinancierDashboardPartyInsights(
            next_emi=next_emi,
            next_btb_funding=next_btb,
            financed_orders_open=0,
            sewing_planned_qty=None,
            sewing_completed_qty=None,
            sewing_progress_pct=None,
            note="No financed orders linked to your party yet.",
        )

    open_financed = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Order)
                .where(
                    Order.tenant_id == tenant_id,
                    Order.id.in_(oids),
                    Order.shipped_at.is_(None),
                    Order.status.not_in(("DRAFT", "CANCELLED")),
                )
            )
        ).scalar()
        or 0
    )

    sew = await db.execute(
        select(
            func.coalesce(func.sum(SewingLineStyleConfig.planned_qty), 0),
            func.coalesce(func.sum(SewingLineStyleConfig.completed_qty), 0),
        ).where(SewingLineStyleConfig.tenant_id == tenant_id, SewingLineStyleConfig.order_id.in_(oids))
    )
    planned_f, completed_f = sew.one()
    planned = float(planned_f or 0)
    completed = float(completed_f or 0)
    pct = round(100.0 * completed / planned, 1) if planned > 0 else None

    return FinancierDashboardPartyInsights(
        next_emi=next_emi,
        next_btb_funding=next_btb,
        financed_orders_open=open_financed,
        sewing_planned_qty=planned if planned > 0 else None,
        sewing_completed_qty=completed if planned > 0 else None,
        sewing_progress_pct=pct,
        note=None,
    )
