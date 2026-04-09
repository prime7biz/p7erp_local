"""
Seed QR-verified inventory documents demo: 10 delivery challans, 10 gate passes,
10 GRNs, 10 production material issues, 10 process orders, 10 warehouse transfers.

Idempotent: skips if challan QR-DEMO-DC-01 already exists for the tenant.

Prerequisites for the tenant (company_code):
  - At least 2 warehouses and 1 item (e.g. seed_lakhsma_interconnected_demo + inventory demo)
  - At least 1 BOM with ≥1 BOM line (for PMI rows)

Run inside Docker (from repo root):
  docker compose exec backend alembic upgrade head
  docker compose exec backend python scripts/seed_document_qr_demo.py --company-code LAKH806201

The script runs inventory signature backfill once after insert (same logic as
POST /api/v1/inventory/documents/backfill-signatures).

Vouchers: call authenticated POST /api/v1/finance/vouchers/backfill-signatures when needed.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.inventory import (  # noqa: E402
    DeliveryChallan,
    DeliveryChallanItem,
    EnhancedGatePass,
    GoodsReceiving,
    GoodsReceivingItem,
    Item,
    ProcessOrder,
    ProcessOrderCostLine,
    ProductionMaterialIssue,
    ProductionMaterialIssueLine,
    Warehouse,
    WarehouseTransfer,
    WarehouseTransferLine,
)
from app.models.merch import Bom, BomItem, Order  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.modules.inventory.document_qr_service import (  # noqa: E402
    backfill_signatures_for_tenant,
    sign_delivery_challan,
    sign_gate_pass,
    sign_goods_receiving,
    sign_process_order,
    sign_production_material_issue,
    sign_warehouse_transfer,
)

DEFAULT_COMPANY_CODE = "LAKH806201"
MARKER_CHALLAN = "QR-DEMO-DC-01"


def _dc_statuses() -> list[str]:
    return ["DRAFT"] * 3 + ["SUBMITTED"] * 2 + ["APPROVED"] * 2 + ["POSTED"] * 3


def _gp_statuses() -> list[str]:
    return ["DRAFT"] * 3 + ["SUBMITTED"] * 2 + ["APPROVED"] * 2 + ["RELEASED"] * 3


def _grn_statuses() -> list[str]:
    return ["DRAFT"] * 6 + ["RECEIVED"] * 4


def _pmi_statuses() -> list[str]:
    return ["DRAFT"] * 4 + ["POSTED"] * 6


def _po_statuses() -> list[str]:
    return ["DRAFT"] * 4 + ["ISSUED"] * 2 + ["RECEIVED"] * 3 + ["APPROVED"] * 1


def _wt_statuses() -> list[str]:
    return ["DRAFT"] * 6 + ["POSTED"] * 4


async def seed_document_qr_demo(company_code: str) -> dict[str, int]:
    async with AsyncSessionLocal() as db:
        tenant = (
            await db.execute(select(Tenant).where(Tenant.company_code == company_code.strip().upper()))
        ).scalar_one_or_none()
        if tenant is None:
            raise ValueError(f"Tenant not found for company_code={company_code!r}")

        existing = (
            await db.execute(
                select(DeliveryChallan).where(
                    DeliveryChallan.tenant_id == tenant.id,
                    DeliveryChallan.challan_code == MARKER_CHALLAN,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            print(f"Already seeded ({MARKER_CHALLAN} exists). Skipping.")
            return {}

        wh_rows = list(
            (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant.id).limit(5)))
            .scalars()
            .all()
        )
        if len(wh_rows) < 2:
            raise ValueError("Need at least 2 warehouses for this seed.")

        item_rows = list(
            (await db.execute(select(Item).where(Item.tenant_id == tenant.id).limit(5))).scalars().all()
        )
        if len(item_rows) < 1:
            raise ValueError("Need at least 1 item for this seed.")

        wh_a, wh_b = wh_rows[0], wh_rows[1]
        it_a = item_rows[0]
        it_b = item_rows[1] if len(item_rows) > 1 else item_rows[0]

        bom_row = (
            await db.execute(
                select(Bom)
                .where(Bom.tenant_id == tenant.id)
                .order_by(Bom.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if bom_row is None or bom_row.order_id is None:
            raise ValueError("Need at least one BOM linked to an order (bom.order_id) for PMI rows.")

        bom_line = (
            await db.execute(
                select(BomItem)
                .where(BomItem.tenant_id == tenant.id, BomItem.bom_id == bom_row.id, BomItem.item_id.is_not(None))
                .limit(1)
            )
        ).scalar_one_or_none()
        if bom_line is None or bom_line.item_id is None:
            raise ValueError("Need at least one BOM line with item_id for PMI rows.")

        order_row = await db.get(Order, bom_row.order_id)
        if order_row is None or order_row.tenant_id != tenant.id:
            raise ValueError("BOM order not found for tenant.")

        counts: dict[str, int] = {}

        # --- Delivery challans ---
        dc_rows: list[DeliveryChallan] = []
        st_dc = _dc_statuses()
        for i in range(1, 11):
            code = f"QR-DEMO-DC-{i:02d}"
            dc = DeliveryChallan(
                tenant_id=tenant.id,
                challan_code=code,
                customer_name=f"QR Demo Customer {i}",
                delivery_date=date.today() - timedelta(days=i),
                status=st_dc[i - 1],
                notes="seed_document_qr_demo",
            )
            db.add(dc)
            await db.flush()
            db.add(
                DeliveryChallanItem(
                    tenant_id=tenant.id,
                    challan_id=dc.id,
                    item_id=it_a.id,
                    warehouse_id=wh_a.id,
                    quantity="1",
                )
            )
            dc_rows.append(dc)
        await db.flush()
        counts["delivery_challans"] = 10

        for dc in dc_rows:
            if dc.status in {"APPROVED", "POSTED"}:
                lines = list(
                    (
                        await db.execute(
                            select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == dc.id)
                        )
                    )
                    .scalars()
                    .all()
                )
                sign_delivery_challan(dc, lines, [])

        # --- Gate passes (link to matching-index challan when possible) ---
        st_gp = _gp_statuses()
        for i in range(1, 11):
            code = f"QR-DEMO-GP-{i:02d}"
            gp = EnhancedGatePass(
                tenant_id=tenant.id,
                gate_pass_code=code,
                challan_id=dc_rows[i - 1].id,
                purpose="QR demo outbound",
                destination="Main gate",
                vehicle_no=f"QD-{i:02d}-AA",
                status=st_gp[i - 1],
                guard_acknowledged=st_gp[i - 1] == "RELEASED",
                notes="seed_document_qr_demo",
            )
            db.add(gp)
            await db.flush()
            if gp.status == "RELEASED":
                sign_gate_pass(gp)
        counts["gate_passes"] = 10

        # --- GRNs ---
        st_grn = _grn_statuses()
        for i in range(1, 11):
            code = f"QR-DEMO-GRN-{i:02d}"
            grn = GoodsReceiving(
                tenant_id=tenant.id,
                grn_code=code,
                received_date=date.today() - timedelta(days=i),
                status=st_grn[i - 1],
                notes="seed_document_qr_demo",
                default_warehouse_id=wh_a.id,
            )
            db.add(grn)
            await db.flush()
            gi = GoodsReceivingItem(
                tenant_id=tenant.id,
                goods_receiving_id=grn.id,
                item_id=it_a.id,
                warehouse_id=wh_a.id,
                quantity="2",
                accepted_qty="2",
                received_qty="2",
            )
            db.add(gi)
            await db.flush()
            if grn.status == "RECEIVED":
                sign_goods_receiving(grn, [gi])
        counts["goods_receiving"] = 10

        # --- Production material issues ---
        st_pmi = _pmi_statuses()
        stages = ["CUTTING", "SEWING", "FINISHING", "PACKING"]
        for i in range(1, 11):
            code = f"QR-DEMO-PMI-{i:02d}"
            pmi = ProductionMaterialIssue(
                tenant_id=tenant.id,
                issue_code=code,
                order_id=order_row.id,
                bom_id=bom_row.id,
                production_stage=stages[(i - 1) % len(stages)],
                covered_order_qty=max(1, i),
                warehouse_id=wh_a.id,
                issue_date=date.today() - timedelta(days=i),
                status=st_pmi[i - 1],
                notes="seed_document_qr_demo (demo-only lines; may not reflect stock moves)",
            )
            db.add(pmi)
            await db.flush()
            ln = ProductionMaterialIssueLine(
                tenant_id=tenant.id,
                issue_id=pmi.id,
                bom_line_id=bom_line.id,
                item_id=int(bom_line.item_id),
                actual_issue_qty="0.25",
                standard_qty_for_covered="0.25",
            )
            db.add(ln)
            await db.flush()
            if pmi.status == "POSTED":
                sign_production_material_issue(pmi, [ln])
        counts["production_material_issues"] = 10

        # --- Process orders ---
        st_po = _po_statuses()
        for i in range(1, 11):
            code = f"QR-DEMO-PR-{i:02d}"
            po = ProcessOrder(
                tenant_id=tenant.id,
                process_number=code,
                process_type="DYEING",
                process_method="in_house",
                linked_order_id=order_row.id,
                warehouse_id=wh_a.id,
                output_warehouse_id=wh_b.id,
                input_item_id=it_a.id,
                output_item_id=it_b.id,
                input_quantity="10",
                expected_output_qty="9",
                actual_output_qty="8.5" if st_po[i - 1] in {"RECEIVED", "APPROVED"} else None,
                processing_charges="100" if st_po[i - 1] in {"RECEIVED", "APPROVED"} else "0",
                status=st_po[i - 1],
                remarks="seed_document_qr_demo",
                source_order_id=order_row.id,
                source_bom_id=bom_row.id,
            )
            db.add(po)
            await db.flush()
            if st_po[i - 1] in {"ISSUED", "RECEIVED", "APPROVED"}:
                cl = ProcessOrderCostLine(
                    tenant_id=tenant.id,
                    process_order_id=po.id,
                    cost_type="ADD_ON",
                    description="Demo processing",
                    amount="50",
                )
                db.add(cl)
                await db.flush()
                cost_lines = list(
                    (
                        await db.execute(
                            select(ProcessOrderCostLine).where(ProcessOrderCostLine.process_order_id == po.id)
                        )
                    )
                    .scalars()
                    .all()
                )
                sign_process_order(po, cost_lines)
        counts["process_orders"] = 10

        # --- Warehouse transfers ---
        st_wt = _wt_statuses()
        for i in range(1, 11):
            code = f"QR-DEMO-WT-{i:02d}"
            wt = WarehouseTransfer(
                tenant_id=tenant.id,
                transfer_code=code,
                from_warehouse_id=wh_a.id,
                to_warehouse_id=wh_b.id,
                transfer_date=date.today() - timedelta(days=i),
                status=st_wt[i - 1],
                notes="seed_document_qr_demo",
            )
            db.add(wt)
            await db.flush()
            wline = WarehouseTransferLine(
                tenant_id=tenant.id,
                transfer_id=wt.id,
                item_id=it_a.id,
                quantity="1",
            )
            db.add(wline)
            await db.flush()
            if wt.status == "POSTED":
                sign_warehouse_transfer(wt, [wline])
        counts["warehouse_transfers"] = 10

        await db.commit()

    # Second session: backfill any unsigned rows in eligible statuses (no-op if all signed).
    async with AsyncSessionLocal() as db2:
        bf = await backfill_signatures_for_tenant(db2, tenant.id)
        counts["backfill"] = sum(bf.values())

    print(f"Seeded QR demo documents for tenant {company_code!r}.")
    for k, v in counts.items():
        print(f"  {k}: {v}")
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed QR-verified inventory document demo rows.")
    parser.add_argument(
        "--company-code",
        default=DEFAULT_COMPANY_CODE,
        help=f"Tenant company_code (default: {DEFAULT_COMPANY_CODE}).",
    )
    args = parser.parse_args()
    try:
        asyncio.run(seed_document_qr_demo(args.company_code))
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        raise SystemExit(1) from e


if __name__ == "__main__":
    main()
