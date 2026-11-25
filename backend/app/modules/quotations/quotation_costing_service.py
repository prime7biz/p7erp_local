"""Apply the dozen-first costing engine to a saved quotation (flag ``quotation_costing_accuracy_v1``).

The router saves the child rows first, then calls :func:`apply_dozen_first_costing`, which reads ALL
cost rows back from the database (so a partial PUT still prices the whole quotation), runs the
Decimal calculator and writes the derived columns on the rows and the quotation header.

Never call this for a legacy quotation (``costing_basis IS NULL``).
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Quotation,
    QuotationManufacturing,
    QuotationMaterial,
    QuotationOtherCost,
)
from app.modules.quotations.quotation_commercial_money import line_fx_to_quotation_multiplier
from app.modules.quotations.quotation_costing_calculator import (
    CostingCalcError,
    CmInput,
    CommissionInput,
    MaterialInput,
    OtherCostInput,
    QuotationInput,
    QuotationResult,
    TWELVE,
    ZERO,
    compute_quotation,
    q4,
    to_decimal,
)

COSTING_BASIS_PER_DOZEN = "PER_DOZEN"
DEFAULT_MARGIN_METHOD = "MARKUP_ON_COST"


def _line_fx(quotation: Quotation, row) -> Decimal:
    return line_fx_to_quotation_multiplier(
        document_currency=quotation.currency,
        line_currency=row.currency,
        exchange_rate=row.exchange_rate,
    )


async def _load_rows(db: AsyncSession, *, tenant_id: int, quotation_id: int):
    mats = (
        await db.execute(
            select(QuotationMaterial)
            .where(QuotationMaterial.quotation_id == quotation_id, QuotationMaterial.tenant_id == tenant_id)
            .order_by(QuotationMaterial.serial_no, QuotationMaterial.id)
        )
    ).scalars().all()
    cms = (
        await db.execute(
            select(QuotationManufacturing)
            .where(
                QuotationManufacturing.quotation_id == quotation_id,
                QuotationManufacturing.tenant_id == tenant_id,
            )
            .order_by(QuotationManufacturing.serial_no, QuotationManufacturing.id)
        )
    ).scalars().all()
    others = (
        await db.execute(
            select(QuotationOtherCost)
            .where(QuotationOtherCost.quotation_id == quotation_id, QuotationOtherCost.tenant_id == tenant_id)
            .order_by(QuotationOtherCost.serial_no, QuotationOtherCost.id)
        )
    ).scalars().all()
    return list(mats), list(cms), list(others)


def build_input(
    quotation: Quotation,
    materials: list[QuotationMaterial],
    manufacturing: list[QuotationManufacturing],
    other_costs: list[QuotationOtherCost],
    *,
    manual_price_per_piece: Decimal | None,
) -> QuotationInput:
    return QuotationInput(
        materials=[
            MaterialInput(
                consumption_per_dozen=to_decimal(m.consumption_per_dozen),
                unit_price=to_decimal(m.unit_price),
                wastage_pct=to_decimal(m.wastage_pct) if m.wastage_pct is not None else None,
                fx=_line_fx(quotation, m),
            )
            for m in materials
        ],
        manufacturing=[
            CmInput(
                mode=c.cm_mode,
                fx=_line_fx(quotation, c),
                smv=to_decimal(c.smv) if c.smv is not None else None,
                efficiency_pct=to_decimal(c.efficiency_pct) if c.efficiency_pct is not None else None,
                cpm=to_decimal(c.cpm) if c.cpm is not None else None,
                cpm_basis=c.cpm_basis,
                machines_required=int(c.machines_required or 0),
                production_per_hour=to_decimal(c.production_per_hour),
                working_hours_per_day=(
                    to_decimal(c.working_hours_per_day) if c.working_hours_per_day is not None else None
                ),
                cost_per_machine=to_decimal(c.cost_per_machine),
                direct_cm_basis=c.direct_cm_basis,
                stored_cost_per_dozen=to_decimal(c.cost_per_dozen),
                stored_cm_per_piece=to_decimal(c.cm_per_piece),
            )
            for c in manufacturing
        ],
        other_costs=[
            OtherCostInput(
                cost_type=str(o.cost_type or "fixed"),
                value=to_decimal(o.value),
                based_on=o.based_on or "subtotal",
                cost_basis=o.cost_basis,
                fx=_line_fx(quotation, o),
            )
            for o in other_costs
        ],
        projected_qty=int(quotation.projected_quantity or 0),
        profit_pct=to_decimal(quotation.profit_percentage),
        margin_method=quotation.margin_method or DEFAULT_MARGIN_METHOD,
        commission=CommissionInput(
            mode=quotation.commission_mode,
            type=quotation.commission_type,
            value=to_decimal(quotation.commission_value),
        ),
        manual_price_per_piece=manual_price_per_piece,
    )


def _write_results(
    quotation: Quotation,
    materials: list[QuotationMaterial],
    manufacturing: list[QuotationManufacturing],
    other_costs: list[QuotationOtherCost],
    result: QuotationResult,
) -> None:
    qty = Decimal(int(quotation.projected_quantity or 0))
    dozens = qty / TWELVE

    for row, res in zip(materials, result.materials):
        row.amount_per_dozen = q4(res.amount_per_dozen)
        row.total_amount = q4(res.amount_per_dozen * dozens)
        row.base_amount = q4(res.native_per_dozen * dozens)

    for row, res in zip(manufacturing, result.manufacturing):
        row.cost_per_dozen = q4(res.cost_per_dozen)
        row.cm_per_piece = q4(res.cm_per_piece)
        row.total_order_cost = q4(res.cm_per_piece * qty)
        row.base_amount = row.total_order_cost
        if res.production_per_day is not None:
            row.production_per_day = res.production_per_day.quantize(Decimal("0.000001"))
            row.total_line_cost = q4(res.daily_line_cost or ZERO)

    for row, res in zip(other_costs, result.other_costs):
        order_total_quotation_ccy = res.amount_per_dozen * dozens
        if str(row.cost_type or "fixed").strip().lower() == "percentage":
            amount = order_total_quotation_ccy  # percentage rows are already in the quotation currency
        else:
            # Fixed rows are stored in the line currency; the multiplier is 1 when it equals the quotation's.
            amount = order_total_quotation_ccy / _line_fx(quotation, row)
        row.calculated_amount = q4(amount)
        row.total_amount = q4(amount)

    quotation.material_cost_per_dozen = q4(result.material_per_dozen)
    quotation.manufacturing_cost_per_dozen = q4(result.manufacturing_per_dozen)
    quotation.other_cost_per_dozen = q4(result.other_per_dozen)
    quotation.total_cost_per_dozen = q4(result.total_cost_per_dozen)
    quotation.quoted_price_per_dozen = q4(result.price_per_dozen)
    quotation.quoted_price_per_piece = q4(result.price_per_piece)

    # Legacy order-total columns stay populated for older readers (0, not NULL, while the quantity is 0 / TBD).
    quotation.material_cost = q4(result.material_per_dozen * dozens)
    quotation.manufacturing_cost = q4(result.manufacturing_per_dozen * dozens)
    quotation.other_cost = q4(result.other_per_dozen * dozens)
    quotation.total_cost = q4(result.total_cost_per_dozen * dozens)
    quotation.cost_per_piece = q4(result.cost_per_piece)
    order_total = q4(result.price_per_piece * qty)
    quotation.quoted_price = order_total
    quotation.total_amount = order_total


async def apply_dozen_first_costing(
    db: AsyncSession,
    *,
    tenant_id: int,
    quotation: Quotation,
    manual_price_per_piece: Decimal | None,
) -> QuotationResult:
    """Recompute and store everything for a PER_DOZEN quotation. Raises HTTP 422 on a business-rule error."""
    quotation.costing_basis = COSTING_BASIS_PER_DOZEN
    if not quotation.margin_method:
        quotation.margin_method = DEFAULT_MARGIN_METHOD
    if not quotation.fixed_commission_basis:
        quotation.fixed_commission_basis = "PER_ORDER"
    materials, manufacturing, other_costs = await _load_rows(db, tenant_id=tenant_id, quotation_id=quotation.id)
    data = build_input(
        quotation,
        materials,
        manufacturing,
        other_costs,
        manual_price_per_piece=manual_price_per_piece,
    )
    try:
        result = compute_quotation(data)
    except CostingCalcError as exc:
        detail: dict = {"code": exc.code, "message": str(exc)}
        if exc.field_name:
            detail["field"] = exc.field_name
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail) from exc
    _write_results(quotation, materials, manufacturing, other_costs, result)
    return result
