"""Shared parsing/validation for inventory quantity and money strings (Phase 1.8)."""

from __future__ import annotations


def parse_decimal_string(raw: str | None, field_name: str) -> float:
    s = (raw or "").strip().replace(",", "")
    if not s:
        raise ValueError(f"{field_name} is required")
    try:
        return float(s)
    except (TypeError, ValueError) as e:
        raise ValueError(f"{field_name} must be a valid number") from e


def validate_positive_qty_str(raw: str | None, field_name: str = "quantity") -> str:
    v = parse_decimal_string(raw, field_name)
    if v <= 0:
        raise ValueError(f"{field_name} must be greater than zero")
    return (raw or "").strip()


def validate_non_negative_money_str(raw: str | None, field_name: str = "amount") -> str:
    v = parse_decimal_string(raw if (raw or "").strip() != "" else "0", field_name)
    if v < 0:
        raise ValueError(f"{field_name} cannot be negative")
    return (raw or "").strip() if (raw or "").strip() != "" else "0"


def validate_non_negative_qty_str(raw: str | None, field_name: str = "quantity") -> str:
    v = parse_decimal_string(raw if (raw or "").strip() != "" else "0", field_name)
    if v < 0:
        raise ValueError(f"{field_name} cannot be negative")
    return (raw or "").strip()


def validate_signed_adjustment_qty_str(raw: str | None, field_name: str = "quantity") -> str:
    v = parse_decimal_string(raw, field_name)
    if v == 0:
        raise ValueError(f"{field_name} cannot be zero")
    return (raw or "").strip()
