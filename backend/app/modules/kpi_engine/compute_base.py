"""Shared KPI value contract. Money and ratios use Decimal — never float."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@dataclass
class KpiValue:
    code: str
    value: Decimal | None
    unit: str
    as_of: datetime
    formula_version: str
    numerator: Decimal | None = None
    denominator: Decimal | None = None
    status: str = "NO_DATA"
    missing_inputs: list[str] = field(default_factory=list)
    source_event_time: datetime | None = None
    target_value: Decimal | None = None
    evidence: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        def _d(v: Decimal | None) -> str | None:
            return None if v is None else format(v, "f")

        return {
            "code": self.code,
            "value": _d(self.value),
            "unit": self.unit,
            "as_of": self.as_of.isoformat() + "Z",
            "formula_version": self.formula_version,
            "numerator": _d(self.numerator),
            "denominator": _d(self.denominator),
            "status": self.status,
            "missing_inputs": list(self.missing_inputs),
            "source_event_time": (
                self.source_event_time.isoformat() + "Z" if self.source_event_time else None
            ),
            "target_value": _d(self.target_value),
        }


def pct(numerator: Decimal, denominator: Decimal) -> Decimal | None:
    if denominator == 0:
        return None
    return (numerator * Decimal("100")) / denominator


def no_data(code: str, unit: str, missing: list[str], formula_version: str = "1") -> KpiValue:
    return KpiValue(
        code=code,
        value=None,
        unit=unit,
        as_of=utcnow(),
        formula_version=formula_version,
        status="NO_DATA",
        missing_inputs=missing,
    )


def blocked(code: str, unit: str, reason: str) -> KpiValue:
    return no_data(code, unit, [reason], formula_version="blocked")


def apply_target_status(
    value: Decimal | None,
    *,
    direction: str,
    target: Decimal | None,
    amber_lower: Decimal | None = None,
    amber_upper: Decimal | None = None,
    red_lower: Decimal | None = None,
    red_upper: Decimal | None = None,
) -> str:
    if value is None:
        return "NO_DATA"
    if target is None and amber_lower is None and red_lower is None and amber_upper is None and red_upper is None:
        return "NO_TARGET"
    # Prefer explicit red bands, then amber, then target.
    if red_lower is not None and value < red_lower:
        return "RED"
    if red_upper is not None and value > red_upper:
        return "RED"
    if direction == "UP":
        if amber_lower is not None and value < amber_lower:
            return "RED"
        if target is not None and value >= target:
            return "GREEN"
        if amber_lower is not None and value >= amber_lower:
            return "AMBER"
        if target is not None and value < target:
            return "AMBER"
        return "GREEN" if target is None else "AMBER"
    if direction == "DOWN":
        if amber_upper is not None and value > amber_upper:
            return "RED"
        if target is not None and value <= target:
            return "GREEN"
        if amber_upper is not None and value <= amber_upper:
            return "AMBER"
        if target is not None and value > target:
            return "AMBER"
        return "GREEN" if target is None else "AMBER"
    if amber_lower is not None and value < amber_lower:
        return "AMBER"
    if amber_upper is not None and value > amber_upper:
        return "AMBER"
    return "GREEN"
