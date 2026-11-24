"""Phase 2B: append-only UD material utilization event ledger (idempotent insert)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_material_alloc_ud_v1_enabled
from app.database import safe_async_session_rollback
from app.models.compliance import UdEntitlement
from app.models.material_control_alloc import UdMaterialUtilizationEvent
from app.models.tenant import Tenant

EVENT_KINDS = frozenset({"ORDERED", "RECEIVED", "ISSUED", "CONVERSION_LOSS", "SHIPPED", "REVERSED"})


def require_alloc_ud_flag(tenant: Tenant) -> None:
    if not is_material_alloc_ud_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


async def record_event(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int | None,
    source_document_type: str,
    source_document_id: int,
    event_kind: str,
    qty_normalized: str | Decimal | float | int,
    source_line_id: int | None = None,
    source_stage_key: str = "",
    ud_entitlement_id: int | None = None,
    master_contract_id: int | None = None,
    btb_lc_id: int | None = None,
    purchase_order_id: int | None = None,
    style_id: int | None = None,
    colorway_id: int | None = None,
    order_id: int | None = None,
    factor_snapshot: str | None = None,
    reversal_of_event_id: int | None = None,
) -> UdMaterialUtilizationEvent:
    """Insert event; duplicate unique key returns the existing row (idempotent). No updates/deletes."""
    require_alloc_ud_flag(tenant)
    kind = (event_kind or "").strip().upper()
    if kind not in EVENT_KINDS:
        raise HTTPException(status_code=400, detail=f"Invalid event_kind: {event_kind}")
    doc_type = (source_document_type or "").strip()
    if not doc_type:
        raise HTTPException(status_code=400, detail="source_document_type is required")
    stage = source_stage_key or ""
    qty_text = str(Decimal(str(qty_normalized)))

    from app.models.commercial import BtbLc, MasterContract
    from app.models.inventory import PurchaseOrder, PurchaseOrderItem
    from app.models.merch import GarmentStyle, Order
    from app.modules.material_control.style_tagging import resolve_style_colorway

    await ensure_owned(db, UdEntitlement, ud_entitlement_id, tenant.id, "UD entitlement", status_code=404)
    await ensure_owned(db, MasterContract, master_contract_id, tenant.id, "Master contract", status_code=404)
    await ensure_owned(db, BtbLc, btb_lc_id, tenant.id, "BTB LC", status_code=404)
    await ensure_owned(db, PurchaseOrder, purchase_order_id, tenant.id, "Purchase order", status_code=404)
    await ensure_owned(db, Order, order_id, tenant.id, "Order", status_code=404)
    # Source document ids are tenant-checked per allowed document type. Only "PO" is used today;
    # any other type is refused so no unchecked id can be stored in the UD ledger.
    if doc_type != "PO":
        raise HTTPException(status_code=400, detail=f"Unsupported source_document_type: {doc_type}")
    await ensure_owned(
        db, PurchaseOrder, int(source_document_id), tenant.id, "Source document", status_code=404
    )
    if source_line_id is not None:
        po_line = await ensure_owned(
            db, PurchaseOrderItem, source_line_id, tenant.id, "Source line", status_code=404
        )
        if po_line is not None and po_line.purchase_order_id != int(source_document_id):
            raise HTTPException(status_code=400, detail="Source line does not belong to the source document")
    style_id, colorway_id = await resolve_style_colorway(
        db, tenant_id=tenant.id, style_id=style_id, colorway_id=colorway_id
    )
    if reversal_of_event_id is not None:
        await ensure_owned(
            db,
            UdMaterialUtilizationEvent,
            reversal_of_event_id,
            tenant.id,
            "UD event",
            status_code=404,
        )

    values = {
        "tenant_id": tenant.id,
        "ud_entitlement_id": ud_entitlement_id,
        "master_contract_id": master_contract_id,
        "btb_lc_id": btb_lc_id,
        "purchase_order_id": purchase_order_id,
        "style_id": style_id,
        "colorway_id": colorway_id,
        "order_id": order_id,
        "source_document_type": doc_type,
        "source_document_id": int(source_document_id),
        "source_line_id": source_line_id,
        "source_stage_key": stage,
        "event_kind": kind,
        "qty_normalized": qty_text,
        "factor_snapshot": factor_snapshot,
        "reversal_of_event_id": reversal_of_event_id,
        "created_by_user_id": user_id,
        "created_at": datetime.utcnow(),
    }

    try:
        stmt = (
            pg_insert(UdMaterialUtilizationEvent)
            .values(**values)
            .on_conflict_do_nothing(
                constraint="uq_ud_mat_util_source_event",
            )
            .returning(UdMaterialUtilizationEvent.id)
        )
        inserted_id = (await db.execute(stmt)).scalar_one_or_none()
        await db.flush()

        lookup = select(UdMaterialUtilizationEvent).where(
            UdMaterialUtilizationEvent.tenant_id == tenant.id,
            UdMaterialUtilizationEvent.source_document_type == doc_type,
            UdMaterialUtilizationEvent.source_document_id == int(source_document_id),
            UdMaterialUtilizationEvent.source_stage_key == stage,
            UdMaterialUtilizationEvent.event_kind == kind,
        )
        if source_line_id is None:
            lookup = lookup.where(UdMaterialUtilizationEvent.source_line_id.is_(None))
        else:
            lookup = lookup.where(UdMaterialUtilizationEvent.source_line_id == source_line_id)

        row = (await db.execute(lookup)).scalar_one_or_none()
        if row is None and inserted_id is not None:
            row = await db.get(UdMaterialUtilizationEvent, inserted_id)
        if row is None or row.tenant_id != tenant.id:
            raise HTTPException(status_code=500, detail="Failed to record UD event")
        return row
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


def event_to_dict(row: UdMaterialUtilizationEvent) -> dict:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "ud_entitlement_id": row.ud_entitlement_id,
        "source_document_type": row.source_document_type,
        "source_document_id": row.source_document_id,
        "source_line_id": row.source_line_id,
        "source_stage_key": row.source_stage_key,
        "event_kind": row.event_kind,
        "qty_normalized": row.qty_normalized,
        "factor_snapshot": row.factor_snapshot,
        "reversal_of_event_id": row.reversal_of_event_id,
    }
