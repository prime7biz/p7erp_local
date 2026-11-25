"""Dozen-first quotation costing engine (authoritative, Decimal only).

Used only when tenant flag ``quotation_costing_accuracy_v1`` is ON and the quotation has
``costing_basis = 'PER_DOZEN'``. Legacy quotations never reach this module.

Rules (see the approved plan):
  * Everything is costed PER DOZEN (12 pcs), whatever the projected quantity is (it may be 0 / TBD).
  * The buyer price is quoted PER PIECE = price per dozen / 12.
  * Full Decimal precision is kept inside the calculation; callers quantize once per stored column
    with :func:`q4` (ROUND_HALF_UP).
  * Fixed commission is ONE amount for the whole order, so it needs a projected quantity > 0.

This module is pure (no database, no FastAPI) so the same fixtures can be shared with the
frontend live-preview mirror (``quotationNumeric.ts``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal, localcontext
from typing import Any, Sequence

TWELVE = Decimal("12")
ZERO = Decimal("0")
ONE = Decimal("1")
HUNDRED = Decimal("100")
FOUR_DP = Decimal("0.0001")
# Margin-on-FOB divides by (1 - margin - commission); anything near zero is rejected.
MIN_FOB_DENOMINATOR = Decimal("0.01")
DEFAULT_WORKING_HOURS = Decimal("8")

CM_MODES = ("SMV_CPM", "LINE_OUTPUT", "DIRECT")
CPM_BASES = ("EARNED_MIN", "AVAILABLE_MIN")
DIRECT_CM_BASES = ("PER_DOZEN", "PER_PIECE")
COST_BASES = ("PER_DOZEN", "PER_PIECE", "PER_ORDER")
MARGIN_METHODS = ("MARKUP_ON_COST", "MARGIN_ON_FOB")


class CostingCalcError(ValueError):
    """A business-rule problem in the costing inputs (the router turns it into a 422)."""

    def __init__(self, code: str, message: str, field_name: str | None = None) -> None:
        self.code = code
        self.field_name = field_name
        super().__init__(message)


def q4(value: Decimal) -> Decimal:
    """Quantize once per stored column (Numeric(18, 4))."""
    return value.quantize(FOUR_DP, rounding=ROUND_HALF_UP)


def to_decimal(value: Any, default: Decimal = ZERO) -> Decimal:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return value
    if isinstance(value, str):
        s = value.strip().replace(",", "")
        if not s:
            return default
        return Decimal(s)
    return Decimal(str(value))


# --------------------------------------------------------------------------------------
# Inputs
# --------------------------------------------------------------------------------------
@dataclass(frozen=True)
class MaterialInput:
    consumption_per_dozen: Decimal
    unit_price: Decimal
    wastage_pct: Decimal | None = None
    fx: Decimal = ONE  # line currency -> quotation currency


@dataclass(frozen=True)
class CmInput:
    mode: str | None  # NULL = legacy line inside a new-basis quotation (stored per-piece value kept)
    fx: Decimal = ONE
    smv: Decimal | None = None
    efficiency_pct: Decimal | None = None
    cpm: Decimal | None = None
    cpm_basis: str | None = None
    machines_required: int = 0
    production_per_hour: Decimal | None = None
    working_hours_per_day: Decimal | None = None
    cost_per_machine: Decimal | None = None
    direct_cm_basis: str | None = None
    stored_cost_per_dozen: Decimal | None = None
    stored_cm_per_piece: Decimal | None = None


@dataclass(frozen=True)
class OtherCostInput:
    cost_type: str  # "fixed" | "percentage"
    value: Decimal
    based_on: str = "subtotal"
    cost_basis: str | None = None
    fx: Decimal = ONE


@dataclass(frozen=True)
class CommissionInput:
    mode: str | None = None  # INCLUDE | EXCLUDE
    type: str | None = None  # PERCENTAGE | FIXED
    value: Decimal = ZERO


@dataclass(frozen=True)
class QuotationInput:
    materials: Sequence[MaterialInput] = ()
    manufacturing: Sequence[CmInput] = ()
    other_costs: Sequence[OtherCostInput] = ()
    projected_qty: int = 0
    profit_pct: Decimal = ZERO
    margin_method: str = "MARKUP_ON_COST"
    commission: CommissionInput = field(default_factory=CommissionInput)
    manual_price_per_piece: Decimal | None = None


# --------------------------------------------------------------------------------------
# Results (all unrounded)
# --------------------------------------------------------------------------------------
@dataclass(frozen=True)
class MaterialResult:
    effective_consumption: Decimal
    native_per_dozen: Decimal  # line currency
    amount_per_dozen: Decimal  # quotation currency


@dataclass(frozen=True)
class CmResult:
    cm_per_piece: Decimal  # line currency
    cost_per_dozen: Decimal  # line currency
    production_per_day: Decimal | None  # LINE_OUTPUT only
    daily_line_cost: Decimal | None  # LINE_OUTPUT only
    amount_per_dozen: Decimal  # quotation currency


@dataclass(frozen=True)
class OtherCostResult:
    amount_per_dozen: Decimal  # quotation currency


@dataclass(frozen=True)
class QuotationResult:
    materials: list[MaterialResult]
    manufacturing: list[CmResult]
    other_costs: list[OtherCostResult]
    material_per_dozen: Decimal
    manufacturing_per_dozen: Decimal
    other_per_dozen: Decimal
    total_cost_per_dozen: Decimal
    cost_per_piece: Decimal
    commission_per_dozen: Decimal  # amount that sits inside the price (0 when excluded)
    commission_memo_per_dozen: Decimal  # amount for display even when excluded
    price_per_dozen: Decimal  # buyer price per dozen (before any manual override)
    price_per_piece: Decimal  # buyer price per piece (manual override wins)
    price_is_manual: bool
    margin_pct_effective: Decimal | None  # margin implied by the final price, as % of price (FOB view)


# --------------------------------------------------------------------------------------
# Lines
# --------------------------------------------------------------------------------------
def compute_material(line: MaterialInput) -> MaterialResult:
    if line.consumption_per_dozen < 0 or line.unit_price < 0:
        raise CostingCalcError("COSTING_NEGATIVE_INPUT", "Consumption and unit price cannot be negative.")
    wastage = line.wastage_pct if line.wastage_pct is not None else ZERO
    if wastage < 0 or wastage > Decimal("1000"):
        raise CostingCalcError("COSTING_BAD_WASTAGE", "Wastage % must be between 0 and 1000.", "wastage_pct")
    effective = line.consumption_per_dozen * (ONE + wastage / HUNDRED)
    native = effective * line.unit_price
    return MaterialResult(
        effective_consumption=effective,
        native_per_dozen=native,
        amount_per_dozen=native * line.fx,
    )


def compute_cm(line: CmInput) -> CmResult:
    mode = line.mode
    daily_cost: Decimal | None = None
    prod_day: Decimal | None = None
    if mode is None:
        # Legacy CM line inside a new-basis quotation: keep the stored per-piece value.
        cm_pc = to_decimal(line.stored_cm_per_piece)
        if cm_pc == 0 and line.stored_cost_per_dozen:
            cm_pc = to_decimal(line.stored_cost_per_dozen) / TWELVE
    elif mode == "SMV_CPM":
        smv = to_decimal(line.smv)
        cpm = to_decimal(line.cpm)
        if smv < 0 or cpm < 0:
            raise CostingCalcError("COSTING_NEGATIVE_INPUT", "SMV and CPM cannot be negative.")
        basis = line.cpm_basis
        if basis not in CPM_BASES:
            raise CostingCalcError(
                "CM_CPM_BASIS_REQUIRED",
                "Choose how the CPM was measured (earned minute or available minute).",
                "cpm_basis",
            )
        if basis == "EARNED_MIN":
            cm_pc = smv * cpm
        else:
            eff = to_decimal(line.efficiency_pct)
            if eff <= 0 or eff > Decimal("150"):
                raise CostingCalcError(
                    "CM_EFFICIENCY_INVALID",
                    "Efficiency % must be above 0 and at most 150 when CPM is per available minute.",
                    "efficiency_pct",
                )
            cm_pc = (smv / (eff / HUNDRED)) * cpm
    elif mode == "LINE_OUTPUT":
        pph = to_decimal(line.production_per_hour)
        hours = to_decimal(line.working_hours_per_day, DEFAULT_WORKING_HOURS) or DEFAULT_WORKING_HOURS
        machines = Decimal(max(0, int(line.machines_required or 0)))
        cost_machine = to_decimal(line.cost_per_machine)
        if pph < 0 or cost_machine < 0:
            raise CostingCalcError("COSTING_NEGATIVE_INPUT", "Line output and machine cost cannot be negative.")
        if hours <= 0 or hours > Decimal("24"):
            raise CostingCalcError(
                "CM_HOURS_INVALID", "Working hours per day must be above 0 and at most 24.", "working_hours_per_day"
            )
        # Line output is the output of the WHOLE line, so it is never multiplied by machines.
        prod_day = pph * hours
        daily_cost = machines * cost_machine
        if daily_cost > 0 and prod_day <= 0:
            raise CostingCalcError(
                "CM_LINE_OUTPUT_REQUIRED",
                "Enter the line output per hour (above 0) to cost a line.",
                "production_per_hour",
            )
        cm_pc = daily_cost / prod_day if prod_day > 0 else ZERO
    elif mode == "DIRECT":
        basis = line.direct_cm_basis or "PER_DOZEN"
        if basis not in DIRECT_CM_BASES:
            raise CostingCalcError("CM_DIRECT_BASIS_INVALID", "Direct CM must be per dozen or per piece.", "direct_cm_basis")
        if basis == "PER_DOZEN":
            value = to_decimal(line.stored_cost_per_dozen)
            if value < 0:
                raise CostingCalcError("COSTING_NEGATIVE_INPUT", "CM cannot be negative.")
            cm_pc = value / TWELVE
        else:
            cm_pc = to_decimal(line.stored_cm_per_piece)
            if cm_pc < 0:
                raise CostingCalcError("COSTING_NEGATIVE_INPUT", "CM cannot be negative.")
    else:
        raise CostingCalcError("CM_MODE_INVALID", f"Unknown CM mode: {mode}", "cm_mode")
    cost_dz = cm_pc * TWELVE
    return CmResult(
        cm_per_piece=cm_pc,
        cost_per_dozen=cost_dz,
        production_per_day=prod_day,
        daily_line_cost=daily_cost,
        amount_per_dozen=cost_dz * line.fx,
    )


def compute_other_cost(
    line: OtherCostInput,
    *,
    material_per_dozen: Decimal,
    manufacturing_per_dozen: Decimal,
    projected_qty: int,
) -> OtherCostResult:
    """Percentage rows use a per-dozen base of materials, CM, or materials+CM (never other-cost rows)."""
    if line.value < 0:
        raise CostingCalcError("COSTING_NEGATIVE_INPUT", "Other-cost value cannot be negative.")
    if str(line.cost_type or "fixed").strip().lower() == "percentage":
        based = str(line.based_on or "subtotal").strip().lower()
        if based in ("materials", "material"):
            base = material_per_dozen
        elif based in ("manufacturing", "cm", "labor"):
            base = manufacturing_per_dozen
        else:
            base = material_per_dozen + manufacturing_per_dozen
        base = max(ZERO, base)
        return OtherCostResult(amount_per_dozen=base * line.value / HUNDRED)
    basis = line.cost_basis or "PER_ORDER"  # legacy fixed rows were order totals
    if basis not in COST_BASES:
        raise CostingCalcError("OTHER_COST_BASIS_INVALID", "Other-cost basis is not valid.", "cost_basis")
    amount = line.value * line.fx
    if basis == "PER_DOZEN":
        return OtherCostResult(amount_per_dozen=amount)
    if basis == "PER_PIECE":
        return OtherCostResult(amount_per_dozen=amount * TWELVE)
    if projected_qty <= 0:
        raise CostingCalcError(
            "OTHER_COST_NEEDS_QUANTITY",
            "A per-order fixed cost needs an expected quantity above 0. Use per dozen or per piece instead.",
            "cost_basis",
        )
    return OtherCostResult(amount_per_dozen=amount / Decimal(projected_qty) * TWELVE)


# --------------------------------------------------------------------------------------
# Pricing
# --------------------------------------------------------------------------------------
def _fixed_commission_per_dozen(commission: CommissionInput, qty: int) -> Decimal:
    if qty <= 0:
        raise CostingCalcError(
            "COMMISSION_NEEDS_QUANTITY",
            "A fixed commission is for the whole order, so the expected quantity must be above 0.",
            "projected_quantity",
        )
    return commission.value / Decimal(qty) * TWELVE


def price_per_dozen(
    *,
    cost_per_dozen: Decimal,
    profit_pct: Decimal,
    margin_method: str,
    commission: CommissionInput,
    projected_qty: int,
) -> tuple[Decimal, Decimal, Decimal]:
    """Return (price_per_dozen, commission_inside_price_per_dozen, commission_memo_per_dozen)."""
    if margin_method not in MARGIN_METHODS:
        raise CostingCalcError("MARGIN_METHOD_INVALID", "Margin method is not valid.", "margin_method")
    m = profit_pct / HUNDRED
    mode = str(commission.mode or "EXCLUDE").strip().upper()
    ctype = str(commission.type or "").strip().upper()
    included = mode == "INCLUDE"
    pct_c = ZERO
    fixed_dz = ZERO
    if ctype == "PERCENTAGE" and commission.value > 0:
        pct_c = commission.value / HUNDRED
    elif ctype == "FIXED" and commission.value > 0:
        # An excluded fixed commission never enters the price, so a missing quantity only matters when included.
        if included or projected_qty > 0:
            fixed_dz = _fixed_commission_per_dozen(commission, projected_qty)

    if margin_method == "MARKUP_ON_COST":
        if ONE + m <= 0:
            raise CostingCalcError("MARGIN_INVALID", "Markup % must be greater than -100.", "profit_percentage")
        before_comm = cost_per_dozen * (ONE + m)
        memo = pct_c * before_comm + fixed_dz
        inside = memo if included else ZERO
        return before_comm + inside, inside, memo

    # MARGIN_ON_FOB: margin and a percentage commission are shares of the buyer (FOB) price.
    if included and pct_c > 0:
        denominator = ONE - m - pct_c
        if denominator <= MIN_FOB_DENOMINATOR:
            raise CostingCalcError(
                "MARGIN_ON_FOB_DENOMINATOR",
                "Margin % plus commission % is too high (must stay below 99% of the price).",
                "profit_percentage",
            )
        price = cost_per_dozen / denominator
        return price, pct_c * price, pct_c * price
    denominator = ONE - m
    if denominator <= MIN_FOB_DENOMINATOR:
        raise CostingCalcError(
            "MARGIN_ON_FOB_DENOMINATOR",
            "Margin % is too high (must stay below 99% of the price).",
            "profit_percentage",
        )
    if included and fixed_dz > 0:
        price = (cost_per_dozen + fixed_dz) / denominator
        return price, fixed_dz, fixed_dz
    price = cost_per_dozen / denominator
    # Excluded commission never enters the price; the memo is shown for information.
    memo = pct_c * price + fixed_dz
    return price, ZERO, memo


def compute_quotation(data: QuotationInput) -> QuotationResult:
    if data.projected_qty < 0:
        raise CostingCalcError("QUANTITY_INVALID", "Projected quantity cannot be negative.", "projected_quantity")
    with localcontext() as ctx:
        ctx.prec = 40
        mats = [compute_material(m) for m in data.materials]
        cms = [compute_cm(c) for c in data.manufacturing]
        mat_dz = sum((m.amount_per_dozen for m in mats), ZERO)
        mfg_dz = sum((c.amount_per_dozen for c in cms), ZERO)
        others = [
            compute_other_cost(
                o,
                material_per_dozen=mat_dz,
                manufacturing_per_dozen=mfg_dz,
                projected_qty=data.projected_qty,
            )
            for o in data.other_costs
        ]
        other_dz = sum((o.amount_per_dozen for o in others), ZERO)
        total_dz = mat_dz + mfg_dz + other_dz
        price_dz, comm_inside, comm_memo = price_per_dozen(
            cost_per_dozen=total_dz,
            profit_pct=data.profit_pct,
            margin_method=data.margin_method,
            commission=data.commission,
            projected_qty=data.projected_qty,
        )
        auto_pc = price_dz / TWELVE
        manual = data.manual_price_per_piece
        if manual is not None:
            if manual < 0:
                raise CostingCalcError("PRICE_NEGATIVE", "Quoted price per piece cannot be negative.", "quoted_price_per_piece")
            price_pc = q4(manual)  # what the buyer sees is exactly what was typed
            price_dz_final = price_pc * TWELVE
        else:
            price_pc = auto_pc
            price_dz_final = price_dz
        effective_margin: Decimal | None = None
        if price_dz_final > 0:
            effective_margin = (price_dz_final - total_dz - (comm_inside if manual is None else ZERO)) / price_dz_final * HUNDRED
        return QuotationResult(
            materials=mats,
            manufacturing=cms,
            other_costs=others,
            material_per_dozen=mat_dz,
            manufacturing_per_dozen=mfg_dz,
            other_per_dozen=other_dz,
            total_cost_per_dozen=total_dz,
            cost_per_piece=total_dz / TWELVE,
            commission_per_dozen=comm_inside,
            commission_memo_per_dozen=comm_memo,
            price_per_dozen=price_dz_final,
            price_per_piece=price_pc,
            price_is_manual=manual is not None,
            margin_pct_effective=effective_margin,
        )
