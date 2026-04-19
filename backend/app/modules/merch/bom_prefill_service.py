"""Create order-driven BOM draft from quotation materials."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.models import Bom, BomItem, Item, Order, Quotation, QuotationMaterial
from app.modules.merch.bom_line_sync import apply_calculations_to_line


def _safe_float(v: str | Decimal | float | int | None, default: float = 0.0) -> float:
    if v is None:
        return default
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s:
        return default
    try:
        return float(s)
    except (TypeError, ValueError):
        return default


async def create_bom_from_order_prefill(
    db: AsyncSession,
    *,
    tenant_id: int,
    order: Order,
    quotation: Quotation,
) -> tuple[Bom, list[BomItem]]:
    if not quotation.style_id:
        raise ValueError("Quotation has no style_id; cannot create BOM")
    if not order.quantity or int(order.quantity) <= 0:
        raise ValueError("Order quantity must be positive")
    order_qty = int(order.quantity)

    bom_code = await next_tenant_code(
        db,
        model=Bom,
        tenant_id=tenant_id,
        prefix="BOM-",
        width=4,
    )
    bom = Bom(
        tenant_id=tenant_id,
        style_id=int(quotation.style_id),
        order_id=order.id,
        quotation_id=quotation.id,
        version_no=1,
        status="DRAFT",
        is_active=True,
        is_legacy=False,
        bom_code=bom_code,
        customer_id=order.customer_id,
        delivery_date_snapshot=order.delivery_date,
        order_code_snapshot=order.order_code,
        quotation_code_snapshot=quotation.quotation_code,
        order_qty_snapshot=order_qty,
        currency_snapshot=quotation.currency or "USD",
        notes=None,
    )
    db.add(bom)
    await db.flush()

    mat_res = await db.execute(
        select(QuotationMaterial)
        .where(
            QuotationMaterial.tenant_id == tenant_id,
            QuotationMaterial.quotation_id == quotation.id,
        )
        .order_by(QuotationMaterial.serial_no)
    )
    materials = list(mat_res.scalars().all())
    lines: list[BomItem] = []
    for idx, m in enumerate(materials):
        per_dozen = _safe_float(m.consumption_per_dozen)
        net_per_unit = per_dozen / 12.0 if per_dozen else 0.0
        unit_price = _safe_float(m.unit_price)

        item_code = None
        if m.item_id:
            it = await db.get(Item, m.item_id)
            if it and it.tenant_id == tenant_id:
                item_code = it.item_code

        line = BomItem(
            tenant_id=tenant_id,
            bom_id=bom.id,
            item_id=m.item_id,
            quotation_line_id=m.id,
            category="MATERIAL",
            item_code=item_code,
            description=m.description,
            item_code_snapshot=item_code,
            description_snapshot=(m.description or "")[:255] if m.description else None,
            material_type="MATERIAL",
            uom=m.unit,
            base_consumption=Decimal(str(net_per_unit or 0)).quantize(
                Decimal("0.000001"), rounding=ROUND_HALF_UP
            ),
            wastage_pct=None,
            quoted_consumption_per_unit=net_per_unit,
            quoted_unit_price=unit_price,
            quoted_currency=m.currency or "USD",
            process_loss_pct=0,
            bom_net_consumption_per_unit=net_per_unit,
            bom_expected_unit_price=unit_price,
            sort_order=m.serial_no or idx,
        )
        apply_calculations_to_line(line, order_qty)
        db.add(line)
        lines.append(line)

    await db.flush()
    return bom, lines
