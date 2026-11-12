"""Sprint 3: GSTR1 / GSTR2 / GSTR3B / ITC summaries from voucher_tax_lines."""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import Voucher
from app.models.gst_tax import TaxLedger, VoucherTaxLine
from app.modules.finance.tax_calculation_service import _d, _money, _rate

logger = logging.getLogger(__name__)

# Tax types whose line carries the invoice's taxable value (SGST / UTGST repeat the CGST base).
_BASE_COUNTING_TAX_TYPES = frozenset({"CGST", "IGST", "VAT", "CST"})

async def _tax_rows_in_period(
    db: AsyncSession,
    tenant_id: int,
    period_from: date,
    period_to: date,
    *,
    direction: str | None = None,
) -> list[tuple[VoucherTaxLine, Voucher, TaxLedger]]:
    """Tax lines of POSTED, non-reversal vouchers in the period.

    Returns read ``voucher_tax_lines``, which POST /vouchers/{id}/reverse does NOT copy to the reversal voucher.
    So a reversed pair is left out on both sides (net zero): the original is REVERSED (excluded by status) and the
    reversal voucher (``reverses_voucher_id`` set) is excluded explicitly. Counting the original with
    ``voucher_counts_in_books_status_clause()`` here would report tax that the reversal cancelled in the GL.
    """
    q = (
        select(VoucherTaxLine, Voucher, TaxLedger)
        .join(Voucher, Voucher.id == VoucherTaxLine.voucher_id)
        .join(TaxLedger, TaxLedger.id == VoucherTaxLine.tax_ledger_id)
        .where(
            VoucherTaxLine.tenant_id == tenant_id,
            Voucher.tenant_id == tenant_id,
            Voucher.voucher_date >= period_from,
            Voucher.voucher_date <= period_to,
            Voucher.status == "POSTED",
            Voucher.reverses_voucher_id.is_(None),
        )
        .order_by(Voucher.voucher_date, Voucher.id, VoucherTaxLine.id)
    )
    if direction:
        q = q.where(VoucherTaxLine.direction == direction)
    return list((await db.execute(q)).all())


def _row_dict(vtl: VoucherTaxLine, voucher: Voucher, ledger: TaxLedger) -> dict[str, Any]:
    return {
        "voucher_id": voucher.id,
        "voucher_number": voucher.voucher_number,
        "voucher_date": voucher.voucher_date.isoformat() if voucher.voucher_date else None,
        "voucher_type": voucher.voucher_type,
        "tax_type": ledger.tax_type,
        "tax_rate": str(_rate(_d(ledger.tax_rate))),
        "taxable_amount": str(_money(_d(vtl.taxable_amount))),
        "tax_amount": str(_money(_d(vtl.tax_amount))),
        "hsn_code": vtl.hsn_code,
        "is_itc_eligible": vtl.is_itc_eligible,
        "direction": vtl.direction,
    }


async def generate_gstr1(
    db: AsyncSession,
    tenant_id: int,
    period_from: date,
    period_to: date,
) -> dict[str, Any]:
    rows = await _tax_rows_in_period(db, tenant_id, period_from, period_to, direction="OUTWARD")
    supplies = [_row_dict(vtl, v, tl) for vtl, v, tl in rows]
    # CGST and SGST/UTGST lines repeat the same taxable base, so the base is counted only on the
    # CGST line; IGST / VAT / CST lines carry their own base (an IGST sale must not be halved).
    taxable = sum(
        (_d(r["taxable_amount"]) for r in supplies if r["tax_type"] in _BASE_COUNTING_TAX_TYPES), Decimal("0")
    )
    tax = sum((_d(r["tax_amount"]) for r in supplies), Decimal("0"))
    by_hsn: dict[str, dict[str, Decimal]] = {}
    for r in supplies:
        key = r["hsn_code"] or "UNKNOWN"
        bucket = by_hsn.setdefault(key, {"taxable": Decimal("0"), "tax": Decimal("0")})
        if r["tax_type"] in _BASE_COUNTING_TAX_TYPES:
            bucket["taxable"] += _d(r["taxable_amount"])
        bucket["tax"] += _d(r["tax_amount"])
    missing_hsn = sum(1 for r in supplies if not r["hsn_code"])
    return {
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "direction": "OUTWARD",
        "supplies": supplies,
        "summary": {
            "line_count": len(supplies),
            "taxable_total": str(_money(taxable)),
            "tax_total": str(_money(tax)),
            "missing_hsn_count": missing_hsn,
        },
        "hsn_summary": [
            {"hsn_code": k, "taxable_amount": str(_money(v["taxable"])), "tax_amount": str(_money(v["tax"]))}
            for k, v in sorted(by_hsn.items())
        ],
        "validations": (
            ["Some outward lines are missing HSN codes"] if missing_hsn else []
        ),
    }


async def generate_gstr2(
    db: AsyncSession,
    tenant_id: int,
    period_from: date,
    period_to: date,
) -> dict[str, Any]:
    rows = await _tax_rows_in_period(db, tenant_id, period_from, period_to, direction="INWARD")
    supplies = [_row_dict(vtl, v, tl) for vtl, v, tl in rows]
    tax = sum((_d(r["tax_amount"]) for r in supplies), Decimal("0"))
    itc = sum((_d(r["tax_amount"]) for r in supplies if r["is_itc_eligible"]), Decimal("0"))
    missing_hsn = sum(1 for r in supplies if not r["hsn_code"])
    return {
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "direction": "INWARD",
        "supplies": supplies,
        "summary": {
            "line_count": len(supplies),
            "tax_total": str(_money(tax)),
            "itc_eligible_total": str(_money(itc)),
            "missing_hsn_count": missing_hsn,
        },
        "validations": (
            ["Some inward lines are missing HSN codes"] if missing_hsn else []
        ),
    }


