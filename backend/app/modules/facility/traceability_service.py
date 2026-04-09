"""Funds → goods → shipment → proceeds → repayment (internal + financier DTO builder)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.commercial import BtbLc, MasterContract
from app.models.facility import Facility, FacilityUtilization, RepaymentScheduleLine
from app.models.inventory import GoodsReceiving, PurchaseOrder
from app.models.trade import Shipment, TradeCase


async def build_traceability_for_utilization(
    db: AsyncSession, *, tenant_id: int, utilization_id: int
) -> dict[str, Any]:
    util = await db.get(FacilityUtilization, utilization_id)
    if not util or util.tenant_id != tenant_id:
        return {}
    fac = await db.get(Facility, util.facility_id)
    btb_id = util.linked_btb_lc_id or (fac.linked_btb_lc_id if fac else None)
    btb = await db.get(BtbLc, btb_id) if btb_id else None
    master = None
    if btb and btb.master_contract_id:
        master = await db.get(MasterContract, btb.master_contract_id)
    if btb_id:
        pos = list(
            (
                await db.execute(
                    select(PurchaseOrder).where(
                        PurchaseOrder.tenant_id == tenant_id,
                        PurchaseOrder.btb_lc_id == btb_id,
                    )
                )
            ).scalars().all()
        )
    else:
        pos = []
    grn_counts = 0
    for po in pos:
        n = (
            await db.execute(
                select(GoodsReceiving).where(
                    GoodsReceiving.tenant_id == tenant_id,
                    GoodsReceiving.purchase_order_id == po.id,
                )
            )
        ).scalars().all()
        grn_counts += len(n)
    trade_cases = []
    if btb_id:
        tc_r = await db.execute(
            select(TradeCase).where(TradeCase.tenant_id == tenant_id, TradeCase.btb_lc_id == btb_id)
        )
        trade_cases = list(tc_r.scalars().all())
    shipments: list[Shipment] = []
    for tc in trade_cases:
        sh_r = await db.execute(select(Shipment).where(Shipment.trade_case_id == tc.id))
        shipments.extend(list(sh_r.scalars().all()))
    sched = list(
        (
            await db.execute(
                select(RepaymentScheduleLine)
                .where(RepaymentScheduleLine.facility_utilization_id == utilization_id)
                .order_by(RepaymentScheduleLine.installment_number)
            )
        ).scalars().all()
    )
    paid = sum(float(s.emi_amount or 0) for s in sched if s.status == "paid")
    return {
        "facility": {
            "id": fac.id if fac else None,
            "code": fac.facility_code if fac else None,
            "type": fac.facility_type if fac else None,
            "sanctioned": float(fac.sanctioned_amount or 0) if fac else None,
        },
        "utilization": {
            "id": util.id,
            "code": util.utilization_code,
            "principal": float(util.principal_amount or 0),
            "outstanding_principal": float(util.outstanding_principal or 0),
            "status": util.status,
        },
        "master_contract": (
            {"id": master.id, "reference": master.reference, "amount": float(master.amount or 0)}
            if master
            else None
        ),
        "btb_lc": (
            {
                "id": btb.id,
                "reference": btb.reference,
                "amount": float(btb.amount or 0),
                "status": btb.status,
            }
            if btb
            else None
        ),
        "procurement": {
            "purchase_orders": [{"id": p.id, "po_code": p.po_code, "status": p.status} for p in pos],
            "grn_count": grn_counts,
        },
        "shipments": [{"id": s.id, "status": s.status, "etd": str(s.etd) if s.etd else None} for s in shipments],
        "repayment": {
            "schedule_lines": len(sched),
            "paid_emi_total_approx": paid,
            "next_due": next(
                (str(s.due_date) for s in sched if s.status in ("upcoming", "due", "overdue", "partially_paid")),
                None,
            ),
        },
    }
