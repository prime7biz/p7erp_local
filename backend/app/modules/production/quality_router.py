"""Production module lightweight QC checks and defect codes."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import ProductionDefectCode, ProductionQcCheck, SewingLine, Tenant, User
from app.modules.production.schemas import (
    ProductionDefectCodeCreate,
    ProductionDefectCodeResponse,
    ProductionQcCheckResponse,
    ProductionQcCheckUpsert,
)

router = APIRouter(prefix="/production/quality", tags=["production-quality"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/defect-codes", response_model=list[ProductionDefectCodeResponse])
async def list_defect_codes(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    active_only: bool = Query(True),
):
    _ensure(user, tenant)
    q = select(ProductionDefectCode).where(ProductionDefectCode.tenant_id == tenant.id)
    if active_only:
        q = q.where(ProductionDefectCode.is_active.is_(True))
    q = q.order_by(ProductionDefectCode.code)
    rows = list((await db.execute(q)).scalars().all())
    return [
        ProductionDefectCodeResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            code=r.code,
            name=r.name,
            category=r.category,
            severity=r.severity,
            is_active=r.is_active,
        )
        for r in rows
    ]


@router.post("/defect-codes", response_model=ProductionDefectCodeResponse)
async def create_defect_code(
    body: ProductionDefectCodeCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = ProductionDefectCode(
        tenant_id=tenant.id,
        code=body.code.strip(),
        name=body.name.strip(),
        category=body.category,
        severity=body.severity or "medium",
        is_active=body.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ProductionDefectCodeResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        code=row.code,
        name=row.name,
        category=row.category,
        severity=row.severity,
        is_active=row.is_active,
    )


@router.delete("/defect-codes/{code_id}", status_code=204)
async def delete_defect_code(
    code_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(ProductionDefectCode, code_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Not found")
    await db.delete(row)
    await db.commit()


@router.get("/checks", response_model=list[ProductionQcCheckResponse])
async def list_qc_checks(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    production_date: str = Query(...),
    shift_id: int | None = Query(None),
    line_id: int | None = Query(None),
):
    _ensure(user, tenant)
    d = date.fromisoformat(production_date)
    q = select(ProductionQcCheck).where(
        ProductionQcCheck.tenant_id == tenant.id,
        ProductionQcCheck.production_date == d,
    )
    if shift_id is not None:
        q = q.where(ProductionQcCheck.shift_id == shift_id)
    if line_id is not None:
        q = q.where(ProductionQcCheck.sewing_line_id == line_id)
    rows = list((await db.execute(q)).scalars().all())
    return [
        ProductionQcCheckResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            sewing_line_id=r.sewing_line_id,
            shift_id=r.shift_id,
            production_date=r.production_date.isoformat(),
            hour_slot=r.hour_slot,
            check_type=r.check_type,
            total_checked=r.total_checked,
            pass_qty=r.pass_qty,
            fail_qty=r.fail_qty,
            defect_codes=r.defect_codes if isinstance(r.defect_codes, list) else [],
            notes=r.notes,
        )
        for r in rows
    ]


@router.put("/checks", response_model=ProductionQcCheckResponse)
async def upsert_qc_check(
    body: ProductionQcCheckUpsert,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    line = await db.get(SewingLine, body.sewing_line_id)
    if not line or line.tenant_id != tenant.id:
        raise HTTPException(404, "Line not found")
    d = date.fromisoformat(body.production_date)
    r = (
        await db.execute(
            select(ProductionQcCheck).where(
                ProductionQcCheck.tenant_id == tenant.id,
                ProductionQcCheck.sewing_line_id == body.sewing_line_id,
                ProductionQcCheck.shift_id == body.shift_id,
                ProductionQcCheck.production_date == d,
                ProductionQcCheck.hour_slot == body.hour_slot,
                ProductionQcCheck.check_type == body.check_type,
            )
        )
    ).scalar_one_or_none()
    if r:
        r.total_checked = int(body.total_checked or 0)
        r.pass_qty = int(body.pass_qty or 0)
        r.fail_qty = int(body.fail_qty or 0)
        r.defect_codes = body.defect_codes
        r.notes = body.notes
        r.entered_by_user_id = user.id
    else:
        r = ProductionQcCheck(
            tenant_id=tenant.id,
            sewing_line_id=body.sewing_line_id,
            shift_id=body.shift_id,
            production_date=d,
            hour_slot=body.hour_slot,
            check_type=body.check_type,
            total_checked=int(body.total_checked or 0),
            pass_qty=int(body.pass_qty or 0),
            fail_qty=int(body.fail_qty or 0),
            defect_codes=body.defect_codes,
            notes=body.notes,
            entered_by_user_id=user.id,
        )
        db.add(r)
    await db.commit()
    await db.refresh(r)
    return ProductionQcCheckResponse(
        id=r.id,
        tenant_id=r.tenant_id,
        sewing_line_id=r.sewing_line_id,
        shift_id=r.shift_id,
        production_date=r.production_date.isoformat(),
        hour_slot=r.hour_slot,
        check_type=r.check_type,
        total_checked=r.total_checked,
        pass_qty=r.pass_qty,
        fail_qty=r.fail_qty,
        defect_codes=r.defect_codes if isinstance(r.defect_codes, list) else [],
        notes=r.notes,
    )


@router.delete("/checks/{check_id}", status_code=204)
async def delete_qc_check(
    check_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(ProductionQcCheck, check_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Not found")
    await db.delete(row)
    await db.commit()
