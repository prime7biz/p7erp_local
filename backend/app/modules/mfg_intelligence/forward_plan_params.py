"""Forward-plan presets and parameters (Manufacturing Intelligence Phase 5; doc 16 D2, D10-D13, 15.6). Pure.

Presets (each is evaluated in memory, never saved):
    BASE                  confirmed + booked + tentative weighted, efficiency P50
    OPTIMISTIC            BASE demand, efficiency Q20 (upside)
    CONSERVATIVE          confirmed + booked + tentative full + forecast residual, efficiency P80
    CAPACITY_CONSTRAINED  BASE demand, finite: demand above weekly capacity is carried forward
    FINANCE_CONSTRAINED   CAPACITY_CONSTRAINED, then the cash cut (own route, finance gate)
Custom = any preset + explicit parameters. Out-of-range parameters are 422. `absence_pct > 0` only with
`efficiency_basis=PLAN` (empirical efficiency already includes absence): otherwise 422 ABSENCE_ALREADY_IN_EMPIRICAL.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Any

from fastapi import HTTPException

HORIZONS: tuple[int, ...] = (90, 120, 150, 180)
DEFAULT_HORIZON = 90
BUCKET_WEEK = "week"
BUCKET_MONTH = "month"

BASE = "BASE"
OPTIMISTIC = "OPTIMISTIC"
CONSERVATIVE = "CONSERVATIVE"
CAPACITY_CONSTRAINED = "CAPACITY_CONSTRAINED"
FINANCE_CONSTRAINED = "FINANCE_CONSTRAINED"
SCENARIOS: tuple[str, ...] = (BASE, OPTIMISTIC, CONSERVATIVE, CAPACITY_CONSTRAINED, FINANCE_CONSTRAINED)
COMPARE_SCENARIOS: tuple[str, ...] = (BASE, OPTIMISTIC, CONSERVATIVE, CAPACITY_CONSTRAINED)
MAX_COMPARE = 4

BASIS_PLAN = "PLAN"
BASIS_P50 = "P50"
BASIS_Q20 = "Q20"
BASIS_P80 = "P80"
BASIS_P90 = "P90"
EFFICIENCY_BASES: tuple[str, ...] = (BASIS_PLAN, BASIS_P50, BASIS_Q20, BASIS_P80, BASIS_P90)
# grid probability q of each P-basis (Phase 4 spread ratios r_q)
BASIS_Q: dict[str, Decimal] = {
    BASIS_P50: Decimal("0.50"),
    BASIS_Q20: Decimal("0.20"),
    BASIS_P80: Decimal("0.80"),
    BASIS_P90: Decimal("0.90"),
}
# fixed bands when there is no usable history (D12; same factors as Phase 1 delivery bands)
FIXED_BAND_FACTOR: dict[str, Decimal] = {
    BASIS_P50: Decimal("1"),
    BASIS_Q20: Decimal("1.10"),
    BASIS_P80: Decimal("0.85"),
    BASIS_P90: Decimal("0.85"),
}

# demand layers
L_CONFIRMED_FIRM = "CONFIRMED_PLANNED_FIRM"
L_CONFIRMED_SOFT = "CONFIRMED_PLANNED_SOFT"
L_UNCONFIRMED = "UNCONFIRMED_ORDER_ROWS"
L_UNLINKED = "UNLINKED_ROWS"
L_OVERDUE_PLANNED = "OVERDUE_PLANNED_BACKLOG"
L_UNPLANNED = "CONFIRMED_UNPLANNED"
L_OVERDUE_UNPLANNED = "OVERDUE_UNPLANNED"
L_TENTATIVE_FULL = "TENTATIVE_FULL"
L_TENTATIVE_WEIGHTED = "TENTATIVE_WEIGHTED"
L_FORECAST = "FORECAST_RESIDUAL"
LAYERS: tuple[str, ...] = (
    L_CONFIRMED_FIRM, L_CONFIRMED_SOFT, L_UNCONFIRMED, L_UNLINKED, L_OVERDUE_PLANNED, L_UNPLANNED,
    L_OVERDUE_UNPLANNED, L_TENTATIVE_FULL, L_TENTATIVE_WEIGHTED, L_FORECAST,
)
BOOKED_LAYERS: tuple[str, ...] = (L_CONFIRMED_FIRM, L_CONFIRMED_SOFT, L_UNCONFIRMED, L_UNLINKED, L_OVERDUE_PLANNED)
UNPLANNED_LAYERS: tuple[str, ...] = (L_UNPLANNED, L_OVERDUE_UNPLANNED)
CONFIRMED_LAYERS: tuple[str, ...] = (L_CONFIRMED_FIRM, L_CONFIRMED_SOFT, L_UNPLANNED, L_OVERDUE_UNPLANNED)

_BASE_DEMAND = (*BOOKED_LAYERS, *UNPLANNED_LAYERS, L_TENTATIVE_WEIGHTED)
_CONSERVATIVE_DEMAND = (*BOOKED_LAYERS, *UNPLANNED_LAYERS, L_TENTATIVE_FULL, L_FORECAST)
PRESETS: dict[str, dict[str, Any]] = {
    BASE: {"efficiency_basis": BASIS_P50, "layers": _BASE_DEMAND, "finite": False},
    OPTIMISTIC: {"efficiency_basis": BASIS_Q20, "layers": _BASE_DEMAND, "finite": False},
    CONSERVATIVE: {"efficiency_basis": BASIS_P80, "layers": _CONSERVATIVE_DEMAND, "finite": False},
    CAPACITY_CONSTRAINED: {"efficiency_basis": BASIS_P50, "layers": _BASE_DEMAND, "finite": True},
    FINANCE_CONSTRAINED: {"efficiency_basis": BASIS_P50, "layers": _BASE_DEMAND, "finite": True},
}

LIMITS: dict[str, tuple[Decimal, Decimal]] = {
    "overtime_pct": (Decimal("0"), Decimal("25")),
    "absence_pct": (Decimal("0"), Decimal("30")),
    "extra_operator_pct": (Decimal("-30"), Decimal("30")),
}
MAX_VIRTUAL_LINES = 5
ABSENCE_ALREADY_IN_EMPIRICAL = "ABSENCE_ALREADY_IN_EMPIRICAL"


def coded_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


@dataclass(frozen=True)
class ForwardParams:
    scenario: str
    efficiency_basis: str
    overtime_pct: Decimal = Decimal("0")
    absence_pct: Decimal = Decimal("0")
    extra_operator_pct: Decimal = Decimal("0")
    virtual_lines: int = 0
    basis_from_preset: bool = True

    @property
    def layers(self) -> tuple[str, ...]:
        return PRESETS[self.scenario]["layers"]

    @property
    def finite(self) -> bool:
        return bool(PRESETS[self.scenario]["finite"])

    def out(self) -> dict[str, Any]:
        d = asdict(self)
        for k in ("overtime_pct", "absence_pct", "extra_operator_pct"):
            d[k] = format(d[k], "f")
        return d


def build_params(
    scenario: str,
    *,
    efficiency_basis: str | None = None,
    overtime_pct: Decimal | None = None,
    absence_pct: Decimal | None = None,
    extra_operator_pct: Decimal | None = None,
    virtual_lines: int | None = None,
) -> ForwardParams:
    """Validate one parameter set (422 on anything out of range)."""
    scenario = (scenario or BASE).strip().upper()
    if scenario not in SCENARIOS:
        raise coded_error(422, "SCENARIO_UNKNOWN", f"scenario must be one of {', '.join(SCENARIOS)}")
    basis = (efficiency_basis or "").strip().upper() or None
    if basis is not None and basis not in EFFICIENCY_BASES:
        raise coded_error(422, "EFFICIENCY_BASIS_UNKNOWN", f"efficiency_basis must be one of {', '.join(EFFICIENCY_BASES)}")
    values: dict[str, Decimal] = {}
    for key, raw in (("overtime_pct", overtime_pct), ("absence_pct", absence_pct), ("extra_operator_pct", extra_operator_pct)):
        low, high = LIMITS[key]
        v = Decimal("0") if raw is None else Decimal(raw)
        if not v.is_finite() or v < low or v > high:
            raise coded_error(422, "PARAMETER_OUT_OF_RANGE", f"{key} must be between {low} and {high}")
        values[key] = v
    vl = 0 if virtual_lines is None else int(virtual_lines)
    if not 0 <= vl <= MAX_VIRTUAL_LINES:
        raise coded_error(422, "PARAMETER_OUT_OF_RANGE", f"virtual_lines must be between 0 and {MAX_VIRTUAL_LINES}")
    chosen = basis or PRESETS[scenario]["efficiency_basis"]
    if values["absence_pct"] > 0 and chosen != BASIS_PLAN:
        raise coded_error(
            422, ABSENCE_ALREADY_IN_EMPIRICAL,
            "absence_pct can be used only with efficiency_basis=PLAN: measured efficiency already includes absence.",
        )
    return ForwardParams(
        scenario=scenario,
        efficiency_basis=chosen,
        overtime_pct=values["overtime_pct"],
        absence_pct=values["absence_pct"],
        extra_operator_pct=values["extra_operator_pct"],
        virtual_lines=vl,
        basis_from_preset=basis is None,
    )


def parse_compare(scenarios: str) -> list[str]:
    names = [s.strip().upper() for s in (scenarios or "").split(",") if s.strip()]
    if not names:
        raise coded_error(422, "SCENARIOS_REQUIRED", "scenarios must name at least one scenario")
    if len(names) > MAX_COMPARE:
        raise coded_error(422, "TOO_MANY_SCENARIOS", f"At most {MAX_COMPARE} scenarios can be compared")
    if len(set(names)) != len(names):
        raise coded_error(422, "DUPLICATE_SCENARIO", "Each scenario may be named once")
    for n in names:
        if n not in COMPARE_SCENARIOS:
            raise coded_error(422, "SCENARIO_NOT_COMPARABLE", f"scenarios must be among {', '.join(COMPARE_SCENARIOS)}")
    return names
