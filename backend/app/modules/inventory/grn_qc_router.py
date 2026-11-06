"""Sprint I2: GRN quality inspection APIs."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_INVENTORY_QC_INSPECT,
    PERMISSION_INVENTORY_QC_VIEW,
    PERMISSION_INVENTORY_VENDOR_SCORECARD_VIEW,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_grn_quality_inspection_enabled
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, GrnQualityInspection
from app.modules.inventory import grn_qc_service

router = APIRouter(prefix="/inventory", tags=["inventory-grn-qc"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


def _require_qc(tenant: Tenant) -> None:
    if not is_grn_quality_inspection_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="GRN quality inspection is disabled. Enable grn_quality_inspection_enabled.",
        )


class InspectLineBody(BaseModel):
    grn_item_id: int
    accepted_qty: Decimal = Field(default=Decimal("0"), ge=0)
    rejected_qty: Decimal = Field(default=Decimal("0"), ge=0)
    hold_qty: Decimal = Field(default=Decimal("0"), ge=0)
    parameters: dict | None = None
    notes: str | None = None
    photos: list[str] | None = None
    inspection_date: date | None = None


class InspectBody(BaseModel):
    lines: list[InspectLineBody] = Field(default_factory=list)


class InspectionOut(BaseModel):
    id: int
    grn_id: int
    grn_item_id: int
    item_id: int | None = None
    item_code: str | None = None
    item_name: str | None = None
    lot_number: str | None = None
    grn_code: str | None = None
    vendor_id: int | None = None
    inspection_date: date | None = None
    inspected_by: int | None = None
    received_qty: str
    accepted_qty: str
    rejected_qty: str
    hold_qty: str
    parameters: dict | None = None
    result: str | None = None
    status: str
    notes: str | None = None
    photos: list | dict | None = None
    target_warehouse_id: int | None = None
    quarantine_warehouse_id: int | None = None
    rejected_warehouse_id: int | None = None
    debit_note_suggested: bool = False
    created_at: datetime | None = None


def _insp_out(
    insp: GrnQualityInspection,
    *,
    item_id: int | None = None,
    item_code: str | None = None,
    item_name: str | None = None,
    lot_number: str | None = None,
    grn_code: str | None = None,
    vendor_id: int | None = None,
) -> InspectionOut:
    return InspectionOut(
        id=insp.id,
        grn_id=insp.grn_id,
        grn_item_id=insp.grn_item_id,
        item_id=item_id,
        item_code=item_code,
        item_name=item_name,
        lot_number=lot_number,
        grn_code=grn_code,
        vendor_id=vendor_id,
        inspection_date=insp.inspection_date,
        inspected_by=insp.inspected_by,
        received_qty=str(insp.received_qty),
        accepted_qty=str(insp.accepted_qty),
        rejected_qty=str(insp.rejected_qty),
        hold_qty=str(insp.hold_qty),
        parameters=insp.parameters if isinstance(insp.parameters, dict) else None,
        result=insp.result,
        status=insp.status,
        notes=insp.notes,
        photos=insp.photos,
        target_warehouse_id=insp.target_warehouse_id,
        quarantine_warehouse_id=insp.quarantine_warehouse_id,
        rejected_warehouse_id=insp.rejected_warehouse_id,
        debit_note_suggested=bool(insp.debit_note_suggested),
        created_at=insp.created_at,
    )


async def _enrich(db: AsyncSession, insp: GrnQualityInspection) -> InspectionOut:
    line = await db.get(GoodsReceivingItem, insp.grn_item_id)
    grn = await db.get(GoodsReceiving, insp.grn_id)
    item_code = item_name = None
    item_id = None
    if line:
        item_id = line.item_id
        from app.models.costing import Item

        it = await db.get(Item, line.item_id)
        if it:
            item_code = it.item_code
            item_name = it.name
    return _insp_out(
        insp,
        item_id=item_id,
        item_code=item_code,
        item_name=item_name,
        lot_number=getattr(line, "lot_number", None) if line else None,
        grn_code=grn.grn_code if grn else None,
        vendor_id=grn.vendor_id if grn else None,
    )


@router.get("/grn/{grn_id}/qc-pending", response_model=list[InspectionOut])
async def grn_qc_pending(
    grn_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_qc(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_QC_VIEW
    )
    rows = await grn_qc_service.list_pending_for_grn(db, tenant.id, grn_id)
    return [await _enrich(db, r) for r in rows]


@router.post("/grn/{grn_id}/inspect", response_model=list[InspectionOut])
async def grn_inspect(
    grn_id: int,
    body: InspectBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_qc(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_QC_INSPECT
    )
    if not body.lines:
        raise HTTPException(status_code=400, detail="No inspection lines")
    results: list[InspectionOut] = []
    try:
        for line in body.lines:
            insp = await grn_qc_service.create_inspection(
                db,
                tenant,
                grn_id=grn_id,
                grn_item_id=line.grn_item_id,
                accepted_qty=line.accepted_qty,
                rejected_qty=line.rejected_qty,
                hold_qty=line.hold_qty,
                parameters=line.parameters,
                notes=line.notes,
                photos=line.photos,
                inspected_by=user.id,
                inspection_date=line.inspection_date,
            )
            results.append(await _enrich(db, insp))
        await db.commit()
        return results
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/quality/inspections", response_model=list[InspectionOut])
async def list_quality_inspections(
    status: str | None = None,
    result: str | None = None,
    vendor_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_qc(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_QC_VIEW
    )
    rows = await grn_qc_service.list_inspections(
        db, tenant.id, status=status, result=result, vendor_id=vendor_id, limit=limit
    )
    return [await _enrich(db, r) for r in rows]


@router.get("/quality/dashboard")
async def quality_dashboard(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_qc(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_QC_VIEW
    )
    pending = (
        await db.execute(
            select(func.count())
            .select_from(GrnQualityInspection)
            .where(
                GrnQualityInspection.tenant_id == tenant.id,
                GrnQualityInspection.status == "PENDING",
            )
        )
    ).scalar_one()
    cutoff = date.today() - timedelta(days=30)
    completed = list(
        (
            await db.execute(
                select(GrnQualityInspection).where(
                    GrnQualityInspection.tenant_id == tenant.id,
                    GrnQualityInspection.status == "COMPLETED",
                    GrnQualityInspection.inspection_date >= cutoff,
                )
            )
        )
        .scalars()
        .all()
    )
    total = len(completed) or 1
    pass_n = sum(1 for c in completed if (c.result or "").upper() == "PASS")
    fail_n = sum(1 for c in completed if (c.result or "").upper() == "FAIL")
    # Top rejected items
    from collections import defaultdict

    rej_by_item: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    for c in completed:
        if _d_safe(c.rejected_qty) > 0:
            line = await db.get(GoodsReceivingItem, c.grn_item_id)
            if line:
                rej_by_item[line.item_id] += _d_safe(c.rejected_qty)
    top = sorted(rej_by_item.items(), key=lambda x: x[1], reverse=True)[:10]
    top_out = []
    from app.models.costing import Item

    for iid, qty in top:
        it = await db.get(Item, iid)
        top_out.append(
            {
                "item_id": iid,
                "item_code": it.item_code if it else None,
                "item_name": it.name if it else None,
                "rejected_qty": str(qty),
            }
        )
    scorecard = await grn_qc_service.vendor_scorecard(db, tenant.id, days=30)
    return {
        "pending_count": int(pending or 0),
        "pass_rate_pct": round(100.0 * pass_n / total, 2),
        "fail_rate_pct": round(100.0 * fail_n / total, 2),
        "completed_last_30_days": len(completed),
        "top_rejected_items": top_out,
        "vendor_alerts": [s for s in scorecard if s.get("alert")],
    }


def _d_safe(v) -> Decimal:
    try:
        return Decimal(str(v or 0))
    except Exception:
        return Decimal("0")


@router.get("/quality/vendor-scorecard")
async def quality_vendor_scorecard(
    days: int = Query(default=90, ge=7, le=365),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_qc(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_VENDOR_SCORECARD_VIEW
    )
    return await grn_qc_service.vendor_scorecard(db, tenant.id, days=days)


@router.get("/quality/vendors/{vendor_id}/rejection-rate")
async def vendor_rejection_rate(
    vendor_id: int,
    days: int = Query(default=90, ge=7, le=365),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_qc(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_VENDOR_SCORECARD_VIEW
    )
    rate = await grn_qc_service.vendor_rejection_rate(db, tenant.id, vendor_id, days=days)
    return {"vendor_id": vendor_id, "rejection_rate_pct": rate, "days": days}
