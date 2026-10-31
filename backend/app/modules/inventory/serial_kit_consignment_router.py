"""Sprint I4: serial tracking, kits, consignment stock APIs."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_INVENTORY_CONSIGNMENT_CREATE,
    PERMISSION_INVENTORY_CONSIGNMENT_SETTLE,
    PERMISSION_INVENTORY_CONSIGNMENT_VIEW,
    PERMISSION_INVENTORY_KIT_CREATE,
    PERMISSION_INVENTORY_KIT_EDIT,
    PERMISSION_INVENTORY_KIT_VIEW,
    PERMISSION_INVENTORY_SERIAL_CREATE,
    PERMISSION_INVENTORY_SERIAL_VIEW,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_consignment_stock_enabled,
    is_kitting_enabled,
    is_serial_tracking_enabled,
)
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.modules.inventory import consignment_service, kitting_service, serial_tracking_service

router = APIRouter(prefix="/inventory", tags=["inventory-serial-kit-consignment"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


def _require_serial(tenant: Tenant) -> None:
    if not is_serial_tracking_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Serial tracking is disabled")


def _require_kit(tenant: Tenant) -> None:
    if not is_kitting_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Kitting is disabled")


def _require_consignment(tenant: Tenant) -> None:
    if not is_consignment_stock_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Consignment stock is disabled")


class SerialIssueBody(BaseModel):
    serial_ids: list[int]
    status: str = "ISSUED"
    dc_item_id: int | None = None


class SerialImportBody(BaseModel):
    rows: list[dict] = Field(default_factory=list)


class KitComponentIn(BaseModel):
    item_id: int
    quantity: Decimal = Decimal("1")


class KitCreateBody(BaseModel):
    kit_code: str | None = None
    name: str
    kit_price: Decimal = Decimal("0")
    notes: str | None = None
    components: list[KitComponentIn] = Field(default_factory=list)


class KitUpdateBody(BaseModel):
    name: str | None = None
    kit_price: Decimal | None = None
    is_active: bool | None = None
    notes: str | None = None
    components: list[KitComponentIn] | None = None


class KitOrderBody(BaseModel):
    kit_id: int
    qty: Decimal
    warehouse_id: int


class ConsignmentReceiveBody(BaseModel):
    vendor_id: int
    item_id: int
    warehouse_id: int
    qty: Decimal
    unit_cost: Decimal | None = None
    agreement_date: date | None = None
    settlement_terms_days: int | None = 30
    notes: str | None = None


class ConsignmentConsumeBody(BaseModel):
    consignment_id: int | None = None
    item_id: int | None = None
    warehouse_id: int | None = None
    qty: Decimal


class ConsignmentSettleBody(BaseModel):
    vendor_id: int
    consignment_id: int | None = None


# ---- Serials ----


@router.get("/serials")
async def list_serials(
    item_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_serial(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_SERIAL_VIEW
    )
    rows = await serial_tracking_service.list_serials(
        db, tenant.id, item_id=item_id, status=status, q=q, limit=limit
    )
    return [await serial_tracking_service.serial_to_dict(db, r) for r in rows]


@router.get("/serials/trace")
async def trace_serial(
    serial_number: str = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_serial(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_SERIAL_VIEW
    )
    return await serial_tracking_service.trace_serial(db, tenant.id, serial_number)


@router.post("/serials/issue")
async def issue_serials(
    body: SerialIssueBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_serial(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_SERIAL_CREATE
    )
    try:
        rows = await serial_tracking_service.issue_serials(
            db,
            tenant,
            serial_ids=body.serial_ids,
            status=body.status,
            dc_item_id=body.dc_item_id,
        )
        await db.commit()
        return [await serial_tracking_service.serial_to_dict(db, r) for r in rows]
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/serials/import")
async def import_serials(
    body: SerialImportBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_serial(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_SERIAL_CREATE
    )
    try:
        result = await serial_tracking_service.import_serials_csv(db, tenant, rows=body.rows)
        await db.commit()
        return result
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---- Kits ----


@router.get("/kits")
async def list_kits(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_kit(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_KIT_VIEW
    )
    kits = await kitting_service.list_kits(db, tenant.id, active_only=False)
    return [await kitting_service.kit_to_dict(db, k) for k in kits]


@router.post("/kits")
async def create_kit(
    body: KitCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_kit(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_KIT_CREATE
    )
    try:
        kit = await kitting_service.create_kit(
            db,
            tenant,
            kit_code=body.kit_code,
            name=body.name,
            kit_price=body.kit_price,
            components=[c.model_dump() for c in body.components],
            notes=body.notes,
        )
        await db.commit()
        return await kitting_service.kit_to_dict(db, kit)
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/kits/{kit_id}")
async def update_kit(
    kit_id: int,
    body: KitUpdateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_kit(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_KIT_EDIT
    )
    try:
        kit = await kitting_service.update_kit(
            db,
            tenant,
            kit_id,
            name=body.name,
            kit_price=body.kit_price,
            is_active=body.is_active,
            notes=body.notes,
            components=[c.model_dump() for c in body.components] if body.components is not None else None,
        )
        await db.commit()
        return await kitting_service.kit_to_dict(db, kit)
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/kits/explode")
async def explode_kit(
    body: KitOrderBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_kit(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_KIT_CREATE
    )
    try:
        result = await kitting_service.create_kit_order(
            db, tenant, kit_id=body.kit_id, qty=body.qty, warehouse_id=body.warehouse_id
        )
        await db.commit()
        return result
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/kits/sell")
async def sell_kit(
    body: KitOrderBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_kit(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_KIT_CREATE
    )
    try:
        result = await kitting_service.sell_kit(
            db, tenant, kit_id=body.kit_id, qty=body.qty, warehouse_id=body.warehouse_id
        )
        await db.commit()
        return result
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---- Consignment ----


@router.get("/consignment")
async def list_consignment(
    vendor_id: int | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_consignment(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_CONSIGNMENT_VIEW
    )
    rows = await consignment_service.list_consignments(db, tenant.id, vendor_id=vendor_id)
    return [await consignment_service.consignment_to_dict(db, r) for r in rows]


@router.post("/consignment/receive")
async def receive_consignment(
    body: ConsignmentReceiveBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_consignment(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_CONSIGNMENT_CREATE
    )
    try:
        row = await consignment_service.receive_consignment(
            db,
            tenant,
            vendor_id=body.vendor_id,
            item_id=body.item_id,
            warehouse_id=body.warehouse_id,
            qty=body.qty,
            unit_cost=body.unit_cost,
            agreement_date=body.agreement_date,
            settlement_terms_days=body.settlement_terms_days,
            notes=body.notes,
        )
        await db.commit()
        return await consignment_service.consignment_to_dict(db, row)
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/consignment/consume")
async def consume_consignment(
    body: ConsignmentConsumeBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_consignment(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_CONSIGNMENT_CREATE
    )
    try:
        row = await consignment_service.consume_consignment(
            db,
            tenant,
            consignment_id=body.consignment_id,
            item_id=body.item_id,
            warehouse_id=body.warehouse_id,
            qty=body.qty,
        )
        await db.commit()
        return await consignment_service.consignment_to_dict(db, row)
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/consignment/settle")
async def settle_consignment(
    body: ConsignmentSettleBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_consignment(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_CONSIGNMENT_SETTLE
    )
    try:
        result = await consignment_service.settle_consignment(
            db, tenant, vendor_id=body.vendor_id, consignment_id=body.consignment_id
        )
        await db.commit()
        return result
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
