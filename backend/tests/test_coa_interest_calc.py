"""Unit tests for pure COA interest calc (no DB)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.modules.finance.coa_interest.calc import (
    apply_proration,
    completed_period_keys,
    compute_period_interest,
    full_period_interest,
    period_bounds,
    period_key_for,
    proration_factor,
)


def test_period_keys_monthly_and_quarterly():
    assert period_key_for(date(2026, 3, 15), "monthly") == "2026-03"
    assert period_key_for(date(2026, 3, 15), "quarterly") == "2026-Q1"
    assert period_bounds("2026-03") == (date(2026, 3, 1), date(2026, 3, 31))
    assert period_bounds("2026-Q1") == (date(2026, 1, 1), date(2026, 3, 31))


def test_proration_mid_month():
    # Activate 16 Mar of 31-day month → 16 days inclusive → 16/31
    f = proration_factor(
        activation=date(2026, 3, 16),
        period_start=date(2026, 3, 1),
        period_end=date(2026, 3, 31),
    )
    assert f == Decimal("0.51612903")  # 16/31 quantized to 8 dp
    assert apply_proration(Decimal("3100"), f) == Decimal("1600.0000")


def test_proration_full_when_activated_before_period():
    f = proration_factor(
        activation=date(2026, 2, 1),
        period_start=date(2026, 3, 1),
        period_end=date(2026, 3, 31),
    )
    assert f == Decimal("1")


def test_monthly_fixed_and_yearly_splits():
    assert full_period_interest(
        method="monthly_fixed",
        frequency="monthly",
        base_balance=Decimal("100000"),
        rate_yearly=None,
        fixed_amount=Decimal("500"),
    ) == Decimal("500.0000")
    assert full_period_interest(
        method="yearly_fixed",
        frequency="monthly",
        base_balance=Decimal("0"),
        rate_yearly=None,
        fixed_amount=Decimal("1200"),
    ) == Decimal("100.0000")
    assert full_period_interest(
        method="yearly_fixed",
        frequency="quarterly",
        base_balance=Decimal("0"),
        rate_yearly=None,
        fixed_amount=Decimal("1200"),
    ) == Decimal("300.0000")


def test_yearly_rate_monthly_and_quarterly():
    # 12% on 100,000 → 1,000 / month; 3,000 / quarter
    assert full_period_interest(
        method="yearly_rate",
        frequency="monthly",
        base_balance=Decimal("100000"),
        rate_yearly=Decimal("12"),
        fixed_amount=None,
    ) == Decimal("1000.0000")
    assert full_period_interest(
        method="yearly_rate",
        frequency="quarterly",
        base_balance=Decimal("100000"),
        rate_yearly=Decimal("12"),
        fixed_amount=None,
    ) == Decimal("3000.0000")


def test_compute_skips_before_activation_and_small_balance():
    p = compute_period_interest(
        method="yearly_rate",
        frequency="monthly",
        base_balance=Decimal("100000"),
        rate_yearly=Decimal("12"),
        fixed_amount=None,
        activation=date(2026, 4, 1),
        period_key="2026-03",
        nature="Liability",
    )
    assert p.skip_reason == "before_activation"
    p2 = compute_period_interest(
        method="yearly_rate",
        frequency="monthly",
        base_balance=Decimal("0.005"),
        rate_yearly=Decimal("12"),
        fixed_amount=None,
        activation=date(2026, 1, 1),
        period_key="2026-03",
        nature="Asset",
    )
    assert p2.skip_reason == "ineligible_balance"


def test_completed_period_keys_catchup_cap():
    # as_of 2026-04-02 → last completed month is 2026-03; cap keeps the newest N
    keys = completed_period_keys(
        frequency="monthly",
        activation=date(2025, 1, 15),
        as_of=date(2026, 4, 2),
        max_periods=3,
    )
    assert keys == ["2026-01", "2026-02", "2026-03"]


def test_monthly_fixed_rejects_quarterly_frequency():
    with pytest.raises(ValueError):
        full_period_interest(
            method="monthly_fixed",
            frequency="quarterly",
            base_balance=Decimal("1"),
            rate_yearly=None,
            fixed_amount=Decimal("10"),
        )
