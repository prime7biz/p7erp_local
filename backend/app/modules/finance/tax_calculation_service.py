"""Sprint 3: GST tax calculation for vouchers."""

from __future__ import annotations

import logging
import re
from decimal import Decimal
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import (
    get_gst_settings,
    is_auto_tax_calculation,
    is_gst_system_enabled,
)
from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.models.gst_tax import TaxLedger, VoucherTaxLine

logger = logging.getLogger(__name__)

ZERO = Decimal("0")
GST_LINE_MARKER = "[GST]"
SupplyDirection = Literal["OUTWARD", "INWARD"]
SupplyKind = Literal["INTRA", "INTER", "UT"]


def _d(v: Any) -> Decimal:
    if v is None:
        return ZERO
    try:
        return Decimal(str(v))
    except Exception:
        return ZERO


def _money(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.0001"))


def _rate(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"))


def determine_supply_kind(
    company_state: str | None,
    place_of_supply_state: str | None,
    *,
    is_union_territory: bool = False,
) -> SupplyKind:
    if is_union_territory:
        return "UT"
    c = (company_state or "").strip().upper()
    p = (place_of_supply_state or "").strip().upper()
    if c and p and c == p:
        return "INTRA"
    if c and p and c != p:
        return "INTER"
    # Default intra when states unknown (safer for domestic journals)
    return "INTRA"


def parse_line_tax_meta(notes: str | None) -> dict[str, Any]:
    """Parse optional HSN:xxxx GST_RATE:18 from voucher line notes."""
    text = notes or ""
    hsn = None
    rate = None
    m_hsn = re.search(r"HSN[:\s=]*([A-Za-z0-9]+)", text, re.I)
    if m_hsn:
        hsn = m_hsn.group(1)
    m_rate = re.search(r"GST_RATE[:\s=]*([0-9]+(?:\.[0-9]+)?)", text, re.I)
    if m_rate:
        rate = _d(m_rate.group(1))
    return {"hsn_code": hsn, "gst_rate": rate}


def split_components(total_rate: Decimal, supply_kind: SupplyKind) -> list[tuple[str, Decimal]]:
    """Return list of (tax_type, rate) components for a total GST slab."""
    total_rate = _rate(total_rate)
    if total_rate <= 0:
        return []
    if supply_kind == "INTER":
        return [("IGST", total_rate)]
    if supply_kind == "UT":
        half = _rate(total_rate / 2)
        other = _rate(total_rate - half)
        return [("CGST", half), ("UTGST", other)]
    half = _rate(total_rate / 2)
    other = _rate(total_rate - half)
    return [("CGST", half), ("SGST", other)]


async def _find_tax_ledger(
    db: AsyncSession,
    tenant_id: int,
    tax_type: str,
    tax_rate: Decimal,
    gst_type: str = "GOODS",
) -> TaxLedger | None:
    return (
        await db.execute(
            select(TaxLedger).where(
                TaxLedger.tenant_id == tenant_id,
                TaxLedger.tax_type == tax_type,
                TaxLedger.tax_rate == tax_rate,
                TaxLedger.gst_type == gst_type,
                TaxLedger.is_active.is_(True),
            )
        )
    ).scalars().first()


def tax_ledger_out(row: TaxLedger) -> dict[str, Any]:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "chart_account_id": row.chart_account_id,
        "tax_type": row.tax_type,
        "tax_rate": str(_rate(_d(row.tax_rate))),
        "gst_type": row.gst_type,
        "nature_of_transaction": row.nature_of_transaction,
        "is_active": row.is_active,
        "effective_from": row.effective_from.isoformat() if row.effective_from else None,
        "effective_to": row.effective_to.isoformat() if row.effective_to else None,
    }


def voucher_tax_line_out(row: VoucherTaxLine, ledger: TaxLedger | None = None) -> dict[str, Any]:
    return {
        "id": row.id,
        "voucher_id": row.voucher_id,
        "voucher_line_id": row.voucher_line_id,
        "tax_ledger_id": row.tax_ledger_id,
        "taxable_amount": str(_money(_d(row.taxable_amount))),
        "tax_amount": str(_money(_d(row.tax_amount))),
        "tax_rate_applied": str(_rate(_d(row.tax_rate_applied))),
        "hsn_code": row.hsn_code,
        "is_itc_eligible": row.is_itc_eligible,
        "direction": row.direction,
        "tax_type": ledger.tax_type if ledger else None,
    }


async def calculate_tax_preview(
    db: AsyncSession,
    tenant_id: int,
    *,
    taxable_lines: list[dict[str, Any]],
    company_state: str | None,
    place_of_supply_state: str | None,
    direction: SupplyDirection = "OUTWARD",
    is_union_territory: bool = False,
    gst_type: str = "GOODS",
    feature_flags: Any = None,
) -> dict[str, Any]:
    """Pure calculation — does not mutate voucher."""
    if not is_gst_system_enabled(feature_flags):
        raise HTTPException(status_code=404, detail="GST system is disabled")

    supply_kind = determine_supply_kind(
        company_state, place_of_supply_state, is_union_territory=is_union_territory
    )
    proposed: list[dict[str, Any]] = []
    total_taxable = ZERO
    total_tax = ZERO
    missing_ledgers: list[str] = []

    for src in taxable_lines:
        taxable = _money(_d(src.get("taxable_amount") or src.get("amount")))
        if taxable <= 0:
            continue
        rate = _rate(_d(src.get("gst_rate") or src.get("tax_rate") or 0))
        hsn = (src.get("hsn_code") or None) and str(src.get("hsn_code")).strip()
        overrides = src.get("component_overrides")  # optional [{tax_type, tax_rate}]
        components = (
            [(c["tax_type"], _rate(_d(c["tax_rate"]))) for c in overrides]
            if overrides
            else split_components(rate, supply_kind)
        )
        total_taxable += taxable
        for tax_type, comp_rate in components:
            tax_amt = _money(taxable * comp_rate / Decimal("100"))
            ledger = await _find_tax_ledger(db, tenant_id, tax_type, comp_rate, gst_type=gst_type)
            if not ledger:
                missing_ledgers.append(f"{tax_type}@{comp_rate}")
            proposed.append(
                {
                    "tax_type": tax_type,
                    "tax_rate": str(comp_rate),
                    "taxable_amount": str(taxable),
                    "tax_amount": str(tax_amt),
                    "hsn_code": hsn,
                    "tax_ledger_id": ledger.id if ledger else None,
                    "chart_account_id": ledger.chart_account_id if ledger else None,
                    "direction": direction,
                    "is_itc_eligible": direction == "INWARD",
                    "source_voucher_line_id": src.get("voucher_line_id"),
                }
            )
            total_tax += tax_amt

    return {
        "supply_kind": supply_kind,
        "direction": direction,
        "company_state": company_state,
        "place_of_supply_state": place_of_supply_state,
        "taxable_total": str(_money(total_taxable)),
        "tax_total": str(_money(total_tax)),
        "grand_total": str(_money(total_taxable + total_tax)),
        "lines": proposed,
        "missing_tax_ledgers": missing_ledgers,
        "warnings": (
            [f"Missing tax ledger masters: {', '.join(sorted(set(missing_ledgers)))}"]
            if missing_ledgers
            else []
        ),
    }


SALES_VOUCHER_TYPES = frozenset({"SALES", "SALE", "SALES_INVOICE", "SI", "SV"})
PURCHASE_VOUCHER_TYPES = frozenset({"PURCHASE", "PURCHASE_INVOICE", "PJ", "PI", "PV"})
SALES_SOURCE_MODULES = frozenset({"COMMERCIAL", "SALES", "AR"})
PURCHASE_SOURCE_MODULES = frozenset({"INVENTORY", "VENDOR_BILL", "PURCHASE"})


def voucher_trade_direction(voucher: Voucher) -> SupplyDirection | None:
    """OUTWARD for sales vouchers, INWARD for purchase vouchers, None for everything else."""
    vtype = (voucher.voucher_type or "").strip().upper()
    src_mod = (voucher.source_module or "").strip().upper()
    if vtype in SALES_VOUCHER_TYPES or src_mod in SALES_SOURCE_MODULES:
        return "OUTWARD"
    if vtype in PURCHASE_VOUCHER_TYPES or src_mod in PURCHASE_SOURCE_MODULES:
        return "INWARD"
    return None


async def _cash_or_bank_account_ids(db: AsyncSession, tenant_id: int, account_ids: set[int]) -> set[int]:
    from app.models.finance import AccountGroup
    from app.modules.finance.voucher_controls import _is_cash_or_bank

    if not account_ids:
        return set()
    rows = (
        await db.execute(
            select(ChartOfAccount, AccountGroup)
            .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
            .where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_(account_ids))
        )
    ).all()
    return {acct.id for acct, grp in rows if _is_cash_or_bank(acct, grp)}


