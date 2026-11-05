"""Bangladesh VAT (Mushak) data built from P7 records.

- 6.1  purchase register   (vendor bills)
- 6.2  sales register      (commercial invoices; exports are zero-rated)
- 6.10 purchases / sales above BDT 2 lakh in the month
- 9.1  monthly return summary (draft figures from 6.1 / 6.2)
- 6.3  tax invoice data for one commercial invoice

These are prepared figures, not NBR e-filing files. P7 is not NBR-enlisted VAT software;
a VAT consultant should check them before filing.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant
from app.models.commercial import CommercialInvoice, CommercialInvoiceLine
from app.models.customer import Customer
from app.models.finance import VendorBill
from app.models.inventory import Vendor

EXCLUDED_BILL_STATUSES = {"DRAFT", "CANCELLED", "REJECTED", "VOID"}
SALES_INVOICE_STATUSES = {"ISSUED", "POSTED"}
MUSHAK_6_10_THRESHOLD_BDT = Decimal("200000")
VAT_BIN_KEY = "vat_bin"
PREPARED_NOTE = "Prepared from P7 records — not an NBR e-filing file. Check with your VAT consultant before filing."


def to_base(amount: Decimal | None, rate) -> Decimal:
    amt = amount or Decimal("0")
    r = Decimal(str(rate)) if rate not in (None, 0) else Decimal("1")
    return (amt * r).quantize(Decimal("0.01"))


def seller_bin(tenant: Tenant) -> str | None:
    flags = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    v = flags.get(VAT_BIN_KEY)
    return (str(v).strip() or None) if v else None


async def purchase_register(db: AsyncSession, tenant_id: int, start: date, end: date) -> tuple[list[dict], dict]:
    bill_date = func.coalesce(VendorBill.bill_date, VendorBill.vendor_invoice_date)
    rows = (
        await db.execute(
            select(VendorBill, Vendor.name, Vendor.tax_id)
            .join(Vendor, Vendor.id == VendorBill.vendor_id)
            .where(
                VendorBill.tenant_id == tenant_id,
                Vendor.tenant_id == tenant_id,
                bill_date >= start,
                bill_date <= end,
                func.upper(VendorBill.status).notin_(EXCLUDED_BILL_STATUSES),
            )
            .order_by(bill_date, VendorBill.id)
            .limit(5000)
        )
    ).all()
    out = []
    tot_value = tot_vat = Decimal("0")
    for bill, vname, vbin in rows:
        value = to_base(bill.subtotal_amount if bill.subtotal_amount is not None else bill.total_amount, bill.exchange_rate_to_base)
        vat = to_base(bill.tax_amount, bill.exchange_rate_to_base)
        tot_value += value
        tot_vat += vat
        d = bill.bill_date or bill.vendor_invoice_date
        out.append(
            {
                "bill_id": bill.id,
                "date": d.isoformat() if d else None,
                "bill_code": bill.bill_code,
                "supplier_invoice_no": bill.vendor_invoice_ref,
                "supplier_name": vname,
                "supplier_bin": vbin,
                "currency": bill.currency,
                "taxable_value": str(value),
                "vat_amount": str(vat),
                "total": str(value + vat),
                "status": bill.status,
            }
        )
    totals = {"taxable_value": str(tot_value), "vat_amount": str(tot_vat), "total": str(tot_value + tot_vat)}
    return out, totals


async def sales_register(db: AsyncSession, tenant_id: int, start: date, end: date) -> tuple[list[dict], dict]:
    rows = (
        await db.execute(
            select(CommercialInvoice, Customer.name, Customer.tax_id_vat_number)
            .join(Customer, Customer.id == CommercialInvoice.customer_id)
            .where(
                CommercialInvoice.tenant_id == tenant_id,
                Customer.tenant_id == tenant_id,
                CommercialInvoice.invoice_date >= start,
                CommercialInvoice.invoice_date <= end,
                func.upper(CommercialInvoice.status).in_(SALES_INVOICE_STATUSES),
            )
            .order_by(CommercialInvoice.invoice_date, CommercialInvoice.id)
            .limit(5000)
        )
    ).all()
    out = []
    tot_value = Decimal("0")
    for inv, cname, cbin in rows:
        base = inv.base_total_amount if inv.base_total_amount else to_base(inv.total_amount, inv.exchange_rate_to_base)
        base = Decimal(str(base)).quantize(Decimal("0.01"))
        tot_value += base
        out.append(
            {
                "invoice_id": inv.id,
                "date": inv.invoice_date.isoformat() if inv.invoice_date else None,
                "invoice_code": inv.invoice_code,
                "buyer_name": cname,
                "buyer_bin": cbin,
                "currency": inv.currency,
                "fc_value": str(inv.total_amount),
                "taxable_value": str(base),
                "vat_rate_pct": "0",
                "vat_amount": "0.00",
                "total": str(base),
                "supply_type": "Export (zero-rated)",
                "status": inv.status,
            }
        )
    return out, {"taxable_value": str(tot_value), "vat_amount": "0.00", "total": str(tot_value)}


async def mushak_6_10(db: AsyncSession, tenant_id: int, start: date, end: date) -> dict[str, Any]:
    purchases, _ = await purchase_register(db, tenant_id, start, end)
    sales, _ = await sales_register(db, tenant_id, start, end)
    big = lambda rows: [r for r in rows if Decimal(r["total"]) > MUSHAK_6_10_THRESHOLD_BDT]  # noqa: E731
    return {
        "threshold_bdt": str(MUSHAK_6_10_THRESHOLD_BDT),
        "purchases": big(purchases),
        "sales": big(sales),
        "note": f"Invoices above BDT 2,00,000 (Mushak 6.10). {PREPARED_NOTE}",
    }


async def mushak_9_1_summary(db: AsyncSession, tenant: Tenant, start: date, end: date) -> dict[str, Any]:
    purchases, p_tot = await purchase_register(db, tenant.id, start, end)
    sales, s_tot = await sales_register(db, tenant.id, start, end)
    zero_rated = sum((Decimal(r["taxable_value"]) for r in sales if r["vat_amount"] == "0.00"), Decimal("0"))
    standard = sum((Decimal(r["taxable_value"]) for r in sales if r["vat_amount"] != "0.00"), Decimal("0"))
    output_vat = Decimal(s_tot["vat_amount"])
    input_vat = Decimal(p_tot["vat_amount"])
    net = output_vat - input_vat
    lines = [
        {"section": "Supply (sales)", "label": "Zero-rated supply — exports", "value": str(zero_rated), "vat": "0.00"},
        {"section": "Supply (sales)", "label": "Standard-rated supply", "value": str(standard), "vat": str(output_vat)},
        {"section": "Purchases", "label": "Purchases with input VAT", "value": p_tot["taxable_value"], "vat": str(input_vat)},
        {"section": "Result", "label": "Output VAT − input VAT", "value": "", "vat": str(net)},
    ]
    return {
        "return": "9.1",
        "title": "Monthly VAT return — draft summary (Mushak 9.1)",
        "seller_name": tenant.name,
        "seller_bin": seller_bin(tenant),
        "lines": lines,
        "counts": {"sales_invoices": len(sales), "purchase_bills": len(purchases)},
        "net_vat_payable": str(net if net > 0 else Decimal("0.00")),
        "carry_forward_credit": str(-net if net < 0 else Decimal("0.00")),
        "due_by": "15th of the following month",
        "note": PREPARED_NOTE,
    }


async def mushak_6_3(db: AsyncSession, tenant: Tenant, invoice_id: int) -> dict[str, Any] | None:
    row = (
        await db.execute(
            select(CommercialInvoice, Customer)
            .join(Customer, Customer.id == CommercialInvoice.customer_id)
            .where(CommercialInvoice.id == invoice_id, CommercialInvoice.tenant_id == tenant.id, Customer.tenant_id == tenant.id)
        )
    ).first()
    if row is None:
        return None
    inv, cust = row
    lines = (
        await db.execute(
            select(CommercialInvoiceLine)
            .where(CommercialInvoiceLine.commercial_invoice_id == inv.id, CommercialInvoiceLine.tenant_id == tenant.id)
            .order_by(CommercialInvoiceLine.sort_order, CommercialInvoiceLine.id)
        )
    ).scalars().all()
    rate = inv.exchange_rate_to_base
    out_lines = []
    for i, ln in enumerate(lines, start=1):
        value_fc = Decimal(str(ln.line_amount or 0))
        out_lines.append(
            {
                "sl": i,
                "description": ln.description or f"Item #{ln.item_id or ''}".strip(),
                "quantity": str(ln.quantity),
                "unit_price": str(ln.unit_price),
                "value_fc": str(value_fc),
                "value_bdt": str(to_base(value_fc, rate)),
                "sd_amount": "0.00",
                "vat_rate_pct": "0",
                "vat_amount": "0.00",
                "total_bdt": str(to_base(value_fc, rate)),
            }
        )
    total_bdt = Decimal(str(inv.base_total_amount)) if inv.base_total_amount else to_base(inv.total_amount, rate)
    address = cust.address or ", ".join(x for x in [getattr(cust, "billing_address_line1", None)] if x) or None
    return {
        "form": "6.3",
        "title": "Tax invoice (Mushak 6.3)",
        "seller": {"name": tenant.name, "bin": seller_bin(tenant), "address": getattr(tenant, "address", None)},
        "buyer": {"name": cust.name, "bin": cust.tax_id_vat_number, "address": address},
        "invoice_code": inv.invoice_code,
        "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
        "issued_at": inv.created_at.isoformat() if inv.created_at else None,
        "currency": inv.currency,
        "exchange_rate_to_base": str(rate) if rate is not None else None,
        "supply_type": "Export (zero-rated)",
        "lines": out_lines,
        "totals": {"value_bdt": str(Decimal(total_bdt).quantize(Decimal("0.01"))), "sd": "0.00", "vat": "0.00",
                   "total_bdt": str(Decimal(total_bdt).quantize(Decimal("0.01")))},
        "status": inv.status,
        "note": PREPARED_NOTE,
    }
