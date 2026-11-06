"""Sales kits / bundling (Sprint I4)."""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.codegen import next_tenant_code
from app.common.tenant_feature_keys import is_kitting_enabled
from app.models import Tenant
from app.models.costing import Item
from app.models.inventory import ItemKit, ItemKitComponent, StockMovement, Warehouse
from app.services.fifo_inventory import finalize_movement_fifo

logger = logging.getLogger(__name__)

ZERO = Decimal("0")
Q4 = Decimal("0.0001")


def _d(v: Any) -> Decimal:
    if v is None:
        return ZERO
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except Exception:
        return ZERO


def _q(v: Decimal) -> Decimal:
    return v.quantize(Q4, rounding=ROUND_HALF_UP)


async def list_kits(db: AsyncSession, tenant_id: int, *, active_only: bool = True) -> list[ItemKit]:
    q = select(ItemKit).where(ItemKit.tenant_id == tenant_id)
    if active_only:
        q = q.where(ItemKit.is_active.is_(True))
    return list((await db.execute(q.order_by(ItemKit.kit_code))).scalars().all())


async def get_kit_components(db: AsyncSession, tenant_id: int, kit_id: int) -> list[ItemKitComponent]:
    return list(
        (
            await db.execute(
                select(ItemKitComponent).where(
                    ItemKitComponent.tenant_id == tenant_id,
                    ItemKitComponent.kit_id == kit_id,
                )
            )
        )
        .scalars()
        .all()
    )


async def create_kit(
    db: AsyncSession,
    tenant: Tenant,
    *,
    kit_code: str | None,
    name: str,
    kit_price: Decimal,
    components: list[dict[str, Any]],
    notes: str | None = None,
) -> ItemKit:
    if not is_kitting_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Kitting is disabled")
    code = (kit_code or "").strip() or await next_tenant_code(
        db, model=ItemKit, tenant_id=tenant.id, prefix="KIT-", width=4
    )
    kit = ItemKit(
        tenant_id=tenant.id,
        kit_code=code,
        name=name.strip(),
        kit_price=_q(_d(kit_price)),
        notes=notes,
        is_active=True,
    )
    db.add(kit)
    await db.flush()
    await _replace_components(db, tenant.id, kit.id, components)
    return kit


async def update_kit(
    db: AsyncSession,
    tenant: Tenant,
    kit_id: int,
    *,
    name: str | None = None,
    kit_price: Decimal | None = None,
    is_active: bool | None = None,
    notes: str | None = None,
    components: list[dict[str, Any]] | None = None,
) -> ItemKit:
    if not is_kitting_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Kitting is disabled")
    kit = await db.get(ItemKit, kit_id)
    if not kit or kit.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Kit not found")
    if name is not None:
        kit.name = name.strip()
    if kit_price is not None:
        kit.kit_price = _q(_d(kit_price))
    if is_active is not None:
        kit.is_active = is_active
    if notes is not None:
        kit.notes = notes
    kit.updated_at = datetime.utcnow()
    if components is not None:
        await _replace_components(db, tenant.id, kit.id, components)
    await db.flush()
    return kit


async def _replace_components(
    db: AsyncSession,
    tenant_id: int,
    kit_id: int,
    components: list[dict[str, Any]],
) -> None:
    existing = await get_kit_components(db, tenant_id, kit_id)
    for e in existing:
        await db.delete(e)
    await db.flush()
    for c in components:
        item_id = int(c["item_id"])
        qty = _q(_d(c.get("quantity") or 1))
        if qty <= ZERO:
            continue
        item = await db.get(Item, item_id)
        if not item or item.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail=f"Invalid component item {item_id}")
        db.add(
            ItemKitComponent(
                tenant_id=tenant_id,
                kit_id=kit_id,
                item_id=item_id,
                quantity=qty,
            )
        )
    await db.flush()


async def kit_cost_comparison(db: AsyncSession, tenant_id: int, kit_id: int) -> dict[str, Any]:
    kit = await db.get(ItemKit, kit_id)
    if not kit or kit.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Kit not found")
    comps = await get_kit_components(db, tenant_id, kit_id)
    lines = []
    total_cost = ZERO
    for c in comps:
        item = await db.get(Item, c.item_id)
        unit = _d(item.avg_cost) if item else ZERO
        if unit <= ZERO and item:
            unit = _d(item.default_cost)
        line_cost = _q(_d(c.quantity) * unit)
        total_cost += line_cost
        lines.append(
            {
                "item_id": c.item_id,
                "item_code": item.item_code if item else None,
                "item_name": item.name if item else None,
                "quantity": str(_q(_d(c.quantity))),
                "unit_cost": str(_q(unit)),
                "line_cost": str(line_cost),
            }
        )
    price = _d(kit.kit_price)
    margin = _q(price - total_cost)
    return {
        "kit_id": kit.id,
        "kit_code": kit.kit_code,
        "name": kit.name,
        "kit_price": str(_q(price)),
        "component_cost": str(_q(total_cost)),
        "margin": str(margin),
        "margin_pct": round(float((margin / price) * 100), 2) if price > ZERO else 0.0,
        "components": lines,
    }


