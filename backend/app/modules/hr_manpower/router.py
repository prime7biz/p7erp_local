"""HR Manpower Control APIs. Mounted under hr.access; gated by manpower_control_v1.

Sanctioned / settings (Phase 1) plus quota exceptions (Phase 2).
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import MAX_PAGE_SIZE
from app.common.permissions import (
    PERMISSION_HR_MANPOWER_EXCEPTION_REQUEST,
    PERMISSION_HR_MANPOWER_MANAGE,
    PERMISSION_HR_MANPOWER_READ,
    assert_hr_manager_or_permission,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_manpower_control_v1_enabled,
    is_manpower_smv_panel_v1_enabled,
)
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.modules.hr_manpower import daily_attendance_service as daily_svc
from app.modules.hr_manpower import exception_service as exc_svc
from app.modules.hr_manpower import organogram_service as org_svc
from app.modules.hr_manpower import sanctioned_service as svc
from app.modules.hr_manpower import smv_ratios_service as smv_svc
from app.modules.hr_manpower.schemas import (
    DepartmentGroupOut,
    DepartmentGroupUpsert,
    ExceptionCreate,
    ExceptionDecision,
    ManpowerSettingsOut,
    ManpowerSettingsUpdate,
    SanctionedRowOut,
    SanctionedUpsert,
    SeedFromCurrentOut,
    StandingSummaryOut,
)

router = APIRouter(prefix="/hr/manpower", tags=["hr-manpower"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _require_flag(tenant: Tenant) -> None:
    if not is_manpower_control_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manpower control is not enabled")


def _require_smv_flag(tenant: Tenant) -> None:
    _require_flag(tenant)
    if not is_manpower_smv_panel_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manpower SMV panel is not enabled")


async def _require_read(db: AsyncSession, user: User, tenant: Tenant) -> None:
    _ensure_tenant(user, tenant)
    _require_flag(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_MANPOWER_READ)


async def _require_manage(db: AsyncSession, user: User, tenant: Tenant) -> None:
    _ensure_tenant(user, tenant)
    _require_flag(tenant)
    await assert_hr_manager_or_permission(
        db, user, tenant.id, permission_key=PERMISSION_HR_MANPOWER_MANAGE
    )


@router.get("/sanctioned", response_model=list[SanctionedRowOut])
async def list_sanctioned(
    department_id: int | None = Query(None),
    designation_id: int | None = Query(None),
    as_of: date | None = Query(None),
    limit: int = Query(200, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_read(db, user, tenant)
    try:
        return await svc.list_sanctioned(
            db,
            tenant.id,
            department_id=department_id,
            designation_id=designation_id,
            as_of=as_of,
            limit=limit,
            offset=offset,
        )
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.put("/sanctioned", response_model=SanctionedRowOut)
async def upsert_sanctioned(
    body: SanctionedUpsert,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_manage(db, user, tenant)
    try:
        return await svc.upsert_sanctioned(db, tenant.id, user.id, body)
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.get("/standing-summary", response_model=StandingSummaryOut)
async def standing_summary(
    as_of: date | None = Query(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_read(db, user, tenant)
    try:
        return await svc.standing_summary(db, tenant.id, as_of=as_of)
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.post("/sanctioned/seed-from-current", response_model=SeedFromCurrentOut)
async def seed_from_current(
    as_of: date | None = Query(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_manage(db, user, tenant)
    try:
        return await svc.seed_from_current(db, tenant.id, user.id, as_of=as_of)
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.get("/settings", response_model=ManpowerSettingsOut)
async def get_settings(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_read(db, user, tenant)
    try:
        return await svc.get_settings(db, tenant.id)
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.put("/settings", response_model=ManpowerSettingsOut)
async def put_settings(
    body: ManpowerSettingsUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_manage(db, user, tenant)
    try:
        return await svc.put_settings(db, tenant.id, user.id, body)
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.get("/department-groups", response_model=list[DepartmentGroupOut])
async def list_department_groups(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_read(db, user, tenant)
    try:
        return await svc.list_department_groups(db, tenant.id)
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.put("/department-groups", response_model=DepartmentGroupOut)
async def upsert_department_group(
    body: DepartmentGroupUpsert,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_manage(db, user, tenant)
    try:
        return await svc.upsert_department_group(db, tenant.id, user.id, body)
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.get("/exceptions")
async def list_exceptions(
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    await _require_read(db, user, tenant)
    try:
        return await exc_svc.list_exceptions(
            db, tenant.id, status_filter=status_filter, limit=limit, offset=offset
        )
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.post("/exceptions", status_code=status.HTTP_201_CREATED)
async def create_exception(
    body: ExceptionCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await _require_read(db, user, tenant)
    await assert_hr_manager_or_permission(
        db, user, tenant.id, permission_key=PERMISSION_HR_MANPOWER_EXCEPTION_REQUEST
    )
    try:
        return await exc_svc.create_exception(
            db,
            tenant_id=tenant.id,
            user=user,
            department_id=body.department_id,
            designation_id=body.designation_id,
            extra_slots=body.extra_slots,
            reason=body.reason,
            request_id=body.request_id,
            expires_on=body.expires_on,
        )
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.post("/exceptions/{exception_id}/decision")
async def decide_exception(
    exception_id: int,
    body: ExceptionDecision,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _ensure_tenant(user, tenant)
    _require_flag(tenant)
    try:
        return await exc_svc.decide_exception(
            db,
            tenant_id=tenant.id,
            user=user,
            exception_id=exception_id,
            decision=body.decision,
            note=body.note,
        )
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.post("/exceptions/{exception_id}/cancel")
async def cancel_exception(
    exception_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await _require_read(db, user, tenant)
    try:
        return await exc_svc.cancel_exception(
            db, tenant_id=tenant.id, user=user, exception_id=exception_id
        )
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.get("/organogram")
async def organogram(
    date_on: date | None = Query(None, alias="date"),
    root_offset: int = Query(0, ge=0),
    root_limit: int = Query(50, ge=1, le=100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await _require_read(db, user, tenant)
    try:
        return await org_svc.build_organogram(
            db,
            tenant,
            on=date_on or date.today(),
            root_offset=root_offset,
            root_limit=root_limit,
        )
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.get("/attendance-bridge")
async def attendance_bridge(
    date_on: date | None = Query(None, alias="date"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await _require_read(db, user, tenant)
    try:
        return await org_svc.attendance_bridge(db, tenant.id, on=date_on or date.today())
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.get("/daily-attendance")
async def daily_attendance(
    date_on: date | None = Query(None, alias="date"),
    group_by: str = Query("department"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await _require_read(db, user, tenant)
    try:
        return await daily_svc.build_daily_attendance(
            db,
            tenant.id,
            on=date_on or date.today(),
            group_by=group_by,  # type: ignore[arg-type]
        )
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.get("/smv-comparison")
async def smv_comparison(
    as_of: date | None = Query(None),
    lookback_days: int = Query(14, ge=1, le=90),
    limit: int = Query(50, ge=1, le=100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _ensure_tenant(user, tenant)
    _require_smv_flag(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_MANPOWER_READ)
    try:
        return await smv_svc.build_smv_comparison(
            db, tenant.id, as_of=as_of, lookback_days=lookback_days, limit=limit
        )
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.get("/ratios")
async def manpower_ratios(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    _ensure_tenant(user, tenant)
    _require_smv_flag(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_MANPOWER_READ)
    try:
        return await smv_svc.build_ratios(db, tenant.id)
    except Exception:
        await safe_async_session_rollback(db)
        raise
