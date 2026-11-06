"""Sprint I1: MRP, auto-reorder, IDT, process loss APIs."""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_INVENTORY_IDT_CREATE,
    PERMISSION_INVENTORY_IDT_RECEIVE,
    PERMISSION_INVENTORY_IDT_VIEW,
    PERMISSION_INVENTORY_MRP_RUN,
    PERMISSION_INVENTORY_PLANNED_ORDER_FIRM,
    PERMISSION_INVENTORY_PLANNED_ORDER_RELEASE,
    PERMISSION_INVENTORY_PLANNED_ORDER_VIEW,
    PERMISSION_INVENTORY_POST_COSTING_VIEW,
    PERMISSION_INVENTORY_PROCESS_LOSS_CONFIG,
    PERMISSION_INVENTORY_PROCESS_LOSS_VIEW,
    PERMISSION_INVENTORY_REORDER_SUGGESTION_APPROVE,
    PERMISSION_INVENTORY_REORDER_SUGGESTION_CONVERT,
    PERMISSION_INVENTORY_REORDER_SUGGESTION_VIEW,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_auto_reorder_enabled,
    is_inter_department_transfer_enabled,
    is_mrp_engine_enabled,
    is_process_loss_tracking_enabled,
)
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.costing import Item
from app.models.inventory import (
    InterDepartmentTransfer,
    InterDepartmentTransferLine,
    PlannedOrder,
    ProcessLossStandard,
    ReorderSuggestion,
)
from app.modules.inventory import idt_service, mrp_engine_service, process_loss_service, reorder_service
from app.modules.inventory.mrp_idt_schemas import (
    BOMExplosionLineOut,
    BulkConvertBody,
    ConvertResultOut,
    IDTCreateBody,
    IDTLineOut,
    IDTOut,
    IDTReceiveBody,
    MRPExceptionOut,
    MRPRunBody,
    MRPRunResultOut,
    PlannedOrderOut,
    PostCostingReportOut,
    PostCostingStageOut,
    ProcessLossReportOut,
    ProcessLossReportRowOut,
    ProcessLossStandardIn,
    ProcessLossStandardOut,
    ReleaseResultOut,
    ReorderCheckResultOut,
    ReorderSuggestionOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/inventory", tags=["inventory-mrp-idt"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


def _require_mrp(tenant: Tenant) -> None:
    if not is_mrp_engine_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="MRP engine is disabled. Enable tenant feature flag mrp_engine_enabled.",
        )


def _require_reorder(tenant: Tenant) -> None:
    if not is_auto_reorder_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="Auto-reorder is disabled. Enable tenant feature flag auto_reorder_enabled.",
        )


def _require_idt(tenant: Tenant) -> None:
    if not is_inter_department_transfer_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="Inter-department transfer is disabled. Enable inter_department_transfer_enabled.",
        )


def _require_process_loss(tenant: Tenant) -> None:
    if not is_process_loss_tracking_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="Process loss tracking is disabled. Enable process_loss_tracking_enabled.",
        )


def _dec_str(v: Decimal | None) -> str | None:
    if v is None:
        return None
    return str(v)


def _planned_out(row: PlannedOrder) -> PlannedOrderOut:
    return PlannedOrderOut(
        id=row.id,
        planned_order_number=row.planned_order_number,
        source_type=row.source_type,
        source_order_id=row.source_order_id,
        source_bom_id=row.source_bom_id,
        item_id=row.item_id,
        required_qty=str(row.required_qty),
        planned_qty=str(row.planned_qty),
        requirement_date=row.requirement_date,
        release_date=row.release_date,
        action=row.action,
        status=row.status,
        generated_po_id=row.generated_po_id,
        generated_mo_id=row.generated_mo_id,
        created_at=row.created_at,
    )


def _suggestion_out(row: ReorderSuggestion) -> ReorderSuggestionOut:
    return ReorderSuggestionOut(
        id=row.id,
        item_id=row.item_id,
        warehouse_id=row.warehouse_id,
        current_stock=str(row.current_stock),
        reorder_level=str(row.reorder_level),
        suggested_qty=str(row.suggested_qty),
        preferred_vendor_id=row.preferred_vendor_id,
        estimated_cost=_dec_str(row.estimated_cost),
        status=row.status,
        generated_po_id=row.generated_po_id,
        created_at=row.created_at,
    )