async def _infer_taxable_from_voucher(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    lines: list[VoucherLine],
    *,
    direction: SupplyDirection,
    default_rate: Decimal,
) -> list[dict[str, Any]]:
    """Pick the lines GST applies to.

    Lines tagged ``HSN:`` / ``GST_RATE:`` are always taxable. Untagged lines are only inferred
    on sales/purchase vouchers (income side for sales, expense side for purchases). Cash and
    bank lines are never taxable.
    """
    infer_untagged = voucher_trade_direction(voucher) is not None
    cash_bank_ids = await _cash_or_bank_account_ids(db, tenant_id, {ln.account_id for ln in lines})
    taxable: list[dict[str, Any]] = []
    for ln in lines:
        notes = ln.notes or ""
        if notes.startswith(GST_LINE_MARKER):
            continue
        if ln.account_id in cash_bank_ids:
            continue
        meta = parse_line_tax_meta(notes)
        tagged = meta["gst_rate"] is not None or bool(meta["hsn_code"])
        if not tagged:
            if not infer_untagged:
                continue
            # Income (CREDIT) for outward, expense (DEBIT) for inward
            if direction == "OUTWARD" and ln.entry_type != "CREDIT":
                continue
            if direction == "INWARD" and ln.entry_type != "DEBIT":
                continue
        rate = meta["gst_rate"] if meta["gst_rate"] is not None else default_rate
        if rate <= 0 and not meta["hsn_code"]:
            continue
        if rate <= 0:
            rate = default_rate
        taxable.append(
            {
                "voucher_line_id": ln.id,
                "taxable_amount": _d(ln.amount),
                "gst_rate": rate,
                "hsn_code": meta["hsn_code"],
            }
        )
    return taxable


