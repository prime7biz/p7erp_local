"""Non-negative money/qty validators (go-live remediation Phase 1)."""

from __future__ import annotations

import pytest
from pydantic import BaseModel, ValidationError

from app.common.money_schema import (
    MoneyStrNonNeg,
    MoneyStrNonNegOpt,
    QtyStrNonNeg,
    RateStrNonNeg,
)


class _MoneyBody(BaseModel):
    amount: MoneyStrNonNeg


class _MoneyOptBody(BaseModel):
    amount: MoneyStrNonNegOpt = None


class _QtyBody(BaseModel):
    quantity: QtyStrNonNeg


class _RateBody(BaseModel):
    rate: RateStrNonNeg


def test_money_nonneg_normalizes_commas():
    row = _MoneyBody(amount="1,234.5")
    assert row.amount == "1234.5000"


def test_money_nonneg_rejects_negative():
    with pytest.raises(ValidationError):
        _MoneyBody(amount="-1")


def test_money_nonneg_optional_none_ok():
    row = _MoneyOptBody(amount=None)
    assert row.amount is None


def test_qty_nonneg_zero_ok():
    row = _QtyBody(quantity="0")
    assert row.quantity == "0.0000"


def test_qty_nonneg_rejects_negative():
    with pytest.raises(ValidationError):
        _QtyBody(quantity="-0.5")


def test_rate_nonneg_normalizes():
    row = _RateBody(rate="110.25")
    assert row.rate == "110.250000"