async def _idt_out(db: AsyncSession, row: InterDepartmentTransfer) -> IDTOut:
    lines = list(
        (
            await db.execute(
                select(InterDepartmentTransferLine).where(
                    InterDepartmentTransferLine.idt_id == row.id
                )
            )
        )
        .scalars()
        .all()
    )
    return IDTOut(
        id=row.id,
        idt_number=row.idt_number,
        idt_date=row.idt_date,
        from_warehouse_id=row.from_warehouse_id,
        to_warehouse_id=row.to_warehouse_id,
        process_name=row.process_name,
        source_item_id=row.source_item_id,
        source_qty_issued=str(row.source_qty_issued),
        source_qty_unit=row.source_qty_unit,
        source_batch_id=row.source_batch_id,
        target_item_id=row.target_item_id,
        target_qty_expected=str(row.target_qty_expected),
        target_qty_received=_dec_str(row.target_qty_received),
        target_qty_unit=row.target_qty_unit,
        process_loss_qty=_dec_str(row.process_loss_qty),
        process_loss_percent=_dec_str(row.process_loss_percent),
        standard_process_loss_percent=_dec_str(row.standard_process_loss_percent),
        loss_exception=bool(row.loss_exception),
        is_job_work=bool(row.is_job_work),
        job_work_vendor_id=row.job_work_vendor_id,
        job_work_cost_per_unit=_dec_str(row.job_work_cost_per_unit),
        job_work_total_cost=_dec_str(row.job_work_total_cost),
        transport_cost=str(row.transport_cost or 0),
        other_charges=str(row.other_charges or 0),
        status=row.status,
        source_item_cost=_dec_str(row.source_item_cost),
        target_item_value=_dec_str(row.target_item_value),
        linked_order_id=row.linked_order_id,
        narration=row.narration,
        lines=[
            IDTLineOut(
                id=ln.id,
                source_item_id=ln.source_item_id,
                source_qty=str(ln.source_qty),
                source_batch_id=ln.source_batch_id,
                source_unit_cost=_dec_str(ln.source_unit_cost),
            )
            for ln in lines
        ],
        created_at=row.created_at,
    )


# --- MRP ---