async def create_kit_order(
    db: AsyncSession,
    tenant: Tenant,
    *,
    kit_id: int,
    qty: Decimal,
    warehouse_id: int,
) -> dict[str, Any]:
    """
    Explode kit to components, deduct component stock, return kit line + explosion.
    Does not create a sales document — returns payload for order/DC builders.
    """
    if not is_kitting_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Kitting is disabled")
    kit = await db.get(ItemKit, kit_id)
    if not kit or kit.tenant_id != tenant.id or not kit.is_active:
        raise HTTPException(status_code=404, detail="Kit not found")
    kits_qty = _q(_d(qty))
    if kits_qty <= ZERO:
        raise HTTPException(status_code=400, detail="qty must be positive")
    wh = await db.get(Warehouse, warehouse_id)
    if not wh or wh.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    comps = await get_kit_components(db, tenant.id, kit_id)
    if not comps:
        raise HTTPException(status_code=400, detail="Kit has no components")

    explosion: list[dict[str, Any]] = []
    for c in comps:
        need = _q(_d(c.quantity) * kits_qty)
        item = await db.get(Item, c.item_id)
        if not item:
            raise HTTPException(status_code=400, detail=f"Component {c.item_id} missing")
        # Availability check via movements
        mvs = list(
            (
                await db.execute(
                    select(StockMovement).where(
                        StockMovement.tenant_id == tenant.id,
                        StockMovement.item_id == c.item_id,
                        StockMovement.warehouse_id == warehouse_id,
                    )
                )
            )
            .scalars()
            .all()
        )
        on_hand = sum((_d(m.quantity) for m in mvs if m.movement_type == "IN"), ZERO) - sum(
            (_d(m.quantity) for m in mvs if m.movement_type == "OUT"), ZERO
        )
        if on_hand + Decimal("0.0001") < need:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {item.item_code}: need {need}, have {_q(on_hand)}",
            )
        out_mv = StockMovement(
            tenant_id=tenant.id,
            item_id=c.item_id,
            warehouse_id=warehouse_id,
            movement_type="OUT",
            quantity=need,
            reference_type="KIT_EXPLODE",
            reference_id=kit.id,
            movement_date=today_local(tenant),
            notes=f"Kit {kit.kit_code} x {kits_qty}",
            movement_kind="KIT_COMPONENT_ISSUE",
        )
        db.add(out_mv)
        await db.flush()
        await finalize_movement_fifo(db, tenant.id, out_mv)
        explosion.append(
            {
                "item_id": c.item_id,
                "item_code": item.item_code,
                "item_name": item.name,
                "qty_per_kit": str(_q(_d(c.quantity))),
                "total_qty": str(need),
                "movement_id": out_mv.id,
            }
        )

    await db.flush()
    return {
        "kit_id": kit.id,
        "kit_code": kit.kit_code,
        "kit_name": kit.name,
        "kit_qty": str(kits_qty),
        "kit_price": str(_q(_d(kit.kit_price))),
        "line_total": str(_q(_d(kit.kit_price) * kits_qty)),
        "warehouse_id": warehouse_id,
        "components": explosion,
    }


async def sell_kit(
    db: AsyncSession,
    tenant: Tenant,
    *,
    kit_id: int,
    qty: Decimal,
    warehouse_id: int,
) -> dict[str, Any]:
    """Alias for create_kit_order — sell deducts components the same way."""
    return await create_kit_order(db, tenant, kit_id=kit_id, qty=qty, warehouse_id=warehouse_id)


async def kit_to_dict(db: AsyncSession, kit: ItemKit) -> dict[str, Any]:
    comps = await get_kit_components(db, kit.tenant_id, kit.id)
    cmp = await kit_cost_comparison(db, kit.tenant_id, kit.id)
    return {
        "id": kit.id,
        "kit_code": kit.kit_code,
        "name": kit.name,
        "kit_price": str(_q(_d(kit.kit_price))),
        "is_active": kit.is_active,
        "notes": kit.notes,
        "component_cost": cmp["component_cost"],
        "margin": cmp["margin"],
        "margin_pct": cmp["margin_pct"],
        "components": [
            {
                "id": c.id,
                "item_id": c.item_id,
                "quantity": str(_q(_d(c.quantity))),
                **next(
                    (
                        {"item_code": x["item_code"], "item_name": x["item_name"], "unit_cost": x["unit_cost"]}
                        for x in cmp["components"]
                        if x["item_id"] == c.item_id
                    ),
                    {},
                ),
            }
            for c in comps
        ],
    }
