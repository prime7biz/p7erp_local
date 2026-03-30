"""Unit tests for quotation commercial money parsing (no DATABASE_URL required)."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.modules.quotations.quotation_commercial_money import (
  MoneyParseError,
  collect_rollup_money_errors,
  cost_line_arrays_present_in_request,
  normalize_currency_code,
  parse_money_decimal,
  validate_header_fx_rules,
)
from app.modules.orders.commercial_numeraire import (
  COMMERCIAL_BOOK_CURRENCY_FLAG_KEY,
  resolve_commercial_book_currency,
)


def test_normalize_currency_code() -> None:
  assert normalize_currency_code("  usd  ") == "USD"
  assert normalize_currency_code("") is None
  assert normalize_currency_code(None) is None


def test_parse_money_decimal_accepts_commas() -> None:
  assert parse_money_decimal("1,234.50", field="x") == Decimal("1234.50")


def test_parse_money_decimal_invalid() -> None:
  with pytest.raises(MoneyParseError):
    parse_money_decimal("12abc", field="amt", allow_empty_as_zero=False)


def test_validate_header_fx_same_currency_ok() -> None:
  assert validate_header_fx_rules(
    document_currency="USD",
    target_price_currency="USD",
    exchange_rate="",
  ) == []


def test_validate_header_fx_different_requires_positive_rate() -> None:
  assert validate_header_fx_rules(
    document_currency="BDT",
    target_price_currency="EUR",
    exchange_rate="",
  ) != []
  assert validate_header_fx_rules(
    document_currency="BDT",
    target_price_currency="EUR",
    exchange_rate="0",
  ) != []
  assert validate_header_fx_rules(
    document_currency="BDT",
    target_price_currency="EUR",
    exchange_rate="120.5",
  ) == []


def test_cost_line_arrays_present() -> None:
  assert cost_line_arrays_present_in_request(None, None, None) is False
  assert cost_line_arrays_present_in_request([], None, None) is True


def test_collect_rollup_money_errors_skips_blank_rows() -> None:
  class R:
    def __init__(self, **kw) -> None:
      self.__dict__.update(kw)

  mats = [R(category_id=None, item_id=None, description="", total_amount="x")]
  assert collect_rollup_money_errors(materials=mats, manufacturing=None, other_costs=None) == []


def test_collect_rollup_money_errors_detects_bad_amount() -> None:
  class R:
    def __init__(self, **kw) -> None:
      self.__dict__.update(kw)

  mats = [R(category_id=None, item_id=None, description="Fabric", total_amount="nope")]
  err = collect_rollup_money_errors(materials=mats, manufacturing=None, other_costs=None)
  assert len(err) == 1
  assert "materials[0]" in err[0]["field"]


def test_resolve_commercial_book_currency_uses_document_when_no_override() -> None:
  class T:
    feature_flags = {}

  assert resolve_commercial_book_currency(T(), "usd") == "USD"
  assert resolve_commercial_book_currency(T(), None) is None


def test_resolve_commercial_book_currency_tenant_override() -> None:
  class T:
    feature_flags = {COMMERCIAL_BOOK_CURRENCY_FLAG_KEY: "bdt"}

  assert resolve_commercial_book_currency(T(), "USD") == "BDT"
