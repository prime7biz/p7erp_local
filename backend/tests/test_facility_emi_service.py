"""Unit tests for facility EMI preview math (no DB)."""

from decimal import Decimal

from app.modules.facility.emi_service import preview_emi, reducing_balance_emi


def test_reducing_balance_emi_positive():
    emi = reducing_balance_emi(Decimal("100000"), Decimal("12"), 12, 12)
    assert emi > 0
    assert emi < Decimal("100000")


def test_preview_emi_reducing_12_months():
    r = preview_emi(
        principal=100000.0,
        annual_interest_rate_percent=12.0,
        repayment_policy="emi_reducing",
        num_installments=12,
        installment_frequency="monthly",
        moratorium_months=0,
        interest_type="reducing_balance",
    )
    assert len(r.rows) == 12
    assert Decimal(r.total_repayable) > Decimal(r.emi_amount)
    last = r.rows[-1]
    assert Decimal(last.outstanding_after) <= Decimal("1")


def test_preview_flat_policy():
    r = preview_emi(
        principal=1200.0,
        annual_interest_rate_percent=12.0,
        repayment_policy="flat_interest",
        num_installments=12,
        installment_frequency="monthly",
        moratorium_months=0,
        interest_type="flat",
    )
    assert len(r.rows) == 12
    assert Decimal(r.total_interest) > 0
