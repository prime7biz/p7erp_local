"""Unit tests for app.common.money (Phase 3A)."""

from decimal import Decimal

import pytest

from app.common.money import format_money, format_rate, is_plausible_money_string, parse_money, safe_decimal


def test_parse_money_none_empty():
    assert parse_money(None) is None
    assert parse_money("") is None
    assert parse_money("  ") is None


def test_parse_money_basic():
    assert parse_money("100") == Decimal("100")
    assert parse_money("100.50") == Decimal("100.50")
    assert parse_money("1,234.56") == Decimal("1234.56")
    assert parse_money(-5) == Decimal("-5")


def test_format_money_roundtrip():
    d = Decimal("10.1234")
    assert format_money(d) == "10.1234"


def test_format_rate_six_dp():
    assert format_rate(Decimal("1.5")) == "1.500000"


def test_safe_decimal_default():
    assert safe_decimal("bad", default=Decimal("0")) == Decimal("0")


@pytest.mark.parametrize(
    "s,ok",
    [
        ("12.3", True),
        ("", True),
        ("abc", False),
    ],
)
def test_is_plausible(s, ok):
    assert is_plausible_money_string(s) is ok