async def generate_gstr3b(
    db: AsyncSession,
    tenant_id: int,
    period_from: date,
    period_to: date,
) -> dict[str, Any]:
    outward = await generate_gstr1(db, tenant_id, period_from, period_to)
    inward = await generate_gstr2(db, tenant_id, period_from, period_to)
    out_tax = _d(outward["summary"]["tax_total"])
    in_itc = _d(inward["summary"]["itc_eligible_total"])
    return {
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "outward_tax": str(_money(out_tax)),
        "inward_itc": str(_money(in_itc)),
        "net_tax_payable": str(_money(out_tax - in_itc)),
        "outward_line_count": outward["summary"]["line_count"],
        "inward_line_count": inward["summary"]["line_count"],
        "gstr1_summary": outward["summary"],
        "gstr2_summary": inward["summary"],
        "validations": outward.get("validations", []) + inward.get("validations", []),
    }


async def itc_summary(
    db: AsyncSession,
    tenant_id: int,
    period_from: date,
    period_to: date,
) -> dict[str, Any]:
    rows = await _tax_rows_in_period(db, tenant_id, period_from, period_to, direction="INWARD")
    by_type: dict[str, Decimal] = {}
    eligible = Decimal("0")
    ineligible = Decimal("0")
    details = []
    for vtl, voucher, ledger in rows:
        amt = _d(vtl.tax_amount)
        by_type[ledger.tax_type] = by_type.get(ledger.tax_type, Decimal("0")) + amt
        if vtl.is_itc_eligible:
            eligible += amt
        else:
            ineligible += amt
        details.append(_row_dict(vtl, voucher, ledger))
    return {
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "eligible_total": str(_money(eligible)),
        "ineligible_total": str(_money(ineligible)),
        "by_tax_type": {k: str(_money(v)) for k, v in sorted(by_type.items())},
        "lines": details,
    }


async def export_gstr1_portal_json(
    db: AsyncSession,
    tenant_id: int,
    period_from: date,
    period_to: date,
    *,
    gstin: str | None = None,
) -> dict[str, Any]:
    """Minimal JSON shape suitable for GST portal B2B-style upload tooling."""
    data = await generate_gstr1(db, tenant_id, period_from, period_to)
    b2b: list[dict[str, Any]] = []
    # Group by voucher
    by_v: dict[int, list[dict[str, Any]]] = {}
    for s in data["supplies"]:
        by_v.setdefault(int(s["voucher_id"]), []).append(s)
    for vid, lines in by_v.items():
        first = lines[0]
        inv_taxable = Decimal("0")
        seen_bases: set[str] = set()
        itms = []
        for i, ln in enumerate(lines, start=1):
            base_key = f"{ln['taxable_amount']}:{ln['hsn_code']}"
            if base_key not in seen_bases and ln["tax_type"] in _BASE_COUNTING_TAX_TYPES:
                inv_taxable += _d(ln["taxable_amount"])
                seen_bases.add(base_key)
            itms.append(
                {
                    "num": i,
                    "itm_det": {
                        "txval": float(_d(ln["taxable_amount"])),
                        "rt": float(_d(ln["tax_rate"])),
                        ln["tax_type"].lower(): float(_d(ln["tax_amount"])),
                        "hsn_sc": ln["hsn_code"] or "",
                    },
                }
            )
        b2b.append(
            {
                "inum": first["voucher_number"],
                "idt": first["voucher_date"],
                "val": float(_money(inv_taxable + sum((_d(x["tax_amount"]) for x in lines), Decimal("0")))),
                "itms": itms,
            }
        )
    return {
        "gstin": gstin or "",
        "fp": f"{period_from.month:02d}{period_from.year}",
        "gt": 0,
        "cur_gt": 0,
        "b2b": [{"inv": b2b}] if b2b else [],
        "meta": {
            "source": "p7erp",
            "period_from": period_from.isoformat(),
            "period_to": period_to.isoformat(),
            "validations": data.get("validations", []),
        },
    }


async def monthly_gst_reconciliation(
    db: AsyncSession,
    tenant_id: int,
    period_from: date,
    period_to: date,
) -> dict[str, Any]:
    """Compare outward vs inward tax totals and flag missing HSN / gaps.

    Portal GSTR-2A import is not wired yet — flags local data quality issues.
    """
    gstr1 = await generate_gstr1(db, tenant_id, period_from, period_to)
    gstr2 = await generate_gstr2(db, tenant_id, period_from, period_to)
    flags: list[str] = []
    flags.extend(gstr1.get("validations") or [])
    flags.extend(gstr2.get("validations") or [])
    if int(gstr1["summary"]["line_count"]) == 0 and int(gstr2["summary"]["line_count"]) == 0:
        flags.append("No posted GST tax lines in period")
    # Mismatch placeholder: when 2A import exists, compare invoice sets
    return {
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "outward_tax": gstr1["summary"]["tax_total"],
        "inward_tax": gstr2["summary"]["tax_total"],
        "flags": flags,
        "mismatch_count": len(flags),
    }
