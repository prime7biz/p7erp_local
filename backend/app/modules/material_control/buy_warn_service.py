"""Reuse-Before-Buy + BTB soft warnings (Phase 2A). Never hard-blocks unless Phase 8 flag is on."""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import (
    is_material_commitment_block_v1_enabled,
    is_material_inbound_v2_enabled,
)
from fastapi import HTTPException, status

from app.models import BtbLc, Tenant
from app.models.inventory import InventoryCostLayer, PurchaseOrder, PurchaseOrderItem


async def build_reuse_before_buy(
    db: AsyncSession,
    *,
    tenant_id: int,
    item_ids: list[int],
    limit_per_item: int = 5,
) -> list[dict]:
    """Surface free FIFO layers for items about to be purchased."""
    if not item_ids:
        return []
    uniq = sorted({int(i) for i in item_ids if i})
    rows = list(
        (
            await db.execute(
                select(InventoryCostLayer)
                .where(
                    InventoryCostLayer.tenant_id == tenant_id,
                    InventoryCostLayer.item_id.in_(uniq),
                    InventoryCostLayer.qty_remaining > 0,
                )
                .order_by(InventoryCostLayer.layer_date.asc().nulls_last(), InventoryCostLayer.id.asc())
            )
        ).scalars().all()
    )
    by_item: dict[int, list] = {i: [] for i in uniq}
    for layer in rows:
        bucket = by_item.get(int(layer.item_id))
        if bucket is None or len(bucket) >= limit_per_item:
            continue
        qty = Decimal(str(layer.qty_remaining or 0))
        uc = Decimal(str(layer.unit_cost or 0))
        bucket.append(
            {
                "item_id": int(layer.item_id),
                "cost_layer_id": int(layer.id),
                "warehouse_id": int(layer.warehouse_id) if layer.warehouse_id else None,
                "qty_remaining": str(qty),
                "unit_cost": str(uc),
                "fifo_value": str((qty * uc).quantize(Decimal("0.0001"))),
                "layer_date": layer.layer_date.isoformat() if layer.layer_date else None,
            }
        )
    matches: list[dict] = []
    for item_id, layers in by_item.items():
        if not layers:
            continue
        matches.append({"item_id": item_id, "layers": layers})
    return matches


async def build_btb_warn(
    db: AsyncSession,
    *,
    tenant: Tenant,
    btb_lc_id: int | None,
    source_order_id: int | None = None,
) -> list[dict]:
    """Soft commercial warnings for PO create (missing BTB, missing MSC on BTB, open PO pressure)."""
    if not is_material_inbound_v2_enabled(tenant.feature_flags):
        return []
    warns: list[dict] = []
    if not btb_lc_id:
        warns.append(
            {
                "code": "BTB_MISSING",
                "severity": "warn",
                "message": "No back-to-back LC linked. Link a BTB when this buy is against an export entitlement.",
            }
        )
        return warns
    btb = await db.get(BtbLc, int(btb_lc_id))
    if not btb or btb.tenant_id != tenant.id:
        warns.append(
            {
                "code": "BTB_NOT_FOUND",
                "severity": "warn",
                "message": "Selected BTB LC was not found for this company.",
            }
        )
        return warns
    if btb.master_contract_id is None:
        warns.append(
            {
                "code": "BTB_NO_MASTER",
                "severity": "warn",
                "message": "This BTB LC has no master export contract. Link MSC before realizing documents.",
                "btb_lc_id": btb.id,
            }
        )
    open_po_count = int(
        (
            await db.execute(
                select(func.count())
                .select_from(PurchaseOrder)
                .where(
                    PurchaseOrder.tenant_id == tenant.id,
                    PurchaseOrder.btb_lc_id == btb.id,
                    func.upper(PurchaseOrder.status).in_(("APPROVED", "PARTIAL", "OPEN", "CONFIRMED", "DRAFT")),
                )
            )
        ).scalar_one()
        or 0
    )
    if open_po_count >= 3:
        warns.append(
            {
                "code": "BTB_MANY_OPEN_POS",
                "severity": "info",
                "message": f"This BTB already has {open_po_count} open/draft purchase orders.",
                "btb_lc_id": btb.id,
                "open_po_count": open_po_count,
            }
        )
    if source_order_id:
        linked = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(PurchaseOrderItem)
                    .where(
                        PurchaseOrderItem.tenant_id == tenant.id,
                        PurchaseOrderItem.source_order_id == int(source_order_id),
                    )
                )
            ).scalar_one()
            or 0
        )
        if linked == 0:
            warns.append(
                {
                    "code": "ORDER_NO_PRIOR_PO_LINES",
                    "severity": "info",
                    "message": "No prior PO lines for this order — check Reuse-Before-Buy before buying more.",
                    "order_id": int(source_order_id),
                }
            )
    return warns


def assert_commitment_block_if_enabled(tenant: Tenant, warns: list[dict]) -> None:
    """Phase 8: escalate soft BTB_MISSING / BTB_NO_MASTER to 409 when commitment block flag is on."""
    if not is_material_commitment_block_v1_enabled(tenant.feature_flags):
        return
    hard = {w["code"] for w in warns if w.get("code") in {"BTB_MISSING", "BTB_NO_MASTER", "BTB_NOT_FOUND"}}
    if not hard:
        return
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "MATERIAL_COMMITMENT_BLOCK",
            "message": "Purchase blocked by material commitment policy. Fix BTB / master contract links first.",
            "codes": sorted(hard),
        },
    )
