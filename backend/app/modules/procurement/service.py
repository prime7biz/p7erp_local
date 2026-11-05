"""Comparative Statement (CS) builder.

A CS puts every supplier quotation for one requisition side by side:
rows = requisition lines, columns = quotations, cell = unit price and line amount.
The lowest *complete* quotation (prices every line) is highlighted; the buyer may pick
another one but must record why (Akij / Bangladesh audit practice).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.costing import Item
from app.models.inventory import Vendor
from app.models.procurement import (
    PurchaseRequisition,
    PurchaseRequisitionLine,
    SupplierQuotation,
    SupplierQuotationLine,
)


def _f(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


async def load_lines(db: AsyncSession, tenant_id: int, requisition_id: int) -> list[PurchaseRequisitionLine]:
    return list(
        (
            await db.execute(
                select(PurchaseRequisitionLine)
                .where(
                    PurchaseRequisitionLine.tenant_id == tenant_id,
                    PurchaseRequisitionLine.requisition_id == requisition_id,
                )
                .order_by(PurchaseRequisitionLine.id)
            )
        ).scalars()
    )


async def load_quotations(db: AsyncSession, tenant_id: int, requisition_id: int) -> list[SupplierQuotation]:
    return list(
        (
            await db.execute(
                select(SupplierQuotation)
                .where(SupplierQuotation.tenant_id == tenant_id, SupplierQuotation.requisition_id == requisition_id)
                .order_by(SupplierQuotation.id)
            )
        ).scalars()
    )


async def quote_prices(db: AsyncSession, quotation_ids: list[int]) -> dict[int, dict[int, float]]:
    """{quotation_id: {requisition_line_id: unit_price}}"""
    out: dict[int, dict[int, float]] = {qid: {} for qid in quotation_ids}
    if not quotation_ids:
        return out
    for ql in (
        await db.execute(select(SupplierQuotationLine).where(SupplierQuotationLine.quotation_id.in_(quotation_ids)))
    ).scalars():
        out[ql.quotation_id][ql.requisition_line_id] = _f(ql.unit_price)
    return out


async def build_comparative_statement(db: AsyncSession, tenant_id: int, pr: PurchaseRequisition) -> dict[str, Any]:
    lines = await load_lines(db, tenant_id, pr.id)
    quotes = await load_quotations(db, tenant_id, pr.id)
    prices = await quote_prices(db, [q.id for q in quotes])

    item_ids = {ln.item_id for ln in lines}
    items = {
        i.id: i
        for i in (await db.execute(select(Item).where(Item.tenant_id == tenant_id, Item.id.in_(item_ids)))).scalars()
    } if item_ids else {}
    vendor_ids = {q.vendor_id for q in quotes}
    vendors = {
        v.id: v
        for v in (await db.execute(select(Vendor).where(Vendor.tenant_id == tenant_id, Vendor.id.in_(vendor_ids)))).scalars()
    } if vendor_ids else {}

    line_ids = [ln.id for ln in lines]
    columns: list[dict[str, Any]] = []
    for q in quotes:
        qp = prices.get(q.id, {})
        complete = all(lid in qp for lid in line_ids) and bool(line_ids)
        total = round(sum(qp.get(ln.id, 0.0) * _f(ln.quantity) for ln in lines), 2)
        v = vendors.get(q.vendor_id)
        columns.append(
            {
                "quotation_id": q.id,
                "vendor_id": q.vendor_id,
                "vendor_name": v.name if v else f"Vendor #{q.vendor_id}",
                "vendor_code": v.vendor_code if v else None,
                "quote_ref": q.quote_ref,
                "quote_date": q.quote_date.isoformat() if q.quote_date else None,
                "valid_until": q.valid_until.isoformat() if q.valid_until else None,
                "currency": q.currency,
                "delivery_days": q.delivery_days,
                "payment_terms": q.payment_terms,
                "notes": q.notes,
                "total": total,
                "lines_quoted": sum(1 for lid in line_ids if lid in qp),
                "is_complete": complete,
            }
        )

    complete_cols = [c for c in columns if c["is_complete"]]
    currencies = {(c["currency"] or "").upper() for c in columns}
    lowest_id = min(complete_cols, key=lambda c: c["total"])["quotation_id"] if complete_cols else None
    for rank, c in enumerate(sorted(complete_cols, key=lambda c: c["total"]), start=1):
        c["rank"] = rank
    for c in columns:
        c.setdefault("rank", None)

    rows: list[dict[str, Any]] = []
    for ln in lines:
        quoted = [(q.id, prices[q.id][ln.id]) for q in quotes if ln.id in prices.get(q.id, {})]
        best = min((p for _qid, p in quoted), default=None)
        it = items.get(ln.item_id)
        rows.append(
            {
                "line_id": ln.id,
                "item_id": ln.item_id,
                "item_code": it.item_code if it else None,
                "item_name": it.name if it else f"Item #{ln.item_id}",
                "quantity": _f(ln.quantity),
                "estimated_unit_price": _f(ln.estimated_unit_price) if ln.estimated_unit_price is not None else None,
                "prices": [
                    {
                        "quotation_id": qid,
                        "unit_price": p,
                        "amount": round(p * _f(ln.quantity), 2),
                        "is_lowest": best is not None and p == best,
                    }
                    for qid, p in quoted
                ],
            }
        )

    return {
        "requisition_id": pr.id,
        "pr_code": pr.pr_code,
        "status": pr.status,
        "rows": rows,
        "quotations": columns,
        "lowest_quotation_id": lowest_id,
        "selected_quotation_id": pr.selected_quotation_id,
        "selection_reason": pr.selection_reason,
        "mixed_currency": len(currencies) > 1,
    }