async def calculate_tax_on_voucher(
    db: AsyncSession,
    tenant_id: int,
    voucher_id: int,
    *,
    feature_flags: Any = None,
    place_of_supply_state: str | None = None,
    direction: SupplyDirection | None = None,
    apply: bool = False,
    taxable_lines_override: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if not is_gst_system_enabled(feature_flags):
        raise HTTPException(status_code=404, detail="GST system is disabled")

    voucher = await db.get(Voucher, voucher_id)
    if not voucher or voucher.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Voucher not found")

    settings = get_gst_settings(feature_flags)
    company_state = settings.get("state_code") or settings.get("state")
    pos = place_of_supply_state or settings.get("default_place_of_supply") or company_state
    is_ut = bool(settings.get("is_union_territory"))
    default_rate = _rate(_d(settings.get("default_gst_rate") or "18"))

    inferred_direction: SupplyDirection = direction or voucher_trade_direction(voucher) or "OUTWARD"

    lines = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher_id))).scalars().all()
    )
    taxable = taxable_lines_override or await _infer_taxable_from_voucher(
        db, tenant_id, voucher, lines, direction=inferred_direction, default_rate=default_rate
    )
    preview = await calculate_tax_preview(
        db,
        tenant_id,
        taxable_lines=taxable,
        company_state=str(company_state) if company_state else None,
        place_of_supply_state=str(pos) if pos else None,
        direction=inferred_direction,
        is_union_territory=is_ut,
        feature_flags=feature_flags,
    )
    if not apply:
        return preview
    if not is_auto_tax_calculation(feature_flags) and taxable_lines_override is None:
        # Still allow explicit apply via API
        pass
    if preview["missing_tax_ledgers"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot apply tax: missing tax ledgers {preview['missing_tax_ledgers']}",
        )
    applied = await apply_tax_lines_to_voucher(
        db,
        tenant_id,
        voucher,
        preview["lines"],
        direction=inferred_direction,
    )
    preview["applied"] = True
    preview["voucher_tax_line_ids"] = [r["id"] for r in applied]
    return preview


