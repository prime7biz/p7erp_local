"""Parsing and validation for quotation commercial money and FX (governance foundation).

Enforces header FX when document vs buyer-target currencies differ, and line-level FX when a
cost line currency differs from document currency. Rollup money parsing lives here too.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any


class MoneyParseError(ValueError):
  def __init__(self, field: str, message: str) -> None:
    self.field = field
    super().__init__(message)


def normalize_currency_code(value: str | None) -> str | None:
  if value is None:
    return None
  s = value.strip().upper()
  return s[:10] if s else None


def parse_money_decimal(
  value: str | Decimal | int | float | None,
  *,
  field: str,
  allow_empty_as_zero: bool = True,
) -> Decimal:
  if value is None or (isinstance(value, str) and not value.strip()):
    if allow_empty_as_zero:
      return Decimal("0")
    raise MoneyParseError(field, f"{field} cannot be empty")
  if isinstance(value, Decimal):
    return value
  if isinstance(value, (int, float)):
    try:
      return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as e:
      raise MoneyParseError(field, f"{field} is not a valid number: {value!r}") from e
  raw = str(value).strip().replace(",", "")
  try:
    d = Decimal(raw)
  except (InvalidOperation, ValueError, TypeError) as e:
    raise MoneyParseError(field, f"{field} is not a valid number: {value!r}") from e
  return d


def line_fx_to_quotation_multiplier(
  *,
  document_currency: str | None,
  line_currency: str | None,
  exchange_rate: str | Decimal | None,
) -> Decimal:
  """Match frontend lineFxToQuotation: 1 when same currency; else positive exchange_rate or 1."""
  dc = normalize_currency_code(document_currency) or "USD"
  lc = normalize_currency_code(line_currency) or dc
  if lc == dc:
    return Decimal("1")
  r = parse_money_decimal(exchange_rate, field="line.exchange_rate", allow_empty_as_zero=True)
  if r <= 0:
    return Decimal("1")
  return r


def other_cost_rollup_amount_string(row: Any) -> str | None:
  """Prefer calculated_amount when set; otherwise total_amount. Treats '0' as valid (not falsy)."""
  calc = getattr(row, "calculated_amount", None)
  if calc is not None and str(calc).strip() != "":
    return str(calc)
  total = getattr(row, "total_amount", None)
  if total is not None and str(total).strip() != "":
    return str(total)
  return None


def validate_header_fx_rules(
  *,
  document_currency: str | None,
  target_price_currency: str | None,
  exchange_rate: str | Decimal | None,
) -> list[str]:
  """Return human-readable validation errors (empty if OK)."""
  dc = normalize_currency_code(document_currency) or ""
  tc = normalize_currency_code(target_price_currency) or ""
  if not dc or not tc or dc == tc:
    return []
  try:
    rate = parse_money_decimal(exchange_rate, field="exchange_rate", allow_empty_as_zero=False)
  except MoneyParseError:
    return [
      "When document currency and buyer target currency differ, exchange_rate must be a positive number.",
    ]
  if rate <= 0:
    return ["exchange_rate must be greater than zero when document currency and buyer target currency differ."]
  return []


def material_row_is_persisted_for_rollup(row: Any) -> bool:
  return not (
    row.category_id is None
    and row.item_id is None
    and not (getattr(row, "description", None) or "").strip()
  )


def manufacturing_row_is_persisted_for_rollup(row: Any) -> bool:
  return bool((getattr(row, "style_part", None) or "").strip())


def other_cost_row_is_persisted_for_rollup(row: Any) -> bool:
  return bool((getattr(row, "cost_head", None) or "").strip())


def collect_rollup_money_errors(
  *,
  materials: list[Any] | None,
  manufacturing: list[Any] | None,
  other_costs: list[Any] | None,
) -> list[dict[str, str]]:
  """Strict parse errors for amounts used in PUT rollups. Empty list means OK."""
  errors: list[dict[str, str]] = []
  if materials:
    for i, row in enumerate(materials):
      if not material_row_is_persisted_for_rollup(row):
        continue
      try:
        parse_money_decimal(row.total_amount, field=f"materials[{i}].total_amount")
      except MoneyParseError as e:
        errors.append({"field": e.field, "message": str(e)})
  if manufacturing:
    for i, row in enumerate(manufacturing):
      if not manufacturing_row_is_persisted_for_rollup(row):
        continue
      try:
        parse_money_decimal(row.total_order_cost, field=f"manufacturing[{i}].total_order_cost")
      except MoneyParseError as e:
        errors.append({"field": e.field, "message": str(e)})
  if other_costs:
    for i, row in enumerate(other_costs):
      if not other_cost_row_is_persisted_for_rollup(row):
        continue
      amt = other_cost_rollup_amount_string(row)
      if amt is None:
        continue
      try:
        parse_money_decimal(amt, field=f"other_costs[{i}].amount")
      except MoneyParseError as e:
        errors.append({"field": e.field, "message": str(e)})
  return errors


def cost_line_arrays_present_in_request(
    materials: list[Any] | None,
    manufacturing: list[Any] | None,
    other_costs: list[Any] | None,
) -> bool:
    return materials is not None or manufacturing is not None or other_costs is not None


def validate_line_fx_rules(
    *,
    document_currency: str | None,
    materials: list[Any] | None,
    manufacturing: list[Any] | None,
    other_costs: list[Any] | None,
) -> list[str]:
    """Require positive exchange_rate on cost lines whose currency differs from document currency."""
    errors: list[str] = []
    dc = normalize_currency_code(document_currency) or "USD"

    def check_lines(
        label: str,
        lines: list[Any] | None,
        is_persisted,
    ) -> None:
        if not lines:
            return
        for i, row in enumerate(lines):
            if not is_persisted(row):
                continue
            lc = normalize_currency_code(getattr(row, "currency", None)) or dc
            if lc == dc:
                continue
            ex = getattr(row, "exchange_rate", None)
            try:
                rate = parse_money_decimal(
                    ex,
                    field=f"{label}[{i}].exchange_rate",
                    allow_empty_as_zero=True,
                )
            except MoneyParseError:
                errors.append(
                    f"{label}[{i}]: exchange_rate must be a valid number when line currency ({lc}) "
                    f"differs from quotation currency ({dc})."
                )
                continue
            if rate <= 0:
                errors.append(
                    f"{label}[{i}]: exchange_rate must be greater than zero when line currency ({lc}) "
                    f"differs from quotation currency ({dc})."
                )

    check_lines("materials", materials, material_row_is_persisted_for_rollup)
    check_lines("manufacturing", manufacturing, manufacturing_row_is_persisted_for_rollup)
    check_lines("other_costs", other_costs, other_cost_row_is_persisted_for_rollup)
    return errors
