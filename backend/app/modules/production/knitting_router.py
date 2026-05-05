"""Knitting hub: optional tenant module — plans, charge rates, work orders, inventory hand-off."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.common.auth import get_current_user
from app.common.knitting_feature_flags import require_knitting_enabled
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import (
    Customer,
    DepartmentMachine,
    Item,
    KnittingChargeRate,
    KnittingPlan,
    KnittingWorkOrder,
    ProcessOrder,
    Tenant,
    User,
    Vendor,
    Warehouse,
)
from app.modules.production.schemas import KnittingPlanCreate
from app.modules.production.knitting_service import resolve_charge_amount, safe_float_money

router = APIRouter(prefix="/production/knitting", tags=["production-knitting"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _source_to_process_method(source_type: str) -> str:
    m = {"in_house": "in_house", "jobwork_customer": "jobwork_customer", "subcontract": "subcontract"}
    key = source_type.strip().lower()
    if key not in m:
        raise HTTPException(status_code=400, detail="Invalid source_type")
    return m[key]


# --- Charge rates ---


class KnittingChargeRateCreate(BaseModel):
    fabric_type_code: str = Field(..., max_length=128)
    unit_basis: str = Field(default="per_kg_greige", max_length=32)
    rate_per_unit: float = Field(ge=0)
    currency: str = Field(default="BDT", max_length=10)
    effective_from: str  # ISO date
    effective_to: str | None = None
    is_active: bool = True
    notes: str | None = None


class KnittingChargeRatePatch(BaseModel):
    unit_basis: str | None = Field(default=None, max_length=32)
    rate_per_unit: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=10)
    effective_to: str | None = None
    is_active: bool | None = None
    notes: str | None = None


# --- Work orders ---


class KnittingWorkOrderCreate(BaseModel):
    source_type: str = "in_house"
    customer_id: int | None = None
    vendor_id: int | None = None
    machine_id: int | None = None
    yarn_item_id: int
    greige_item_id: int
    fabric_type_code: str | None = Field(None, max_length=128)
    gauge: str | None = Field(None, max_length=64)
    planned_yarn_qty: str | None = None
    planned_greige_qty: str | None = None
    processing_charge_preview: str | None = None
    warehouse_id: int | None = None
    output_warehouse_id: int | None = None
    knitting_plan_id: int | None = None
    linked_order_id: int | None = None
    notes: str | None = None


class KnittingWorkOrderPatch(BaseModel):
    machine_id: int | None = None
    status: str | None = Field(None, max_length=24)
    delivery_challan_id: int | None = None
    gate_pass_id: int | None = None
    notes: str | None = None
    warehouse_id: int | None = None
    output_warehouse_id: int | None = None


class DocumentsLinkBody(BaseModel):
    delivery_challan_id: int | None = None
    gate_pass_id: int | None = None


def _serialize_wo(row: KnittingWorkOrder) -> dict:
    return {
        "id": row.id,
        "wo_number": row.wo_number,
        "tenant_id": row.tenant_id,
        "source_type": row.source_type,
        "customer_id": row.customer_id,
        "vendor_id": row.vendor_id,
        "machine_id": row.machine_id,
        "yarn_item_id": row.yarn_item_id,
        "greige_item_id": row.greige_item_id,
        "fabric_type_code": row.fabric_type_code,
        "gauge": row.gauge,
        "planned_yarn_qty": row.planned_yarn_qty,
        "planned_greige_qty": row.planned_greige_qty,
        "processing_charge_preview": row.processing_charge_preview,
        "warehouse_id": row.warehouse_id,
        "output_warehouse_id": row.output_warehouse_id,
        "knitting_plan_id": row.knitting_plan_id,
        "linked_order_id": row.linked_order_id,
        "process_order_id": row.process_order_id,
        "delivery_challan_id": row.delivery_challan_id,
        "gate_pass_id": row.gate_pass_id,
        "status": row.status,
        "notes": row.notes,
    }


@router.get("/plans")
async def list_plans(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    r = await db.execute(select(KnittingPlan).where(KnittingPlan.tenant_id == tenant.id).order_by(KnittingPlan.id.desc()))
    rows = list(r.scalars().all())
    return {
        "items": [
            {
                "id": x.id,
                "status": x.status,
                "planned_date": x.planned_date.isoformat() if x.planned_date else None,
                "machine_id": x.machine_id,
                "yarn_item_id": x.yarn_item_id,
                "target_output_kg": float(x.target_output_kg) if x.target_output_kg is not None else None,
                "fabric_type": x.fabric_type,
                "gauge": x.gauge,
                "order_id": x.order_id,
            }
            for x in rows
        ]
    }


@router.post("/plans")
async def create_plan(
    body: KnittingPlanCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    pd = date.fromisoformat(body.planned_date) if body.planned_date else None
    row = KnittingPlan(
        tenant_id=tenant.id,
        machine_id=body.machine_id,
        yarn_item_id=body.yarn_item_id,
        target_output_kg=body.target_output_kg,
        fabric_type=body.fabric_type,
        gauge=body.gauge,
        planned_date=pd,
        order_id=body.order_id,
        notes=body.notes,
        status="planned",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}


@router.get("/charge-rates")
async def list_charge_rates(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    active_only: bool = Query(default=True),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    stmt = select(KnittingChargeRate).where(KnittingChargeRate.tenant_id == tenant.id).order_by(
        KnittingChargeRate.fabric_type_code, KnittingChargeRate.effective_from.desc()
    )
    if active_only:
        stmt = stmt.where(KnittingChargeRate.is_active.is_(True))
    rows = list((await db.execute(stmt)).scalars().all())
    return {
        "items": [
            {
                "id": x.id,
                "fabric_type_code": x.fabric_type_code,
                "unit_basis": x.unit_basis,
                "rate_per_unit": float(x.rate_per_unit),
                "currency": x.currency,
                "effective_from": x.effective_from.isoformat(),
                "effective_to": x.effective_to.isoformat() if x.effective_to else None,
                "is_active": x.is_active,
                "notes": x.notes,
            }
            for x in rows
        ]
    }


@router.post("/charge-rates", status_code=status.HTTP_201_CREATED)
async def create_charge_rate(
    body: KnittingChargeRateCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    eff_from = date.fromisoformat(body.effective_from)
    eff_to = date.fromisoformat(body.effective_to) if body.effective_to else None
    row = KnittingChargeRate(
        tenant_id=tenant.id,
        fabric_type_code=body.fabric_type_code.strip(),
        unit_basis=(body.unit_basis or "per_kg_greige").strip(),
        rate_per_unit=body.rate_per_unit,
        currency=(body.currency or "BDT").strip().upper()[:10],
        effective_from=eff_from,
        effective_to=eff_to,
        is_active=body.is_active,
        notes=body.notes,
    )
    db.add(row)
    try:
        await db.commit()
    except Exception:
        await safe_async_session_rollback(db)
        raise
    await db.refresh(row)
    return {"id": row.id}


@router.patch("/charge-rates/{rate_id}")
async def patch_charge_rate(
    rate_id: int,
    body: KnittingChargeRatePatch,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    row = await db.get(KnittingChargeRate, rate_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Charge rate not found")
    data = body.model_dump(exclude_unset=True)
    if "effective_to" in data and data["effective_to"] is not None:
        data["effective_to"] = date.fromisoformat(data["effective_to"])
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return {"ok": True, "id": row.id}


@router.get("/charge-preview")
async def charge_preview(
    fabric_type_code: str = Query(..., max_length=128),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    planned_yarn_kg: float = Query(default=0, ge=0),
    planned_greige_kg: float = Query(default=0, ge=0),
    unit_basis: str = Query(default="per_kg_greige", max_length=32),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    amt = await resolve_charge_amount(
        db,
        tenant_id=tenant.id,
        fabric_type_code=fabric_type_code,
        unit_basis_hint=unit_basis,
        planned_yarn_qty=planned_yarn_kg,
        planned_greige_qty=planned_greige_kg,
    )
    return {"suggested_charge": amt, "currency_hint": tenant.base_currency or "BDT"}


async def _validate_wo_assets(
    db: AsyncSession, tenant_id: int, *, body: KnittingWorkOrderCreate, source_type_norm: str
) -> None:
    if body.machine_id is not None:
        m = await db.get(DepartmentMachine, body.machine_id)
        if not m or m.tenant_id != tenant_id or (m.department_type or "").lower() != "knitting":
            raise HTTPException(status_code=400, detail="Invalid knitting machine allocation")
    for iid in (body.yarn_item_id, body.greige_item_id):
        it = await db.get(Item, iid)
        if not it or it.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Invalid yarn or greige item for tenant")
    for wid in (body.warehouse_id, body.output_warehouse_id):
        if wid is not None:
            w = await db.get(Warehouse, wid)
            if not w or w.tenant_id != tenant_id:
                raise HTTPException(status_code=400, detail="Invalid warehouse")
    if source_type_norm == "jobwork_customer":
        if not body.customer_id:
            raise HTTPException(status_code=400, detail="customer_id required for jobwork_customer work orders")
        c = await db.get(Customer, body.customer_id)
        if not c or c.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Invalid customer for tenant")
    if source_type_norm == "subcontract":
        if not body.vendor_id:
            raise HTTPException(status_code=400, detail="vendor_id required for subcontract work orders")
        v = await db.get(Vendor, body.vendor_id)
        if not v or v.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Invalid vendor for tenant")


@router.get("/work-orders")
async def list_work_orders(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    r = await db.execute(
        select(KnittingWorkOrder).where(KnittingWorkOrder.tenant_id == tenant.id).order_by(KnittingWorkOrder.id.desc())
    )
    rows = list(r.scalars().all())
    return {"items": [_serialize_wo(x) for x in rows]}


@router.post("/work-orders", status_code=status.HTTP_201_CREATED)
async def create_work_order(
    body: KnittingWorkOrderCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    src = body.source_type.strip().lower()
    _source_to_process_method(src)
    await _validate_wo_assets(db, tenant.id, body=body, source_type_norm=src)
    wo_number = await next_tenant_code(db, model=KnittingWorkOrder, tenant_id=tenant.id, prefix="KWO-", width=4)

    pv = safe_float_money(body.processing_charge_preview)
    if pv <= 0 and body.fabric_type_code:
        pv = await resolve_charge_amount(
            db,
            tenant_id=tenant.id,
            fabric_type_code=body.fabric_type_code,
            unit_basis_hint="per_kg_greige",
            planned_yarn_qty=safe_float_money(body.planned_yarn_qty),
            planned_greige_qty=safe_float_money(body.planned_greige_qty),
        )

    row = KnittingWorkOrder(
        tenant_id=tenant.id,
        wo_number=wo_number,
        source_type=src,
        customer_id=body.customer_id,
        vendor_id=body.vendor_id,
        machine_id=body.machine_id,
        yarn_item_id=body.yarn_item_id,
        greige_item_id=body.greige_item_id,
        fabric_type_code=body.fabric_type_code,
        gauge=body.gauge,
        planned_yarn_qty=body.planned_yarn_qty or "0",
        planned_greige_qty=body.planned_greige_qty or "0",
        processing_charge_preview=str(round(pv, 4)) if pv > 0 else body.processing_charge_preview,
        warehouse_id=body.warehouse_id,
        output_warehouse_id=body.output_warehouse_id or body.warehouse_id,
        knitting_plan_id=body.knitting_plan_id,
        linked_order_id=body.linked_order_id,
        notes=body.notes,
        status="draft",
    )
    db.add(row)
    try:
        await db.commit()
    except Exception:
        await safe_async_session_rollback(db)
        raise
    await db.refresh(row)
    return _serialize_wo(row)


@router.get("/work-orders/{wo_id}")
async def get_work_order(
    wo_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    row = await db.get(KnittingWorkOrder, wo_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    return _serialize_wo(row)


@router.patch("/work-orders/{wo_id}")
async def patch_work_order(
    wo_id: int,
    body: KnittingWorkOrderPatch,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    row = await db.get(KnittingWorkOrder, wo_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    patch = body.model_dump(exclude_unset=True)
    for k, v in patch.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return _serialize_wo(row)


@router.post("/work-orders/{wo_id}/link-documents")
async def link_work_order_documents(
    wo_id: int,
    body: DocumentsLinkBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Associate inventory delivery challan / gate pass QR documents with this WO (create docs from Inventory menus)."""
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    row = await db.get(KnittingWorkOrder, wo_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    if body.delivery_challan_id is not None:
        from app.models import DeliveryChallan

        dc = await db.get(DeliveryChallan, body.delivery_challan_id)
        if not dc or dc.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Invalid delivery challan")
        row.delivery_challan_id = body.delivery_challan_id
    if body.gate_pass_id is not None:
        from app.models import EnhancedGatePass

        gp = await db.get(EnhancedGatePass, body.gate_pass_id)
        if not gp or gp.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Invalid gate pass")
        row.gate_pass_id = body.gate_pass_id
    await db.commit()
    await db.refresh(row)
    return _serialize_wo(row)


@router.post("/work-orders/{wo_id}/process-order")
async def create_linked_process_order(
    wo_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a drafting knitting process order wired to yarns → greige; complete issue/receive in Inventory."""
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    wo = await db.get(KnittingWorkOrder, wo_id)
    if not wo or wo.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    if wo.process_order_id:
        raise HTTPException(status_code=400, detail="Work order already has a linked process order")
    if wo.warehouse_id is None:
        raise HTTPException(status_code=400, detail="warehouse_id is required")
    pym = _source_to_process_method(wo.source_type)
    proc_chg = wo.processing_charge_preview or "0"
    proc_num = await next_tenant_code(db, model=ProcessOrder, tenant_id=tenant.id, prefix="KNPO-", width=4)
    po_row = ProcessOrder(
        tenant_id=tenant.id,
        process_number=proc_num,
        process_type="knitting",
        process_method=pym,
        linked_order_id=wo.linked_order_id,
        warehouse_id=wo.warehouse_id,
        output_warehouse_id=wo.output_warehouse_id,
        input_item_id=wo.yarn_item_id,
        output_item_id=wo.greige_item_id,
        input_quantity=wo.planned_yarn_qty or "0",
        expected_output_qty=wo.planned_greige_qty or "0",
        processing_charges=proc_chg if pym != "in_house" else "0",
        remarks=f"From knitting WO {wo.wo_number}",
        vendor_id=wo.vendor_id if pym == "subcontract" else None,
        customer_id=wo.customer_id if pym == "jobwork_customer" else None,
        source_order_id=wo.linked_order_id,
    )
    db.add(po_row)
    await db.flush()
    wo.process_order_id = po_row.id
    wo.status = "process_linked"
    await db.commit()
    await db.refresh(po_row)
    await db.refresh(wo)
    return {"work_order": _serialize_wo(wo), "process_order_id": po_row.id, "process_number": po_row.process_number}


@router.post("/work-orders/{wo_id}/refresh-status")
async def refresh_work_order_status_from_process_order(
    wo_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    wo = await db.get(KnittingWorkOrder, wo_id)
    if not wo or wo.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    if not wo.process_order_id:
        raise HTTPException(status_code=400, detail="No linked process order")
    po = await db.get(ProcessOrder, wo.process_order_id)
    if not po or po.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Linked process order missing")
    pst = (po.status or "").upper()
    new_status = wo.status
    if pst == "DRAFT":
        new_status = "process_linked"
    elif pst == "ISSUED":
        new_status = "yarn_issued"
    elif pst == "RECEIVED":
        new_status = "greige_received"
    elif pst == "APPROVED":
        new_status = "closed"
    wo.status = new_status
    await db.commit()
    await db.refresh(wo)
    return _serialize_wo(wo)


@router.get("/dashboard-stats")
async def knitting_dashboard_stats(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_knitting_enabled(tenant)
    wos = list((await db.execute(select(KnittingWorkOrder).where(KnittingWorkOrder.tenant_id == tenant.id))).scalars().all())
    by = {}
    for w in wos:
        by[w.status] = by.get(w.status, 0) + 1
    plans_ct = (
        await db.execute(select(KnittingPlan).where(KnittingPlan.tenant_id == tenant.id))
    ).scalars().all()
    machines = (
        await db.execute(
            select(DepartmentMachine).where(
                DepartmentMachine.tenant_id == tenant.id, DepartmentMachine.department_type == "knitting"
            )
        )
    ).scalars().all()
    return {
        "work_orders_by_status": by,
        "open_plans": len([p for p in plans_ct if (p.status or "").lower() in {"planned", "active"}]),
        "knitting_machine_count": len(machines),
    }
