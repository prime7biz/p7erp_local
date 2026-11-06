"""HR settings stored in ``tenants.feature_flags`` (HR -> HR Settings screen).

GET /hr/settings   any HR user
PUT /hr/settings   weekend days: manager/admin or ``hr.attendance.manage``;
                   overtime fields: manager/admin or ``hr.payroll.manage``

Keys: ``hr_weekend_days`` (leave-day counting, default Friday), ``payroll_ot_from_salary_enabled``,
``hr_ot_hours_per_month`` (default 208) and ``hr_ot_multiplier`` (default 2).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_HR_ATTENDANCE_MANAGE,
    PERMISSION_HR_PAYROLL_MANAGE,
    assert_hr_manager_or_permission,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    HR_OT_HOURS_PER_MONTH,
    HR_OT_MULTIPLIER,
    PAYROLL_OT_FROM_SALARY_ENABLED,
    get_hr_ot_hours_per_month,
    get_hr_ot_multiplier,
    is_payroll_ot_from_salary_enabled,
)
from app.database import get_db
from app.models import Tenant, User
from app.modules.audit.service import log_action
from app.modules.hr_leave.leave_days import DEFAULT_WEEKEND_DAYS, HR_WEEKEND_DAYS_KEY, weekday_numbers

router = APIRouter(prefix="/hr/settings", tags=["hr-settings"])

WEEKDAY_NAMES = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
MIN_OT_HOURS_PER_MONTH = 50
MAX_OT_HOURS_PER_MONTH = 400
MAX_OT_MULTIPLIER = 5


class HrSettingsOut(BaseModel):
    weekend_days: list[str]
    weekend_days_is_default: bool
    ot_from_salary_enabled: bool
    ot_hours_per_month: float
    ot_multiplier: float
    can_edit_weekend: bool
    can_edit_overtime: bool


class HrSettingsUpdate(BaseModel):
    weekend_days: list[str] | None = None
    ot_from_salary_enabled: bool | None = None
    ot_hours_per_month: float | None = Field(default=None, description=f"{MIN_OT_HOURS_PER_MONTH}-{MAX_OT_HOURS_PER_MONTH}")
    ot_multiplier: float | None = Field(default=None, description=f"greater than 0, at most {MAX_OT_MULTIPLIER}")


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _allowed(db: AsyncSession, user: User, tenant_id: int, permission_key: str) -> bool:
    try:
        await assert_hr_manager_or_permission(db, user, tenant_id, permission_key=permission_key)
    except HTTPException:
        return False
    return True


def _stored_weekend(flags: dict) -> list[str] | None:
    numbers = weekday_numbers(flags.get(HR_WEEKEND_DAYS_KEY))
    return [WEEKDAY_NAMES[n] for n in sorted(numbers)] if numbers else None


def _plain_number(value: float) -> float | int:
    return int(value) if float(value).is_integer() else value


async def _settings_out(db: AsyncSession, user: User, tenant: Tenant) -> HrSettingsOut:
    flags = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    stored = _stored_weekend(flags)
    return HrSettingsOut(
        weekend_days=stored or list(DEFAULT_WEEKEND_DAYS),
        weekend_days_is_default=stored is None,
        ot_from_salary_enabled=is_payroll_ot_from_salary_enabled(flags),
        ot_hours_per_month=get_hr_ot_hours_per_month(flags),
        ot_multiplier=get_hr_ot_multiplier(flags),
        can_edit_weekend=await _allowed(db, user, tenant.id, PERMISSION_HR_ATTENDANCE_MANAGE),
        can_edit_overtime=await _allowed(db, user, tenant.id, PERMISSION_HR_PAYROLL_MANAGE),
    )


def _clean_weekend_days(days: list[str]) -> list[str]:
    cleaned = {str(d or "").strip().lower() for d in days}
    unknown = sorted(d for d in cleaned if d not in WEEKDAY_NAMES)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown weekday name(s): {', '.join(unknown)}")
    if not cleaned:
        raise HTTPException(status_code=400, detail="Choose at least one weekend day")
    if len(cleaned) >= len(WEEKDAY_NAMES):
        raise HTTPException(status_code=400, detail="At least one day of the week must be a working day")
    return [d for d in WEEKDAY_NAMES if d in cleaned]


@router.get("", response_model=HrSettingsOut)
async def get_hr_settings(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await _settings_out(db, user, tenant)


@router.put("", response_model=HrSettingsOut)
async def update_hr_settings(
    body: HrSettingsUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    payload = body.model_dump(exclude_unset=True)
    updates: dict[str, object] = {}
    if payload.get("weekend_days") is not None:
        await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_ATTENDANCE_MANAGE)
        updates[HR_WEEKEND_DAYS_KEY] = _clean_weekend_days(payload["weekend_days"])
    ot_fields = {k: payload[k] for k in ("ot_from_salary_enabled", "ot_hours_per_month", "ot_multiplier") if payload.get(k) is not None}
    if ot_fields:
        await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
        if "ot_from_salary_enabled" in ot_fields:
            updates[PAYROLL_OT_FROM_SALARY_ENABLED] = bool(ot_fields["ot_from_salary_enabled"])
        if "ot_hours_per_month" in ot_fields:
            hours = float(ot_fields["ot_hours_per_month"])
            if not MIN_OT_HOURS_PER_MONTH <= hours <= MAX_OT_HOURS_PER_MONTH:
                raise HTTPException(
                    status_code=400,
                    detail=f"Hours per month must be between {MIN_OT_HOURS_PER_MONTH} and {MAX_OT_HOURS_PER_MONTH}",
                )
            updates[HR_OT_HOURS_PER_MONTH] = _plain_number(hours)
        if "ot_multiplier" in ot_fields:
            multiplier = float(ot_fields["ot_multiplier"])
            if not 0 < multiplier <= MAX_OT_MULTIPLIER:
                raise HTTPException(
                    status_code=400, detail=f"Overtime multiplier must be more than 0 and at most {MAX_OT_MULTIPLIER}"
                )
            updates[HR_OT_MULTIPLIER] = _plain_number(multiplier)

    if updates:
        # Lock the tenant row and re-read its flags so a parallel settings save is not lost.
        await db.refresh(tenant, attribute_names=["feature_flags"], with_for_update=True)
        flags = dict(tenant.feature_flags) if isinstance(tenant.feature_flags, dict) else {}
        changes = {k: (flags.get(k), v) for k, v in updates.items() if flags.get(k) != v}
        if changes:
            flags.update(updates)
            tenant.feature_flags = flags
            await log_action(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                action="HR_SETTINGS_UPDATED",
                resource="hr.settings",
                details="; ".join(f"{k}: {a} -> {b}" for k, (a, b) in changes.items()),
            )
        await db.commit()
        await db.refresh(tenant)
    return await _settings_out(db, user, tenant)
