from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Item,
    ManufacturingCostSnapshot,
    ManufacturingMaterialIssue,
    ManufacturingWorkOrder,
    Tenant,
    User,
)
from app.modules.manufacturing.schemas import CostSnapshotResponse, FreezeCostSnapshotCreate

router = APIRouter(prefix="/manufacturing/costing", tags=["manufacturing-costing"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _to_float(value: str | float | int | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def _calc_material_cost(db: AsyncSession, tenant_id: int, work_order_id: int) -> float:
    issues = (
        await db.execute(
            select(ManufacturingMaterialIssue).where(
                ManufacturingMaterialIssue.tenant_id == tenant_id,
                ManufacturingMaterialIssue.work_order_id == work_order_id,
            )
        )
    ).scalars().all()
    if not issues:
        return 0.0
    total = 0.0
    for issue in issues:
        item = await db.get(Item, issue.item_id)
        if not item or item.tenant_id != tenant_id:
            continue
        total += float(issue.qty_issued) * _to_float(item.default_cost)
    return round(total, 2)


def _to_snapshot_response(row: ManufacturingCostSnapshot) -> CostSnapshotResponse:
    return CostSnapshotResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        work_order_id=row.work_order_id,
        material_cost=float(row.material_cost),
        labor_cost=float(row.labor_cost),
        overhead_cost=float(row.overhead_cost),
        total_cost=float(row.total_cost),
        variance_amount=float(row.variance_amount),
        snapshot_note=row.snapshot_note,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at,
    )


@router.get("/work-orders/{work_order_id}/actual-cost")
async def get_actual_cost(
    work_order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    wo = await db.get(ManufacturingWorkOrder, work_order_id)
    if not wo or wo.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    material_cost = await _calc_material_cost(db, tenant.id, work_order_id)
    latest_snapshot = (
        await db.execute(
            select(ManufacturingCostSnapshot)
            .where(
                ManufacturingCostSnapshot.tenant_id == tenant.id,
                ManufacturingCostSnapshot.work_order_id == work_order_id,
            )
            .order_by(ManufacturingCostSnapshot.id.desc())
        )
    ).scalars().first()
    labor_cost = float(latest_snapshot.labor_cost) if latest_snapshot else 0.0
    overhead_cost = float(latest_snapshot.overhead_cost) if latest_snapshot else 0.0
    total_cost = round(material_cost + labor_cost + overhead_cost, 2)
    return {
        "work_order_id": work_order_id,
        "material_cost": material_cost,
        "labor_cost": labor_cost,
        "overhead_cost": overhead_cost,
        "total_cost": total_cost,
    }


@router.get("/work-orders/{work_order_id}/variance")
async def get_cost_variance(
    work_order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    wo = await db.get(ManufacturingWorkOrder, work_order_id)
    if not wo or wo.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    latest_snapshot = (
        await db.execute(
            select(ManufacturingCostSnapshot)
            .where(
                ManufacturingCostSnapshot.tenant_id == tenant.id,
                ManufacturingCostSnapshot.work_order_id == work_order_id,
            )
            .order_by(ManufacturingCostSnapshot.id.desc())
        )
    ).scalars().first()
    if not latest_snapshot:
        return {"work_order_id": work_order_id, "variance_amount": 0.0, "has_snapshot": False}
    return {
        "work_order_id": work_order_id,
        "variance_amount": float(latest_snapshot.variance_amount),
        "has_snapshot": True,
    }


@router.post("/work-orders/{work_order_id}/freeze-cost-snapshot", response_model=CostSnapshotResponse)
async def freeze_cost_snapshot(
    work_order_id: int,
    body: FreezeCostSnapshotCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    wo = await db.get(ManufacturingWorkOrder, work_order_id)
    if not wo or wo.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    material_cost = await _calc_material_cost(db, tenant.id, work_order_id)
    total_cost = round(material_cost + body.labor_cost + body.overhead_cost, 2)
    variance = 0.0
    if body.standard_total_cost is not None:
        variance = round(total_cost - body.standard_total_cost, 2)
    row = ManufacturingCostSnapshot(
        tenant_id=tenant.id,
        work_order_id=work_order_id,
        material_cost=material_cost,
        labor_cost=body.labor_cost,
        overhead_cost=body.overhead_cost,
        total_cost=total_cost,
        variance_amount=variance,
        snapshot_note=body.snapshot_note.strip() if body.snapshot_note else None,
        created_by_user_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_snapshot_response(row)
