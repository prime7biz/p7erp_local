"""Phase 6: RTV (return to vendor) — stock OUT + optional debit note."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.codegen import next_tenant_code
from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_material_returns_v1_enabled
from app.database import safe_async_session_rollback
from app.models import User
from app.models.costing import Item
from app.models.inventory import StockMovement, Vendor, Warehouse
from app.models.material_control_alloc import MaterialRtvDocument, MaterialRtvLine
from app.models.tenant import Tenant
from app.services.fifo_inventory import finalize_movement_fifo


def require_returns_flag(tenant: Tenant) -> None:
    if not is_material_returns_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


async def _find_by_request_id(
    db: AsyncSession, *, tenant_id: int, request_id: str
) -> MaterialRtvDocument | None:
    return (
        await db.execute(
            select(MaterialRtvDocument)
            .where(
                MaterialRtvDocument.tenant_id == tenant_id,
                MaterialRtvDocument.request_id == request_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()


async def create_and_post_rtv(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    vendor_id: int,
    warehouse_id: int,
    lines: list[dict[str, Any]],
    request_id: str | None = None,
    notes: str | None = None,
    party_ledger_id: int | None = None,
    original_bill_id: int | None = None,
    revenue_or_purchase_account_id: int | None = None,
    note_amount: Decimal | float | str | int | None = None,
) -> MaterialRtvDocument:
    """Create RTV, FIFO OUT lines; optional create_note_voucher only after finance gates."""
    require_returns_flag(tenant)
    if not lines:
        raise HTTPException(status_code=400, detail="At least one line is required")

    if request_id:
        existing = await _find_by_request_id(db, tenant_id=tenant.id, request_id=request_id)
        if existing is not None:
            return existing

    try:
        await ensure_owned(db, Vendor, vendor_id, tenant.id, "Vendor", status_code=404)
        await ensure_owned(db, Warehouse, warehouse_id, tenant.id, "Warehouse", status_code=404)

        rtv_no = await next_tenant_code(db, model=MaterialRtvDocument, tenant_id=tenant.id, prefix="RTV-", width=4)
        doc = MaterialRtvDocument(
            tenant_id=tenant.id,
            rtv_no=rtv_no,
            vendor_id=vendor_id,
            warehouse_id=warehouse_id,
            status="POSTING",
            notes=notes,
            request_id=request_id,
            created_by_user_id=user.id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(doc)
        try:
            await db.flush()
        except IntegrityError:
            await safe_async_session_rollback(db)
            if request_id:
                existing = await _find_by_request_id(db, tenant_id=tenant.id, request_id=request_id)
                if existing is not None:
                    return existing
            raise

        first_mv_id: int | None = None
        for raw in lines:
            item_id = int(raw["item_id"])
            qty = Decimal(str(raw["qty"]))
            if qty <= 0:
                raise HTTPException(status_code=400, detail="line qty must be positive")
            await ensure_owned(db, Item, item_id, tenant.id, "Item", status_code=404)
            unit_cost = str(raw.get("unit_cost") or "0")
            line = MaterialRtvLine(
                tenant_id=tenant.id,
                rtv_id=doc.id,
                item_id=item_id,
                qty=qty,
                unit_cost=unit_cost,
                notes=raw.get("notes"),
                created_at=datetime.utcnow(),
            )
            db.add(line)
            await db.flush()

            movement = StockMovement(
                tenant_id=tenant.id,
                item_id=item_id,
                warehouse_id=warehouse_id,
                movement_type="OUT",
                quantity=qty,
                movement_date=today_local(tenant),
                reference_type="MATERIAL_RTV",
                reference_id=doc.id,
                movement_kind="RTV_OUT",
                vendor_id=vendor_id,
                created_by_user_id=user.id,
                notes=notes,
            )
            db.add(movement)
            await db.flush()
            await finalize_movement_fifo(db, tenant.id, movement)
            if first_mv_id is None:
                first_mv_id = movement.id

        doc.stock_movement_id = first_mv_id

        amt = Decimal(str(note_amount or 0))
        wants_dn = bool(party_ledger_id and original_bill_id and revenue_or_purchase_account_id and amt > 0)
        if wants_dn:
            from app.modules.finance.advanced_voucher_service import create_note_voucher
            from app.modules.material_control.debit_note_gate import assert_can_create_debit_note

            await assert_can_create_debit_note(db, user, tenant)
            voucher = await create_note_voucher(
                db,
                tenant.id,
                note_kind="DEBIT_NOTE",
                voucher_date=today_local(tenant),
                description=f"RTV {doc.rtv_no} vendor return",
                party_ledger_id=int(party_ledger_id),
                original_bill_id=int(original_bill_id),
                amount=amt,
                revenue_or_purchase_account_id=int(revenue_or_purchase_account_id),
                created_by=user.id,
                stock_returns=None,
            )
            doc.voucher_id = voucher.id

        doc.status = "POSTED"
        doc.updated_at = datetime.utcnow()
        await db.flush()
        return doc
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


def rtv_to_dict(row: MaterialRtvDocument) -> dict:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "rtv_no": row.rtv_no,
        "vendor_id": row.vendor_id,
        "warehouse_id": row.warehouse_id,
        "status": row.status,
        "voucher_id": row.voucher_id,
        "stock_movement_id": row.stock_movement_id,
        "request_id": row.request_id,
    }
