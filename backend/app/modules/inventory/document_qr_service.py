"""Payload builders, signing, and GL posting lookups for inventory printable documents."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.document_signature import apply_document_signature, verify_payload_against_hash
from app.models.finance import Voucher, VoucherLine
from app.models.inventory import (
    DeliveryChallan,
    DeliveryChallanItem,
    DeliveryChallanOrder,
    EnhancedGatePass,
    GoodsReceiving,
    GoodsReceivingItem,
    InventoryGlPosting,
    ProcessOrder,
    ProcessOrderCostLine,
    ProductionMaterialIssue,
    ProductionMaterialIssueLine,
    StockMovement,
    WarehouseTransfer,
    WarehouseTransferLine,
)


def _d(v: date | datetime | None) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    return v.isoformat()


# --- Payloads (must stay stable for verify; include id for uniqueness) ---


def delivery_challan_payload(
    row: DeliveryChallan,
    items: list[DeliveryChallanItem],
    order_ids: list[int],
) -> dict[str, Any]:
    return {
        "doc": "DELIVERY_CHALLAN",
        "id": row.id,
        "challan_code": row.challan_code,
        "customer_name": row.customer_name,
        "delivery_date": _d(row.delivery_date),
        "status": (row.status or "").upper(),
        "notes": row.notes,
        "lines": sorted(
            [
                {
                    "item_id": ln.item_id,
                    "warehouse_id": ln.warehouse_id,
                    "quantity": str(ln.quantity),
                }
                for ln in items
            ],
            key=lambda x: (x["item_id"], x["warehouse_id"]),
        ),
        "order_ids": sorted(order_ids),
    }


def enhanced_gate_pass_payload(row: EnhancedGatePass) -> dict[str, Any]:
    return {
        "doc": "ENHANCED_GATE_PASS",
        "id": row.id,
        "gate_pass_code": row.gate_pass_code,
        "challan_id": row.challan_id,
        "purpose": row.purpose,
        "destination": row.destination,
        "vehicle_no": row.vehicle_no,
        "status": (row.status or "").upper(),
        "guard_acknowledged": bool(row.guard_acknowledged),
        "notes": row.notes,
    }


def goods_receiving_payload(row: GoodsReceiving, items: list[GoodsReceivingItem]) -> dict[str, Any]:
    return {
        "doc": "GOODS_RECEIVING",
        "id": row.id,
        "grn_code": row.grn_code,
        "status": (row.status or "").upper(),
        "received_date": _d(row.received_date),
        "vendor_id": row.vendor_id,
        "purchase_order_id": row.purchase_order_id,
        "notes": row.notes,
        "lines": sorted(
            [
                {
                    "item_id": ln.item_id,
                    "warehouse_id": ln.warehouse_id,
                    "quantity": str(ln.quantity),
                    "accepted_qty": str(getattr(ln, "accepted_qty", None) or ln.quantity),
                }
                for ln in items
            ],
            key=lambda x: (x["item_id"], x["warehouse_id"]),
        ),
    }


def production_material_issue_payload(
    row: ProductionMaterialIssue,
    lines: list[ProductionMaterialIssueLine],
) -> dict[str, Any]:
    return {
        "doc": "PRODUCTION_MATERIAL_ISSUE",
        "id": row.id,
        "issue_code": row.issue_code,
        "order_id": row.order_id,
        "bom_id": row.bom_id,
        "production_stage": row.production_stage,
        "covered_order_qty": row.covered_order_qty,
        "warehouse_id": row.warehouse_id,
        "status": (row.status or "").upper(),
        "issue_date": _d(row.issue_date),
        "notes": row.notes,
        "lines": sorted(
            [
                {
                    "bom_line_id": ln.bom_line_id,
                    "item_id": ln.item_id,
                    "actual_issue_qty": str(ln.actual_issue_qty),
                }
                for ln in lines
            ],
            key=lambda x: x["bom_line_id"],
        ),
    }


def process_order_payload(row: ProcessOrder, cost_lines: list[ProcessOrderCostLine]) -> dict[str, Any]:
    return {
        "doc": "PROCESS_ORDER",
        "id": row.id,
        "process_number": row.process_number,
        "process_type": row.process_type,
        "status": (row.status or "").upper(),
        "input_item_id": row.input_item_id,
        "output_item_id": row.output_item_id,
        "input_quantity": str(row.input_quantity),
        "expected_output_qty": str(row.expected_output_qty),
        "actual_output_qty": str(row.actual_output_qty) if row.actual_output_qty else None,
        "processing_charges": str(row.processing_charges),
        "warehouse_id": row.warehouse_id,
        "output_warehouse_id": row.output_warehouse_id,
        "cost_lines": sorted(
            [{"cost_type": cl.cost_type, "amount": str(cl.amount)} for cl in cost_lines],
            key=lambda x: (x["cost_type"], x["amount"]),
        ),
    }


def warehouse_transfer_payload(row: WarehouseTransfer, lines: list[WarehouseTransferLine]) -> dict[str, Any]:
    return {
        "doc": "WAREHOUSE_TRANSFER",
        "id": row.id,
        "transfer_code": row.transfer_code,
        "from_warehouse_id": row.from_warehouse_id,
        "to_warehouse_id": row.to_warehouse_id,
        "transfer_date": _d(row.transfer_date),
        "status": (row.status or "").upper(),
        "notes": row.notes,
        "lines": sorted(
            [{"item_id": ln.item_id, "quantity": str(ln.quantity)} for ln in lines],
            key=lambda x: x["item_id"],
        ),
    }


# --- Sign helpers ---


def sign_delivery_challan(row: DeliveryChallan, items: list[DeliveryChallanItem], order_ids: list[int]) -> None:
    apply_document_signature(row, delivery_challan_payload(row, items, order_ids))


def sign_gate_pass(row: EnhancedGatePass) -> None:
    apply_document_signature(row, enhanced_gate_pass_payload(row))


def sign_goods_receiving(row: GoodsReceiving, items: list[GoodsReceivingItem]) -> None:
    apply_document_signature(row, goods_receiving_payload(row, items))


def sign_production_material_issue(row: ProductionMaterialIssue, lines: list[ProductionMaterialIssueLine]) -> None:
    apply_document_signature(row, production_material_issue_payload(row, lines))


def sign_process_order(row: ProcessOrder, cost_lines: list[ProcessOrderCostLine]) -> None:
    apply_document_signature(row, process_order_payload(row, cost_lines))


def sign_warehouse_transfer(row: WarehouseTransfer, lines: list[WarehouseTransferLine]) -> None:
    apply_document_signature(row, warehouse_transfer_payload(row, lines))


# --- Verify: reload payload from DB ---


async def rebuild_payload_for_verify(
    db: AsyncSession,
    tenant_id: int,
    doc_type: str,
    doc_id: int,
) -> dict[str, Any] | None:
    if doc_type == "DELIVERY_CHALLAN":
        row = await db.get(DeliveryChallan, doc_id)
        if not row or row.tenant_id != tenant_id:
            return None
        items = list(
            (await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id)))
            .scalars()
            .all()
        )
        oids = list(
            (
                await db.execute(
                    select(DeliveryChallanOrder.order_id).where(
                        DeliveryChallanOrder.delivery_challan_id == row.id,
                        DeliveryChallanOrder.tenant_id == tenant_id,
                    )
                )
            )
            .scalars()
            .all()
        )
        return delivery_challan_payload(row, items, oids)
    if doc_type == "ENHANCED_GATE_PASS":
        row = await db.get(EnhancedGatePass, doc_id)
        if not row or row.tenant_id != tenant_id:
            return None
        return enhanced_gate_pass_payload(row)
    if doc_type == "GOODS_RECEIVING":
        row = await db.get(GoodsReceiving, doc_id)
        if not row or row.tenant_id != tenant_id:
            return None
        items = list(
            (await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == row.id)))
            .scalars()
            .all()
        )
        return goods_receiving_payload(row, items)
    if doc_type == "PRODUCTION_MATERIAL_ISSUE":
        row = await db.get(ProductionMaterialIssue, doc_id)
        if not row or row.tenant_id != tenant_id:
            return None
        lines = list(
            (
                await db.execute(
                    select(ProductionMaterialIssueLine).where(ProductionMaterialIssueLine.issue_id == row.id)
                )
            )
            .scalars()
            .all()
        )
        return production_material_issue_payload(row, lines)
    if doc_type == "PROCESS_ORDER":
        row = await db.get(ProcessOrder, doc_id)
        if not row or row.tenant_id != tenant_id:
            return None
        cost_lines = list(
            (
                await db.execute(
                    select(ProcessOrderCostLine).where(ProcessOrderCostLine.process_order_id == row.id)
                )
            )
            .scalars()
            .all()
        )
        return process_order_payload(row, cost_lines)
    if doc_type == "WAREHOUSE_TRANSFER":
        row = await db.get(WarehouseTransfer, doc_id)
        if not row or row.tenant_id != tenant_id:
            return None
        lines = list(
            (
                await db.execute(
                    select(WarehouseTransferLine).where(WarehouseTransferLine.transfer_id == row.id)
                )
            )
            .scalars()
            .all()
        )
        return warehouse_transfer_payload(row, lines)
    return None


async def find_doc_by_verification_id(
    db: AsyncSession,
    tenant_id: int,
    verification_id: str,
) -> tuple[str, Any] | None:
    vid = (verification_id or "").strip()
    if not vid:
        return None
    checks: list[tuple[str, Any]] = [
        ("DELIVERY_CHALLAN", DeliveryChallan),
        ("ENHANCED_GATE_PASS", EnhancedGatePass),
        ("GOODS_RECEIVING", GoodsReceiving),
        ("PRODUCTION_MATERIAL_ISSUE", ProductionMaterialIssue),
        ("PROCESS_ORDER", ProcessOrder),
        ("WAREHOUSE_TRANSFER", WarehouseTransfer),
    ]
    for label, model in checks:
        row = (
            await db.execute(
                select(model).where(
                    model.tenant_id == tenant_id,
                    model.verification_id == vid,
                )
            )
        ).scalars().first()
        if row:
            return label, row
    return None


# --- GL postings (for UI) ---


async def _posting_rows_with_voucher(
    db: AsyncSession,
    tenant_id: int,
    source_system: str,
    source_id: int,
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(InventoryGlPosting, Voucher)
        .join(Voucher, Voucher.id == InventoryGlPosting.voucher_id)
        .where(
            InventoryGlPosting.tenant_id == tenant_id,
            InventoryGlPosting.source_system == source_system,
            InventoryGlPosting.source_id == source_id,
        )
        .order_by(InventoryGlPosting.id)
    )
    out: list[dict[str, Any]] = []
    for igp, v in result.all():
        vlines = list(
            (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == v.id).order_by(VoucherLine.id)))
            .scalars()
            .all()
        )
        out.append(
            {
                "posting_id": igp.id,
                "action": igp.action,
                "source_system": igp.source_system,
                "source_id": igp.source_id,
                "voucher_id": v.id,
                "voucher_number": v.voucher_number,
                "voucher_date": v.voucher_date.isoformat() if v.voucher_date else None,
                "voucher_status": v.status,
                "lines": [
                    {
                        "line_id": vl.id,
                        "account_id": vl.account_id,
                        "entry_type": vl.entry_type,
                        "amount": str(vl.amount),
                        "notes": vl.notes,
                    }
                    for vl in vlines
                ],
                "created_at": igp.created_at.isoformat() if igp.created_at else None,
            }
        )
    return out


async def list_gl_postings_for_inventory_doc(
    db: AsyncSession,
    tenant_id: int,
    doc_type: str,
    doc_id: int,
) -> list[dict[str, Any]]:
    if doc_type == "DELIVERY_CHALLAN":
        return await _posting_rows_with_voucher(db, tenant_id, "DELIVERY_CHALLAN", doc_id)
    if doc_type == "GOODS_RECEIVING":
        return await _posting_rows_with_voucher(db, tenant_id, "GRN", doc_id)
    if doc_type == "PROCESS_ORDER":
        a = await _posting_rows_with_voucher(db, tenant_id, "PROCESS_ORDER", doc_id)
        # Both ISSUE and RECEIVE use same source_id
        return a
    if doc_type == "PRODUCTION_MATERIAL_ISSUE":
        mids = list(
            (
                await db.execute(
                    select(StockMovement.id).where(
                        StockMovement.tenant_id == tenant_id,
                        StockMovement.production_material_issue_id == doc_id,
                    )
                )
            )
            .scalars()
            .all()
        )
        combined: list[dict[str, Any]] = []
        for mid in mids:
            combined.extend(await _posting_rows_with_voucher(db, tenant_id, "PRODUCTION_MATERIAL_ISSUE", mid))
        return combined
    if doc_type in ("ENHANCED_GATE_PASS", "WAREHOUSE_TRANSFER"):
        return []
    return []


async def backfill_signatures_for_tenant(db: AsyncSession, tenant_id: int) -> dict[str, int]:
    """Assign verification_id + signature_hash to rows in signed states that are still unsigned."""
    counts: dict[str, int] = {k: 0 for k in ("delivery_challan", "gate_pass", "grn", "pmi", "process_order", "transfer")}

    dc_rows = (
        await db.execute(
            select(DeliveryChallan).where(
                DeliveryChallan.tenant_id == tenant_id,
                DeliveryChallan.verification_id.is_(None),
                DeliveryChallan.status == "POSTED",
            )
        )
    ).scalars().all()
    for row in dc_rows:
        items = list(
            (await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id)))
            .scalars()
            .all()
        )
        oids = list(
            (
                await db.execute(
                    select(DeliveryChallanOrder.order_id).where(
                        DeliveryChallanOrder.delivery_challan_id == row.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        sign_delivery_challan(row, items, oids)
        counts["delivery_challan"] += 1

    gp_rows = (
        await db.execute(
            select(EnhancedGatePass).where(
                EnhancedGatePass.tenant_id == tenant_id,
                EnhancedGatePass.verification_id.is_(None),
                EnhancedGatePass.status == "RELEASED",
            )
        )
    ).scalars().all()
    for row in gp_rows:
        sign_gate_pass(row)
        counts["gate_pass"] += 1

    grn_rows = (
        await db.execute(
            select(GoodsReceiving).where(
                GoodsReceiving.tenant_id == tenant_id,
                GoodsReceiving.verification_id.is_(None),
                GoodsReceiving.status == "RECEIVED",
            )
        )
    ).scalars().all()
    for row in grn_rows:
        items = list(
            (await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == row.id)))
            .scalars()
            .all()
        )
        sign_goods_receiving(row, items)
        counts["grn"] += 1

    pmi_rows = (
        await db.execute(
            select(ProductionMaterialIssue).where(
                ProductionMaterialIssue.tenant_id == tenant_id,
                ProductionMaterialIssue.verification_id.is_(None),
                ProductionMaterialIssue.status == "POSTED",
            )
        )
    ).scalars().all()
    for row in pmi_rows:
        lines = list(
            (
                await db.execute(
                    select(ProductionMaterialIssueLine).where(ProductionMaterialIssueLine.issue_id == row.id)
                )
            )
            .scalars()
            .all()
        )
        sign_production_material_issue(row, lines)
        counts["pmi"] += 1

    po_rows = (
        await db.execute(
            select(ProcessOrder).where(
                ProcessOrder.tenant_id == tenant_id,
                ProcessOrder.verification_id.is_(None),
                ProcessOrder.status.in_(("ISSUED", "RECEIVED", "APPROVED")),
            )
        )
    ).scalars().all()
    for row in po_rows:
        cost_lines = list(
            (
                await db.execute(
                    select(ProcessOrderCostLine).where(ProcessOrderCostLine.process_order_id == row.id)
                )
            )
            .scalars()
            .all()
        )
        sign_process_order(row, cost_lines)
        counts["process_order"] += 1

    wt_rows = (
        await db.execute(
            select(WarehouseTransfer).where(
                WarehouseTransfer.tenant_id == tenant_id,
                WarehouseTransfer.verification_id.is_(None),
                WarehouseTransfer.status == "POSTED",
            )
        )
    ).scalars().all()
    for row in wt_rows:
        lines = list(
            (
                await db.execute(
                    select(WarehouseTransferLine).where(WarehouseTransferLine.transfer_id == row.id)
                )
            )
            .scalars()
            .all()
        )
        sign_warehouse_transfer(row, lines)
        counts["transfer"] += 1

    await db.commit()
    return counts


async def verify_inventory_document(
    db: AsyncSession,
    tenant_id: int,
    verification_id: str,
) -> dict[str, Any] | None:
    found = await find_doc_by_verification_id(db, tenant_id, verification_id)
    if not found:
        return None
    doc_type, row = found
    payload = await rebuild_payload_for_verify(db, tenant_id, doc_type, row.id)
    if payload is None:
        return None
    is_valid, recalc = verify_payload_against_hash(getattr(row, "signature_hash", None), payload)
    code = getattr(row, "challan_code", None) or getattr(row, "gate_pass_code", None) or getattr(
        row, "grn_code", None
    ) or getattr(row, "issue_code", None) or getattr(row, "process_number", None) or getattr(
        row, "transfer_code", None
    )
    return {
        "document_type": doc_type,
        "document_id": row.id,
        "document_code": code,
        "verification_id": row.verification_id,
        "is_valid": is_valid,
        "signature_hash": row.signature_hash,
        "recalculated_hash": recalc,
        "signed_at": row.signed_at.isoformat() if getattr(row, "signed_at", None) else None,
    }
