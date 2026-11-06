"""LC performance (Akij-style LC dashboard): for each master export LC / sales contract —

    LC value  -> shipped (commercial invoices on its orders) -> realised (posted receipts)
    plus BTB LCs opened against it, days to expiry and a simple risk flag.

Amounts are in each LC's own currency (invoices on an LC's orders are assumed to be in that currency).
Read-only and tenant-scoped.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.models.commercial import (
    BtbLc,
    CommercialInvoice,
    CommercialInvoiceLine,
    CommercialInvoiceReceiptAllocation,
    MasterContract,
)
from app.models.merch import Order

INACTIVE_INVOICE = ("DRAFT", "CANCELLED", "VOID")
INACTIVE_LC = ("CANCELLED",)
EXPIRY_WARNING_DAYS = 30


def _d(v: Any) -> Decimal:
    if v is None:
        return Decimal("0")
    return v if isinstance(v, Decimal) else Decimal(str(v))


def _pct(part: Decimal, whole: Decimal) -> float | None:
    return round(float(part / whole * 100), 1) if whole > 0 else None


async def lc_performance(db: AsyncSession, tenant_id: int, *, today: date | None = None, limit: int = 200) -> dict[str, Any]:
    today = today or today_local()
    mcs = list(
        (
            await db.execute(
                select(MasterContract)
                .where(MasterContract.tenant_id == tenant_id, func.upper(MasterContract.status).notin_(INACTIVE_LC))
                .order_by(MasterContract.expiry_date.asc().nulls_last(), MasterContract.id)
                .limit(limit)
            )
        ).scalars()
    )
    if not mcs:
        return {"as_of": today.isoformat(), "rows": [], "totals_by_currency": []}
    mc_ids = [m.id for m in mcs]

    order_to_mc = {
        oid: mcid
        for oid, mcid in (
            await db.execute(select(Order.id, Order.master_contract_id).where(Order.tenant_id == tenant_id, Order.master_contract_id.in_(mc_ids)))
        ).all()
    }

    shipped: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    invoices_per_mc: dict[int, set[int]] = defaultdict(set)
    invoice_total: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    invoice_mc_share: dict[tuple[int, int], Decimal] = defaultdict(lambda: Decimal("0"))
    last_ship: dict[int, date] = {}
    if order_to_mc:
        line_rows = (
            await db.execute(
                select(CommercialInvoiceLine.commercial_invoice_id, CommercialInvoiceLine.order_id,
                       CommercialInvoiceLine.line_amount, CommercialInvoice.invoice_date)
                .join(CommercialInvoice, CommercialInvoice.id == CommercialInvoiceLine.commercial_invoice_id)
                .where(
                    CommercialInvoice.tenant_id == tenant_id,
                    CommercialInvoiceLine.tenant_id == tenant_id,
                    func.upper(CommercialInvoice.status).notin_(INACTIVE_INVOICE),
                    CommercialInvoiceLine.order_id.in_(list(order_to_mc)),
                )
            )
        ).all()
        inv_ids = {r[0] for r in line_rows}
        # Full invoice totals (an invoice can mix orders from several LCs).
        if inv_ids:
            for inv_id, total in (
                await db.execute(
                    select(CommercialInvoiceLine.commercial_invoice_id, func.coalesce(func.sum(CommercialInvoiceLine.line_amount), 0))
                    .where(CommercialInvoiceLine.commercial_invoice_id.in_(inv_ids))
                    .group_by(CommercialInvoiceLine.commercial_invoice_id)
                )
            ).all():
                invoice_total[inv_id] = _d(total)
        for inv_id, order_id, amount, inv_date in line_rows:
            mcid = order_to_mc[order_id]
            shipped[mcid] += _d(amount)
            invoices_per_mc[mcid].add(inv_id)
            invoice_mc_share[(inv_id, mcid)] += _d(amount)
            if inv_date and (mcid not in last_ship or inv_date > last_ship[mcid]):
                last_ship[mcid] = inv_date

    realised: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    pending: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    all_invs = {i for s in invoices_per_mc.values() for i in s}
    if all_invs:
        alloc_rows = (
            await db.execute(
                select(CommercialInvoiceReceiptAllocation.commercial_invoice_id, CommercialInvoiceReceiptAllocation.status,
                       func.coalesce(func.sum(CommercialInvoiceReceiptAllocation.allocated_amount), 0))
                .where(
                    CommercialInvoiceReceiptAllocation.tenant_id == tenant_id,
                    CommercialInvoiceReceiptAllocation.commercial_invoice_id.in_(all_invs),
                    func.upper(CommercialInvoiceReceiptAllocation.status).in_(("POSTED", "PENDING")),
                )
                .group_by(CommercialInvoiceReceiptAllocation.commercial_invoice_id, CommercialInvoiceReceiptAllocation.status)
            )
        ).all()
        for inv_id, status, amount in alloc_rows:
            total = invoice_total.get(inv_id) or Decimal("0")
            for mcid, invs in invoices_per_mc.items():
                if inv_id not in invs or total <= 0:
                    continue
                share = invoice_mc_share[(inv_id, mcid)] / total
                target = realised if (status or "").upper() == "POSTED" else pending
                target[mcid] += _d(amount) * share

    btb: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    btb_count: dict[int, int] = defaultdict(int)
    for mcid, amount, n in (
        await db.execute(
            select(BtbLc.master_contract_id, func.coalesce(func.sum(BtbLc.amount), 0), func.count(BtbLc.id))
            .where(BtbLc.tenant_id == tenant_id, BtbLc.master_contract_id.in_(mc_ids), func.upper(BtbLc.status).notin_(INACTIVE_LC))
            .group_by(BtbLc.master_contract_id)
        )
    ).all():
        btb[mcid] = _d(amount)
        btb_count[mcid] = int(n)

    rows: list[dict[str, Any]] = []
    totals: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: Decimal("0")))
    q = Decimal("0.01")
    for mc in mcs:
        value = _d(mc.amount)
        sh, re, pe, bt = shipped[mc.id], realised[mc.id], pending[mc.id], btb[mc.id]
        unshipped = max(value - sh, Decimal("0"))
        outstanding = max(sh - re, Decimal("0"))
        days_left = (mc.expiry_date - today).days if mc.expiry_date else None
        flags: list[str] = []
        if days_left is not None and days_left < 0 and unshipped > 0:
            flags.append("EXPIRED_UNSHIPPED")
        elif days_left is not None and days_left <= EXPIRY_WARNING_DAYS and unshipped > 0:
            flags.append("EXPIRING_UNSHIPPED")
        if value > 0 and sh > value:
            flags.append("OVER_SHIPPED")
        if value > 0 and bt / value > Decimal("0.75"):
            flags.append("BTB_ABOVE_75PCT")
        cur = (mc.currency or "USD").upper()
        for k, v in (("lc_value", value), ("shipped", sh), ("realised", re), ("outstanding", outstanding), ("unshipped", unshipped), ("btb_opened", bt)):
            totals[cur][k] += v
        rows.append(
            {
                "master_contract_id": mc.id,
                "reference": mc.reference,
                "lc_number": mc.lc_number,
                "contract_type": mc.contract_type,
                "status": mc.status,
                "buyer_name": mc.buyer_name,
                "currency": cur,
                "lc_value": str(value.quantize(q)),
                "shipped": str(sh.quantize(q)),
                "shipped_pct": _pct(sh, value),
                "realised": str(re.quantize(q)),
                "realised_pct_of_shipped": _pct(re, sh),
                "realisation_pending": str(pe.quantize(q)),
                "outstanding": str(outstanding.quantize(q)),
                "unshipped": str(unshipped.quantize(q)),
                "btb_opened": str(bt.quantize(q)),
                "btb_count": btb_count[mc.id],
                "btb_pct_of_lc": _pct(bt, value),
                "expiry_date": mc.expiry_date.isoformat() if mc.expiry_date else None,
                "days_to_expiry": days_left,
                "last_shipment_date": last_ship[mc.id].isoformat() if mc.id in last_ship else None,
                "invoice_count": len(invoices_per_mc[mc.id]),
                "flags": flags,
            }
        )
    return {
        "as_of": today.isoformat(),
        "rows": rows,
        "totals_by_currency": [
            {"currency": cur, **{k: str(v.quantize(q)) for k, v in t.items()}} for cur, t in sorted(totals.items())
        ],
    }
