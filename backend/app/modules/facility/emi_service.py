"""EMI and interest math (deterministic; monthly accrual basis)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

Q4 = Decimal("0.0001")
Q2 = Decimal("0.01")


@dataclass
class EmiPreviewRow:
    installment_number: int
    due_date_iso: str | None
    principal_component: str
    interest_component: str
    emi_amount: str
    outstanding_after: str


@dataclass
class EmiPreviewResult:
    emi_amount: str
    total_interest: str
    total_repayable: str
    rows: list[EmiPreviewRow]


def _d(x: float | str | Decimal | None) -> Decimal:
    if x is None:
        return Decimal("0")
    return Decimal(str(x))


def monthly_rate_from_annual_percent(annual_percent: Decimal, periods_per_year: int) -> Decimal:
    if periods_per_year <= 0:
        return Decimal("0")
    return (annual_percent / Decimal(100)) / Decimal(periods_per_year)


def periods_per_year_for_frequency(freq: str) -> int:
    f = (freq or "monthly").lower()
    if f == "monthly":
        return 12
    if f == "quarterly":
        return 4
    if f == "semi_annually":
        return 2
    if f == "annually":
        return 1
    return 12


def reducing_balance_emi(
    principal: Decimal,
    annual_rate_percent: Decimal,
    num_payments: int,
    periods_per_year: int,
) -> Decimal:
    if principal <= 0 or num_payments <= 0:
        return Decimal("0")
    r = monthly_rate_from_annual_percent(annual_rate_percent, periods_per_year)
    if r == 0:
        return (principal / Decimal(num_payments)).quantize(Q4, rounding=ROUND_HALF_UP)
    n = num_payments
    one_plus_r_n = (Decimal(1) + r) ** n
    emi = principal * r * one_plus_r_n / (one_plus_r_n - Decimal(1))
    return emi.quantize(Q4, rounding=ROUND_HALF_UP)


def flat_interest_emi(
    principal: Decimal,
    annual_rate_percent: Decimal,
    num_payments: int,
    years: Decimal,
) -> Decimal:
    if principal <= 0 or num_payments <= 0:
        return Decimal("0")
    total_interest = principal * (annual_rate_percent / Decimal(100)) * years
    total = principal + total_interest
    return (total / Decimal(num_payments)).quantize(Q4, rounding=ROUND_HALF_UP)


def build_reducing_schedule(
    *,
    principal: Decimal,
    annual_rate_percent: Decimal,
    num_payments: int,
    periods_per_year: int,
    moratorium_payments: int = 0,
) -> tuple[Decimal, list[tuple[Decimal, Decimal, Decimal, Decimal]]]:
    """Returns (emi, list of (principal_part, interest_part, payment, outstanding_after))."""
    r = monthly_rate_from_annual_percent(annual_rate_percent, periods_per_year)
    balance = principal
    emi = reducing_balance_emi(principal, annual_rate_percent, num_payments, periods_per_year)
    rows: list[tuple[Decimal, Decimal, Decimal, Decimal]] = []
    for i in range(1, num_payments + 1):
        if i <= moratorium_payments:
            int_part = (balance * r).quantize(Q4, rounding=ROUND_HALF_UP)
            princ_part = Decimal("0")
            pay = int_part
        else:
            int_part = (balance * r).quantize(Q4, rounding=ROUND_HALF_UP)
            princ_part = (emi - int_part).quantize(Q4, rounding=ROUND_HALF_UP)
            if princ_part > balance:
                princ_part = balance
            pay = (princ_part + int_part).quantize(Q4, rounding=ROUND_HALF_UP)
        balance = (balance - princ_part).quantize(Q4, rounding=ROUND_HALF_UP)
        rows.append((princ_part, int_part, pay, balance))
    total_int = sum(x[1] for x in rows)
    return emi, rows


def preview_emi(
    *,
    principal: float,
    annual_interest_rate_percent: float,
    repayment_policy: str,
    num_installments: int | None,
    installment_frequency: str = "monthly",
    moratorium_months: int = 0,
    interest_type: str | None = None,
) -> EmiPreviewResult:
    """Preview EMI and schedule rows (no dates)."""
    p = _d(principal)
    rate = _d(annual_interest_rate_percent)
    policy = (repayment_policy or "emi_reducing").lower()
    ppy = periods_per_year_for_frequency(installment_frequency)
    n = int(num_installments or 0)
    it = (interest_type or "reducing_balance").lower()

    rows: list[EmiPreviewRow] = []
    if policy == "one_time_settlement" or n <= 0:
        return EmiPreviewResult(
            emi_amount="0",
            total_interest="0",
            total_repayable=str(p.quantize(Q2, rounding=ROUND_HALF_UP)),
            rows=[],
        )

    moratorium = max(0, int(moratorium_months or 0))
    moratorium_eff = (
        moratorium
        if policy in ("emi_reducing", "moratorium_then_installment", "fixed_installment")
        else 0
    )

    if policy in ("emi_reducing", "moratorium_then_installment", "fixed_installment") and it in (
        "reducing_balance",
        "fixed",
        "",
    ):
        emi, sched = build_reducing_schedule(
            principal=p,
            annual_rate_percent=rate,
            num_payments=n,
            periods_per_year=ppy,
            moratorium_payments=moratorium_eff,
        )
        total_int = sum(t[1] for t in sched)
        for idx, (pc, ic, pay, ob) in enumerate(sched, start=1):
            rows.append(
                EmiPreviewRow(
                    installment_number=idx,
                    due_date_iso=None,
                    principal_component=str(pc.quantize(Q4, rounding=ROUND_HALF_UP)),
                    interest_component=str(ic.quantize(Q4, rounding=ROUND_HALF_UP)),
                    emi_amount=str(pay.quantize(Q4, rounding=ROUND_HALF_UP)),
                    outstanding_after=str(ob.quantize(Q4, rounding=ROUND_HALF_UP)),
                )
            )
        tr = p + total_int
        return EmiPreviewResult(
            emi_amount=str(emi.quantize(Q4, rounding=ROUND_HALF_UP)),
            total_interest=str(total_int.quantize(Q2, rounding=ROUND_HALF_UP)),
            total_repayable=str(tr.quantize(Q2, rounding=ROUND_HALF_UP)),
            rows=rows,
        )

    if policy == "flat_interest" or it == "flat":
        years = Decimal(n) / Decimal(ppy)
        emi = flat_interest_emi(p, rate, n, years)
        total_int = emi * Decimal(n) - p
        balance = p
        for idx in range(1, n + 1):
            int_part = (total_int / Decimal(n)).quantize(Q4, rounding=ROUND_HALF_UP)
            princ_part = (emi - int_part).quantize(Q4, rounding=ROUND_HALF_UP)
            balance = (balance - princ_part).quantize(Q4, rounding=ROUND_HALF_UP)
            rows.append(
                EmiPreviewRow(
                    installment_number=idx,
                    due_date_iso=None,
                    principal_component=str(princ_part),
                    interest_component=str(int_part),
                    emi_amount=str(emi.quantize(Q4, rounding=ROUND_HALF_UP)),
                    outstanding_after=str(balance),
                )
            )
        return EmiPreviewResult(
            emi_amount=str(emi.quantize(Q4, rounding=ROUND_HALF_UP)),
            total_interest=str(total_int.quantize(Q2, rounding=ROUND_HALF_UP)),
            total_repayable=str((p + total_int).quantize(Q2, rounding=ROUND_HALF_UP)),
            rows=rows,
        )

    # manual_schedule — no preview
    return EmiPreviewResult(emi_amount="0", total_interest="0", total_repayable=str(p), rows=[])


def accrue_simple_monthly_interest(outstanding_principal: Decimal, annual_rate_percent: Decimal) -> Decimal:
    """One month of interest on outstanding principal (monthly basis)."""
    m = monthly_rate_from_annual_percent(annual_rate_percent, 12)
    return (outstanding_principal * m).quantize(Q4, rounding=ROUND_HALF_UP)
