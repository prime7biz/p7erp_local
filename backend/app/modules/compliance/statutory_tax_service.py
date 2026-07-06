"""Bangladesh statutory tax calculations (VAT, VDS, TDS, AIT)."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compliance import TenantStatutoryTaxConfig

_MONEY_Q = Decimal("0.0001")
_RATE_Q = Decimal("0.0001")


def _d(value: Decimal | str | float | int | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def format_money(value: Decimal) -> str:
    return str(value.quantize(_MONEY_Q, rounding=ROUND_HALF_UP))


def compute_line_tax(base_amount: Decimal, rate_pct: Decimal) -> Decimal:
    base = _d(base_amount)
    rate = _d(rate_pct)
    if base <= 0 or rate <= 0:
        return Decimal("0")
    return (base * rate / Decimal("100")).quantize(_MONEY_Q, rounding=ROUND_HALF_UP)


async def get_active_tax_rates(db: AsyncSession, tenant_id: int) -> dict[str, Decimal]:
    rows = (
        await db.execute(
            select(TenantStatutoryTaxConfig).where(
                TenantStatutoryTaxConfig.tenant_id == tenant_id,
                TenantStatutoryTaxConfig.is_active.is_(True),
            )
        )
    ).scalars().all()
    out: dict[str, Decimal] = {}
    for row in rows:
        out[row.tax_code.upper()] = _d(row.rate_pct)
    return out


async def apply_taxes_to_line(
    db: AsyncSession,
    tenant_id: int,
    *,
    line_amount: Decimal,
    apply_vat: bool = True,
    apply_vds: bool = False,
    apply_tds: bool = False,
) -> dict[str, Any]:
    rates = await get_active_tax_rates(db, tenant_id)
    base = _d(line_amount)
    vat = compute_line_tax(base, rates.get("VAT", Decimal("0"))) if apply_vat else Decimal("0")
    vds = compute_line_tax(base, rates.get("VDS", Decimal("0"))) if apply_vds else Decimal("0")
    tds = compute_line_tax(base, rates.get("TDS", Decimal("0"))) if apply_tds else Decimal("0")
    total_tax = vat + vds + tds
    return {
        "base_amount": format_money(base),
        "vat_amount": format_money(vat),
        "vds_amount": format_money(vds),
        "tds_amount": format_money(tds),
        "total_tax": format_money(total_tax),
        "gross_with_tax": format_money(base + total_tax),
        "rates_used": {k: str(v.quantize(_RATE_Q)) for k, v in rates.items()},
    }


def compute_payroll_statutory(
    *,
    gross_pay: Decimal,
    ait_rate_pct: Decimal = Decimal("0"),
    pf_employee_rate_pct: Decimal = Decimal("0"),
    pf_employer_rate_pct: Decimal = Decimal("0"),
) -> dict[str, str]:
    gross = _d(gross_pay)
    ait = compute_line_tax(gross, ait_rate_pct)
    pf_emp = compute_line_tax(gross, pf_employee_rate_pct)
    pf_er = compute_line_tax(gross, pf_employer_rate_pct)
    net = gross - ait - pf_emp
    return {
        "gross_total": format_money(gross),
        "ait_total": format_money(ait),
        "pf_employee_total": format_money(pf_emp),
        "pf_employer_total": format_money(pf_er),
        "net_payable": format_money(net),
    }
