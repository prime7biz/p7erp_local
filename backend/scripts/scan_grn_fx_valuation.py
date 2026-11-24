"""Export GRNs whose FIFO layer unit cost may ignore PO FX (INV-02 historic scan).

Run:
  docker compose exec backend python scripts/scan_grn_fx_valuation.py [--tenant-id N]

Prints CSV to stdout: tenant_id,grn_id,grn_code,po_id,currency,fx,po_unit_price,layer_unit_cost,expected_base_cost,delta
Does not modify data. Use the export before any manual reconciliation.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from decimal import Decimal

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import GoodsReceiving, InventoryCostLayer, PurchaseOrder, PurchaseOrderItem, StockMovement


def _d(v) -> Decimal:
    try:
        return Decimal(str(v or "0"))
    except Exception:
        return Decimal("0")


async def main(tenant_id: int | None) -> int:
    async with AsyncSessionLocal() as db:
        po_stmt = select(PurchaseOrder).where(PurchaseOrder.exchange_rate_to_base.is_not(None))
        if tenant_id is not None:
            po_stmt = po_stmt.where(PurchaseOrder.tenant_id == tenant_id)
        pos = list((await db.execute(po_stmt)).scalars().all())
        writer = csv.writer(sys.stdout)
        writer.writerow(
            [
                "tenant_id",
                "grn_id",
                "grn_code",
                "po_id",
                "currency",
                "fx",
                "po_unit_price",
                "layer_unit_cost",
                "expected_base_cost",
                "delta",
            ]
        )
        rows_out = 0
        for po in pos:
            fx = _d(po.exchange_rate_to_base)
            if fx <= 0 or fx == 1:
                continue
            grns = list(
                (
                    await db.execute(
                        select(GoodsReceiving).where(
                            GoodsReceiving.tenant_id == po.tenant_id,
                            GoodsReceiving.purchase_order_id == po.id,
                            GoodsReceiving.status == "RECEIVED",
                        )
                    )
                ).scalars().all()
            )
            for grn in grns:
                mvs = list(
                    (
                        await db.execute(
                            select(StockMovement).where(
                                StockMovement.tenant_id == po.tenant_id,
                                StockMovement.reference_type == "GRN",
                                StockMovement.reference_id == grn.id,
                                StockMovement.movement_type == "IN",
                            )
                        )
                    ).scalars().all()
                )
                for mv in mvs:
                    pl = (
                        await db.execute(
                            select(PurchaseOrderItem).where(
                                PurchaseOrderItem.purchase_order_id == po.id,
                                PurchaseOrderItem.item_id == mv.item_id,
                            )
                        )
                    ).scalars().first()
                    if not pl:
                        continue
                    expected = _d(pl.unit_price) * fx
                    layer = (
                        await db.execute(
                            select(InventoryCostLayer)
                            .where(
                                InventoryCostLayer.tenant_id == po.tenant_id,
                                InventoryCostLayer.source_movement_id == mv.id,
                            )
                            .limit(1)
                        )
                    ).scalars().first()
                    actual = _d(layer.unit_cost) if layer else _d(mv.unit_cost)
                    delta = actual - expected
                    if abs(delta) < Decimal("0.0001"):
                        continue
                    writer.writerow(
                        [
                            po.tenant_id,
                            grn.id,
                            grn.grn_code,
                            po.id,
                            po.currency or "",
                            str(fx),
                            str(pl.unit_price),
                            str(actual),
                            str(expected),
                            str(delta),
                        ]
                    )
                    rows_out += 1
        print(f"# rows_with_fx_delta={rows_out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--tenant-id", type=int, default=None)
    args = p.parse_args()
    raise SystemExit(asyncio.run(main(args.tenant_id)))