async def apply_tax_lines_to_voucher(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    proposed_lines: list[dict[str, Any]],
    *,
    direction: SupplyDirection,
) -> list[dict[str, Any]]:
    """Replace auto GST voucher lines + voucher_tax_lines; rebalance party/counter line."""
    if (voucher.status or "").upper() not in {"DRAFT", "REJECTED"}:
        raise HTTPException(status_code=400, detail="Tax can only be applied on DRAFT/REJECTED vouchers")

    existing_lines = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all()
    )
    # Remove prior auto tax lines
    tax_line_ids = [ln.id for ln in existing_lines if (ln.notes or "").startswith(GST_LINE_MARKER)]
    for ln in existing_lines:
        if ln.id in tax_line_ids:
            await db.delete(ln)
    await db.execute(
        delete(VoucherTaxLine).where(
            VoucherTaxLine.tenant_id == tenant_id,
            VoucherTaxLine.voucher_id == voucher.id,
        )
    )
    await db.flush()

    remaining = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all()
    )
    tax_total = sum((_d(p["tax_amount"]) for p in proposed_lines), ZERO)

    # Output tax: CREDIT tax ledgers; Input tax: DEBIT tax ledgers
    tax_entry: Literal["CREDIT", "DEBIT"] = "CREDIT" if direction == "OUTWARD" else "DEBIT"
    counter_entry: Literal["CREDIT", "DEBIT"] = "DEBIT" if tax_entry == "CREDIT" else "CREDIT"
    rate = _d(voucher.exchange_rate)
    if rate <= ZERO:
        rate = Decimal("1")

    created: list[dict[str, Any]] = []
    for p in proposed_lines:
        ledger_id = p.get("tax_ledger_id")
        if not ledger_id:
            continue
        ledger = await db.get(TaxLedger, int(ledger_id))
        if not ledger or ledger.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail=f"Invalid tax ledger {ledger_id}")
        acct = await db.get(ChartOfAccount, ledger.chart_account_id)
        if not acct or acct.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Tax ledger account missing")
        amt = _money(_d(p["tax_amount"]))
        vl = VoucherLine(
            tenant_id=tenant_id,
            voucher_id=voucher.id,
            account_id=ledger.chart_account_id,
            entry_type=tax_entry,
            amount=str(amt),
            base_amount=str(_money(amt * rate)),
            currency=voucher.currency or "BDT",
            exchange_rate=voucher.exchange_rate or "1",
            notes=f"{GST_LINE_MARKER} {ledger.tax_type} {p.get('tax_rate')}% HSN:{p.get('hsn_code') or '-'}",
        )
        db.add(vl)
        await db.flush()
        vtl = VoucherTaxLine(
            tenant_id=tenant_id,
            voucher_id=voucher.id,
            voucher_line_id=vl.id,
            tax_ledger_id=ledger.id,
            taxable_amount=_money(_d(p["taxable_amount"])),
            tax_amount=amt,
            tax_rate_applied=_rate(_d(p["tax_rate"])),
            hsn_code=p.get("hsn_code"),
            is_itc_eligible=bool(p.get("is_itc_eligible", direction == "INWARD")),
            direction=direction,
        )
        db.add(vtl)
        await db.flush()
        created.append(voucher_tax_line_out(vtl, ledger))

    # Rebalance: bump largest counter-entry line (party/bank) by tax_total
    if tax_total > 0 and remaining:
        candidates = [ln for ln in remaining if ln.entry_type == counter_entry]
        if not candidates:
            candidates = remaining
        target = max(candidates, key=lambda x: _d(x.amount))
        from app.modules.finance.posting_core import line_base_amount

        old_base = line_base_amount(target)
        new_amt = _money(_d(target.amount) + tax_total)
        target.amount = str(new_amt)
        target.base_amount = str(_money(old_base + tax_total * rate))

    await db.flush()
    # Verify balance
    all_lines = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all()
    )
    debit = sum((_d(l.amount) for l in all_lines if l.entry_type == "DEBIT"), ZERO)
    credit = sum((_d(l.amount) for l in all_lines if l.entry_type == "CREDIT"), ZERO)
    if _money(debit) != _money(credit):
        raise HTTPException(
            status_code=400,
            detail=f"Voucher unbalanced after tax apply (DR {debit} / CR {credit})",
        )
    return created
