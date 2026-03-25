"""Production cost input, CM analysis, WIP journals."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import CmCostActual, CmOverheadConfig, ProductionCostInput, Tenant, User, WipJournal
from app.modules.production.cm_recalc_service import recalc_cm_cost_actuals
from app.modules.production.schemas import (
    CmOverheadConfigResponse,
    CmOverheadConfigUpsert,
    ProductionCostInputCreate,
    WipJournalCreate,
)
from app.modules.production.wip_voucher_service import create_draft_voucher_for_wip_journal

router = APIRouter(prefix="/production/costs", tags=["production-costs"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.post("/daily")
async def post_daily_cost(
    body: ProductionCostInputCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    d = date.fromisoformat(body.cost_date)
    total = (
        body.labor_cost
        + body.helper_cost
        + body.supervision_cost
        + body.machine_depreciation
        + body.overhead_allocation
        + body.utility_cost
        + body.other_cost
    )
    row = ProductionCostInput(
        tenant_id=tenant.id,
        department_type=body.department_type,
        line_id=body.line_id,
        cost_date=d,
        shift_id=body.shift_id,
        labor_cost=body.labor_cost,
        helper_cost=body.helper_cost,
        supervision_cost=body.supervision_cost,
        machine_depreciation=body.machine_depreciation,
        overhead_allocation=body.overhead_allocation,
        utility_cost=body.utility_cost,
        other_cost=body.other_cost,
        total_cost=total,
        notes=body.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}


@router.get("/cm-analysis")
async def cm_analysis(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    period_date: date = Query(...),
):
    _ensure(user, tenant)
    r = await db.execute(select(CmCostActual).where(CmCostActual.tenant_id == tenant.id, CmCostActual.period_date == period_date))
    rows = list(r.scalars().all())
    return {
        "items": [
            {
                "order_id": x.order_id,
                "style_id": x.style_id,
                "line_id": x.line_id,
                "total_production_cost": float(x.total_production_cost or 0),
                "total_good_output": float(x.total_good_output or 0),
                "actual_cm_per_piece": float(x.actual_cm_per_piece) if x.actual_cm_per_piece else None,
                "quoted_cm_per_piece": float(x.quoted_cm_per_piece) if x.quoted_cm_per_piece else None,
                "variance_pct": float(x.variance_pct) if x.variance_pct else None,
                "is_over_budget": x.is_over_budget,
            }
            for x in rows
        ]
    }


@router.post("/cm-recalc")
async def cm_recalc(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    period_date: date = Query(...),
):
    """Recompute CM actuals from sewing hourly output and daily production cost (pooled by output share)."""
    _ensure(user, tenant)
    result = await recalc_cm_cost_actuals(db, tenant_id=tenant.id, period_date=period_date)
    return {"ok": True, **result}


@router.get("/cm-alerts")
async def cm_alerts(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    r = await db.execute(
        select(CmCostActual).where(CmCostActual.tenant_id == tenant.id, CmCostActual.is_over_budget.is_(True))
    )
    rows = list(r.scalars().all())
    return {"items": [{"order_id": x.order_id, "style_id": x.style_id} for x in rows]}


@router.get("/overhead-config", response_model=list[CmOverheadConfigResponse])
async def list_overhead_config(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    rows = list(
        (
            await db.execute(
                select(CmOverheadConfig)
                .where(CmOverheadConfig.tenant_id == tenant.id)
                .order_by(CmOverheadConfig.cost_category)
            )
        ).scalars().all()
    )
    return [
        CmOverheadConfigResponse(
            id=x.id,
            tenant_id=x.tenant_id,
            cost_category=x.cost_category,
            account_id=x.account_id,
            cost_center_id=x.cost_center_id,
            allocation_method=x.allocation_method,
            is_active=x.is_active,
        )
        for x in rows
    ]


@router.put("/overhead-config", response_model=list[CmOverheadConfigResponse])
async def upsert_overhead_config(
    body: list[CmOverheadConfigUpsert],
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    for row in body:
        ex = (
            await db.execute(
                select(CmOverheadConfig).where(
                    CmOverheadConfig.tenant_id == tenant.id,
                    CmOverheadConfig.cost_category == row.cost_category,
                )
            )
        ).scalar_one_or_none()
        if ex:
            ex.account_id = row.account_id
            ex.cost_center_id = row.cost_center_id
            ex.allocation_method = row.allocation_method
            ex.is_active = row.is_active
        else:
            db.add(
                CmOverheadConfig(
                    tenant_id=tenant.id,
                    cost_category=row.cost_category,
                    account_id=row.account_id,
                    cost_center_id=row.cost_center_id,
                    allocation_method=row.allocation_method,
                    is_active=row.is_active,
                )
            )
    await db.commit()
    return await list_overhead_config(tenant=tenant, user=user, db=db)


@router.post("/wip-journal")
async def create_wip_journal(
    body: WipJournalCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    has_debit = body.gl_debit_account_id is not None
    has_credit = body.gl_credit_account_id is not None
    if has_debit != has_credit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide both gl_debit_account_id and gl_credit_account_id, or neither",
        )
    d = date.fromisoformat(body.journal_date)
    total = body.material_value + body.conversion_cost
    row = WipJournal(
        tenant_id=tenant.id,
        from_department=body.from_department,
        to_department=body.to_department,
        order_id=body.order_id,
        style_id=body.style_id,
        quantity=body.quantity,
        uom=body.uom,
        material_value=body.material_value,
        conversion_cost=body.conversion_cost,
        total_value=total,
        cost_center_id=body.cost_center_id,
        journal_date=d,
        notes=body.notes,
    )
    db.add(row)
    await db.flush()
    voucher_id: int | None = None
    if has_debit and has_credit and body.gl_debit_account_id is not None and body.gl_credit_account_id is not None:
        voucher_id = await create_draft_voucher_for_wip_journal(
            db,
            tenant=tenant,
            user=user,
            wip=row,
            gl_debit_account_id=body.gl_debit_account_id,
            gl_credit_account_id=body.gl_credit_account_id,
        )
        row.voucher_id = voucher_id
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "voucher_id": voucher_id}


@router.get("/wip-journal")
async def list_wip(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    r = await db.execute(select(WipJournal).where(WipJournal.tenant_id == tenant.id).order_by(WipJournal.journal_date.desc()).limit(200))
    rows = list(r.scalars().all())
    return {
        "items": [
            {
                "id": x.id,
                "from_department": x.from_department,
                "to_department": x.to_department,
                "order_id": x.order_id,
                "total_value": float(x.total_value or 0),
                "material_value": float(x.material_value or 0),
                "conversion_cost": float(x.conversion_cost or 0),
                "voucher_id": x.voucher_id,
                "cost_center_id": x.cost_center_id,
                "journal_date": x.journal_date.isoformat(),
            }
            for x in rows
        ]
    }
