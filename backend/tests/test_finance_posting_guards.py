"""Finance posting guards: Decimal balance math and the pre-posting line checks."""

from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.models import ChartOfAccount, VoucherLine
from app.modules.finance.posting_core import assert_lines_balanced
from app.modules.finance.router import _apply_voucher_impact, _assert_posting_line_amounts


def _line(entry_type: str, amount: str) -> VoucherLine:
    return VoucherLine(entry_type=entry_type, amount=Decimal(amount), account_id=1, voucher_id=1)


def test_balance_impact_uses_exact_decimal_math():
    account = ChartOfAccount(normal_balance="debit", balance=Decimal("0"))
    for _ in range(1000):
        _apply_voucher_impact(account, "DEBIT", "0.1")
    assert account.balance == Decimal("100.0000")
    _apply_voucher_impact(account, "CREDIT", Decimal("0.3"))
    assert account.balance == Decimal("99.7000")


def test_balance_impact_credit_normal_account():
    account = ChartOfAccount(normal_balance="credit", balance="50")
    _apply_voucher_impact(account, "CREDIT", "25.125")
    _apply_voucher_impact(account, "DEBIT", "5")
    assert account.balance == Decimal("70.1250")


def test_posting_checks_accept_balanced_voucher():
    lines = [_line("DEBIT", "100.50"), _line("CREDIT", "60.25"), _line("CREDIT", "40.25")]
    _assert_posting_line_amounts(lines)
    assert_lines_balanced(lines)


@pytest.mark.parametrize(
    "lines",
    [
        [],
        [_line("DEBIT", "100")],
        [_line("DEBIT", "100"), _line("CREDIT", "118")],
    ],
)
def test_balance_check_rejects_unbalanced_vouchers(lines):
    with pytest.raises(HTTPException) as exc:
        assert_lines_balanced(lines)
    assert exc.value.status_code == 400


@pytest.mark.parametrize(
    "lines",
    [
        [_line("DEBIT", "-5"), _line("CREDIT", "-5")],
        [_line("DEBIT", "10"), _line("MEMO", "10")],
    ],
)
def test_line_check_rejects_negative_or_unknown_lines(lines):
    with pytest.raises(HTTPException) as exc:
        _assert_posting_line_amounts(lines)
    assert exc.value.status_code == 400