@router.post("/mrp/run", response_model=MRPRunResultOut)
async def run_mrp(
    body: MRPRunBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mrp(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_MRP_RUN
    )
    try:
        result = await mrp_engine_service.run_mrp(
            db,
            tenant.id,
            order_ids=body.order_ids,
            item_ids=body.item_ids,
            horizon_days=body.horizon_days,
            as_of_date=body.as_of_date,
        )
        await db.commit()
        for po in result.planned_orders:
            await db.refresh(po)
        return MRPRunResultOut(
            planned_orders=[_planned_out(p) for p in result.planned_orders],
            exceptions=[
                MRPExceptionOut(
                    severity=e.severity,
                    code=e.code,
                    message=e.message,
                    item_id=e.item_id,
                    order_id=e.order_id,
                )
                for e in result.exceptions
            ],
            explosion=[
                BOMExplosionLineOut(
                    level=x.level,
                    item_id=x.item_id,
                    item_code=x.item_code,
                    parent_item_id=x.parent_item_id,
                    qty_per=str(x.qty_per),
                    required_qty=str(x.required_qty),
                    bom_id=x.bom_id,
                    source_order_id=x.source_order_id,
                )
                for x in result.explosion
            ],
        )
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except ValueError as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        await safe_async_session_rollback(db)
        logger.exception("MRP run failed tenant_id=%s", tenant.id)
        raise HTTPException(
            status_code=500, detail="Could not run MRP. Please try again or contact support."
        ) from exc


@router.get("/mrp/planned-orders", response_model=list[PlannedOrderOut])
async def list_planned_orders(
    status: str | None = None,
    item_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mrp(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_PLANNED_ORDER_VIEW
    )
    q = select(PlannedOrder).where(PlannedOrder.tenant_id == tenant.id)
    if status:
        q = q.where(PlannedOrder.status == status)
    if item_id:
        q = q.where(PlannedOrder.item_id == item_id)
    if date_from:
        q = q.where(PlannedOrder.requirement_date >= date_from)
    if date_to:
        q = q.where(PlannedOrder.requirement_date <= date_to)
    q = q.order_by(PlannedOrder.requirement_date.asc(), PlannedOrder.id.asc())
    rows = list((await db.execute(q)).scalars().all())
    return [_planned_out(r) for r in rows]


@router.post("/mrp/planned-orders/{planned_order_id}/firm", response_model=PlannedOrderOut)
async def firm_planned_order(
    planned_order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mrp(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_PLANNED_ORDER_FIRM
    )
    try:
        row = await mrp_engine_service.firm_planned_order(db, tenant.id, planned_order_id)
        await db.commit()
        await db.refresh(row)
        return _planned_out(row)
    except ValueError as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/mrp/planned-orders/{planned_order_id}/release", response_model=ReleaseResultOut)
async def release_planned_order(
    planned_order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mrp(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_PLANNED_ORDER_RELEASE
    )
    try:
        row, generated = await mrp_engine_service.release_planned_order(
            db, tenant.id, planned_order_id, user_id=user.id
        )
        await db.commit()
        await db.refresh(row)
        doc_type = None
        doc_number = None
        if row.generated_po_id and generated is not None:
            doc_type = "PO"
            doc_number = getattr(generated, "po_code", None)
        elif row.generated_mo_id and generated is not None:
            doc_type = "MO"
            doc_number = getattr(generated, "mo_number", None)
        return ReleaseResultOut(
            planned_order=_planned_out(row),
            generated_po_id=row.generated_po_id,
            generated_mo_id=row.generated_mo_id,
            document_type=doc_type,
            document_number=doc_number,
        )
    except ValueError as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --- Reorder ---


@router.get("/reorder-suggestions", response_model=list[ReorderSuggestionOut])
async def list_reorder_suggestions(
    status: str | None = None,
    item_id: int | None = None,
    warehouse_id: int | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_reorder(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_REORDER_SUGGESTION_VIEW
    )
    q = select(ReorderSuggestion).where(ReorderSuggestion.tenant_id == tenant.id)
    if status:
        q = q.where(ReorderSuggestion.status == status)
    if item_id:
        q = q.where(ReorderSuggestion.item_id == item_id)
    if warehouse_id:
        q = q.where(ReorderSuggestion.warehouse_id == warehouse_id)
    q = q.order_by(ReorderSuggestion.id.desc())
    rows = list((await db.execute(q)).scalars().all())
    return [_suggestion_out(r) for r in rows]


@router.post("/reorder/check-all", response_model=ReorderCheckResultOut)
async def check_all_reorder(
    warehouse_id: int | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_reorder(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_REORDER_SUGGESTION_APPROVE
    )
    items_checked = (
        await db.execute(
            select(Item).where(
                Item.tenant_id == tenant.id,
                Item.auto_reorder_enabled.is_(True),
                Item.is_active.is_(True),
            )
        )
    ).scalars().all()
    created = await reorder_service.check_reorder_points(db, tenant.id, warehouse_id=warehouse_id)
    await db.commit()
    for s in created:
        await db.refresh(s)
    return ReorderCheckResultOut(
        suggestions_created=len(created),
        items_checked=len(list(items_checked)),
        suggestions=[_suggestion_out(s) for s in created],
    )


@router.post("/reorder-suggestions/{suggestion_id}/approve", response_model=ReorderSuggestionOut)
async def approve_reorder_suggestion(
    suggestion_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_reorder(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_REORDER_SUGGESTION_APPROVE
    )
    try:
        row = await reorder_service.approve_suggestion(db, tenant.id, suggestion_id)
        await db.commit()
        await db.refresh(row)
        return _suggestion_out(row)
    except ValueError as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/reorder-suggestions/{suggestion_id}/reject", response_model=ReorderSuggestionOut)
async def reject_reorder_suggestion(
    suggestion_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_reorder(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_REORDER_SUGGESTION_APPROVE
    )
    try:
        row = await reorder_service.reject_suggestion(db, tenant.id, suggestion_id)
        await db.commit()
        await db.refresh(row)
        return _suggestion_out(row)
    except ValueError as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/reorder-suggestions/{suggestion_id}/convert", response_model=ConvertResultOut)
async def convert_reorder_suggestion(
    suggestion_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_reorder(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_REORDER_SUGGESTION_CONVERT
    )
    try:
        sug, po = await reorder_service.generate_po_from_suggestion(db, tenant.id, suggestion_id)
        await db.commit()
        await db.refresh(sug)
        await db.refresh(po)
        return ConvertResultOut(
            suggestion=_suggestion_out(sug),
            purchase_order_id=po.id,
            po_code=po.po_code,
        )
    except ValueError as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/reorder-suggestions/bulk-convert", response_model=list[ConvertResultOut])
async def bulk_convert_reorder(
    body: BulkConvertBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_reorder(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_REORDER_SUGGESTION_CONVERT
    )
    results: list[ConvertResultOut] = []
    try:
        for sid in body.suggestion_ids:
            sug, po = await reorder_service.generate_po_from_suggestion(db, tenant.id, sid)
            results.append(
                ConvertResultOut(
                    suggestion=_suggestion_out(sug),
                    purchase_order_id=po.id,
                    po_code=po.po_code,
                )
            )
        await db.commit()
        return results
    except ValueError as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --- IDT ---


@router.post("/inter-department-transfers", response_model=IDTOut)
async def create_idt(
    body: IDTCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_idt(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_IDT_CREATE
    )
    try:
        lines = None
        if body.lines:
            lines = [ln.model_dump() for ln in body.lines]
        idt = await idt_service.create_idt_issue(
            db,
            tenant,
            from_warehouse_id=body.from_warehouse_id,
            to_warehouse_id=body.to_warehouse_id,
            process_name=body.process_name,
            source_item_id=body.source_item_id,
            source_qty=body.source_qty,
            source_qty_unit=body.source_qty_unit,
            target_item_id=body.target_item_id,
            target_qty_expected=body.target_qty_expected,
            target_qty_unit=body.target_qty_unit,
            user_id=user.id,
            idt_date=body.idt_date,
            source_batch_id=body.source_batch_id,
            is_job_work=body.is_job_work,
            job_work_vendor_id=body.job_work_vendor_id,
            job_work_cost_per_unit=body.job_work_cost_per_unit,
            transport_cost=body.transport_cost,
            other_charges=body.other_charges,
            linked_order_id=body.linked_order_id,
            narration=body.narration,
            lines=lines,
        )
        await db.commit()
        await db.refresh(idt)
        return await _idt_out(db, idt)
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        logger.exception("IDT create failed tenant_id=%s", tenant.id)
        raise HTTPException(
            status_code=500,
            detail="Could not create inter-department transfer. Please try again or contact support.",
        ) from exc


@router.get("/inter-department-transfers", response_model=list[IDTOut])
async def list_idt(
    status: str | None = None,
    process_name: str | None = None,
    from_warehouse: int | None = None,
    to_warehouse: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_idt(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_IDT_VIEW
    )
    q = select(InterDepartmentTransfer).where(InterDepartmentTransfer.tenant_id == tenant.id)
    if status:
        q = q.where(InterDepartmentTransfer.status == status)
    if process_name:
        q = q.where(InterDepartmentTransfer.process_name == process_name)
    if from_warehouse:
        q = q.where(InterDepartmentTransfer.from_warehouse_id == from_warehouse)
    if to_warehouse:
        q = q.where(InterDepartmentTransfer.to_warehouse_id == to_warehouse)
    if date_from:
        q = q.where(InterDepartmentTransfer.idt_date >= date_from)
    if date_to:
        q = q.where(InterDepartmentTransfer.idt_date <= date_to)
    q = q.order_by(InterDepartmentTransfer.idt_date.desc(), InterDepartmentTransfer.id.desc())
    rows = list((await db.execute(q)).scalars().all())
    return [await _idt_out(db, r) for r in rows]


@router.get("/inter-department-transfers/{idt_id}", response_model=IDTOut)
async def get_idt(
    idt_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_idt(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_IDT_VIEW
    )
    row = await db.get(InterDepartmentTransfer, idt_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="IDT not found")
    return await _idt_out(db, row)


@router.post("/inter-department-transfers/{idt_id}/receive", response_model=IDTOut)
async def receive_idt(
    idt_id: int,
    body: IDTReceiveBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_idt(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_IDT_RECEIVE
    )
    try:
        idt = await idt_service.receive_idt(
            db,
            tenant,
            idt_id,
            body.target_qty_received,
            user_id=user.id,
            target_batch_number=body.target_batch_number,
            notes=body.notes,
        )
        await db.commit()
        await db.refresh(idt)
        return await _idt_out(db, idt)
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        logger.exception("IDT receive failed tenant_id=%s idt_id=%s", tenant.id, idt_id)
        raise HTTPException(
            status_code=500,
            detail="Could not receive inter-department transfer. Please try again or contact support.",
        ) from exc


# --- Process loss standards / reports ---


@router.get("/process-loss-standards", response_model=list[ProcessLossStandardOut])
async def list_process_loss_standards(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_process_loss(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_PROCESS_LOSS_VIEW
    )
    rows = await process_loss_service.ensure_default_standards(db, tenant.id)
    await db.commit()
    return [
        ProcessLossStandardOut(
            id=r.id,
            process_name=r.process_name,
            standard_loss_percent=str(r.standard_loss_percent),
            warning_threshold_percent=str(r.warning_threshold_percent),
            item_category_id=r.item_category_id,
            is_active=r.is_active,
        )
        for r in rows
    ]


@router.post("/process-loss-standards", response_model=ProcessLossStandardOut)
async def create_process_loss_standard(
    body: ProcessLossStandardIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_process_loss(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_PROCESS_LOSS_CONFIG
    )
    row = ProcessLossStandard(
        tenant_id=tenant.id,
        process_name=body.process_name,
        standard_loss_percent=body.standard_loss_percent,
        warning_threshold_percent=body.warning_threshold_percent,
        item_category_id=body.item_category_id,
        is_active=body.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ProcessLossStandardOut(
        id=row.id,
        process_name=row.process_name,
        standard_loss_percent=str(row.standard_loss_percent),
        warning_threshold_percent=str(row.warning_threshold_percent),
        item_category_id=row.item_category_id,
        is_active=row.is_active,
    )


@router.get("/reports/process-loss", response_model=ProcessLossReportOut)
async def process_loss_report(
    from_date: date = Query(...),
    to_date: date = Query(...),
    process_name: str | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_process_loss(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_PROCESS_LOSS_VIEW
    )
    report = await process_loss_service.get_process_loss_report(
        db, tenant.id, from_date, to_date, process_name=process_name
    )
    return ProcessLossReportOut(
        from_date=report.from_date,
        to_date=report.to_date,
        rows=[
            ProcessLossReportRowOut(
                process_name=r.process_name,
                total_issued=str(r.total_issued),
                total_received=str(r.total_received),
                total_loss=str(r.total_loss),
                loss_percent=str(r.loss_percent),
                standard_percent=str(r.standard_percent),
                variance_percent=str(r.variance_percent),
                status=r.status,
                exception_count=r.exception_count,
            )
            for r in report.rows
        ],
    )


@router.get("/reports/post-costing", response_model=PostCostingReportOut)
async def post_costing_report(
    order_id: int = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_process_loss(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_POST_COSTING_VIEW
    )
    try:
        report = await process_loss_service.get_post_costing_report(db, tenant.id, order_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return PostCostingReportOut(
        order_id=report.order_id,
        order_code=report.order_code,
        order_qty=report.order_qty,
        stages=[
            PostCostingStageOut(
                stage=s.stage,
                input_qty=_dec_str(s.input_qty),
                output_qty=_dec_str(s.output_qty),
                loss_percent=_dec_str(s.loss_percent),
                input_cost=_dec_str(s.input_cost),
                job_work=_dec_str(s.job_work),
                output_cost_per_unit=_dec_str(s.output_cost_per_unit),
                idt_id=s.idt_id,
                loss_exception=s.loss_exception,
            )
            for s in report.stages
        ],
        final_unit_cost=_dec_str(report.final_unit_cost),
        standard_unit_cost=_dec_str(report.standard_unit_cost),
        cost_variance=_dec_str(report.cost_variance),
        cost_variance_pct=_dec_str(report.cost_variance_pct),
        variance_drivers=report.variance_drivers,
    )
