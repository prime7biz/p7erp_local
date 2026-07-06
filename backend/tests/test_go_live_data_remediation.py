"""Go-live data remediation: numeric round-trip, delete guards, validators."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.common.money_schema import MoneyStrNonNeg, QtyStrNonNeg
from app.modules.finance.router import ChartAccountOut, VoucherLineBody
from pydantic import BaseModel


class _QtyModel(BaseModel):
    quantity: QtyStrNonNeg


def test_voucher_line_rejects_negative_amount():
    with pytest.raises(ValidationError):
        VoucherLineBody(
            account_id=1,
            entry_type="DEBIT",
            amount="-10",
        )


def test_qty_nonneg_coerces():
    row = _QtyModel(quantity="12.5")
    assert row.quantity == "12.5000"


def test_chart_account_out_serializes_decimal_balance():
    from decimal import Decimal

    from app.common.orm_numeric import decimal_to_money_response

    assert decimal_to_money_response(Decimal("100.5")) == "100.5000"
    assert decimal_to_money_response(Decimal("250")) == "250.0000"

    row = ChartAccountOut.model_validate(
        {
            "id": 1,
            "tenant_id": 1,
            "name": "Cash",
            "group_id": 1,
            "opening_balance": Decimal("0.0000"),
            "balance": Decimal("0.0000"),
            "version": 1,
            "enable_bill_wise": False,
        }
    )
    assert row.balance == "0.0000"
    assert row.opening_balance == "0.0000"
