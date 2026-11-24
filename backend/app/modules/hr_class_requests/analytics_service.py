"""HR analytics (hr_analytics_v1). Bounded 366-day window; payroll masked without key."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authz import get_user_role_scoped_to_tenant
from app.common.business_date import today_local
from app.common.permissions import PERMISSION_HR_PAYROLL_MANAGE, internal_permission_granted
from app.common.tenant_feature_keys import is_hr_analytics_v1_enabled
from app.models import LeaveRequest, Tenant, User
from app.models.hr import Employee
from app.models.hr_class_request import HrClassRequest, OPEN_HR_CLASS_STATUSES


async def analytics_summary(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    from_date: date | None = None,
    to_date: date | None = None,
) -> dict[str, Any]:
    if not is_hr_analytics_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=409, detail="HR analytics is switched off")
    today = today_local(tenant)
    end = to_date or today
    start = from_date or (end - timedelta(days=90))
    if (end - start).days > 366:
        raise HTTPException(status_code=400, detail="Analytics window cannot exceed 366 days")
    if start > end:
        raise HTTPException(status_code=400, detail="from_date must be on or before to_date")

    headcount = (
        await db.execute(
            select(func.count()).select_from(Employee).where(
                Employee.tenant_id == tenant.id, Employee.is_active.is_(True)
            )
        )
    ).scalar_one()
    exits = (
        await db.execute(
            select(func.count()).select_from(Employee).where(
                Employee.tenant_id == tenant.id,
                Employee.exit_date.is_not(None),
                Employee.exit_date >= start,
                Employee.exit_date <= end,
            )
        )
    ).scalar_one()
    leave_days = (
        await db.execute(
            select(func.count()).select_from(LeaveRequest).where(
                LeaveRequest.tenant_id == tenant.id,
                LeaveRequest.status == "APPROVED",
                LeaveRequest.from_date >= start,
                LeaveRequest.from_date <= end,
            )
        )
    ).scalar_one()
    pending = (
        await db.execute(
            select(HrClassRequest)
            .where(
                HrClassRequest.tenant_id == tenant.id,
                HrClassRequest.status.in_(OPEN_HR_CLASS_STATUSES),
            )
            .order_by(HrClassRequest.created_at.asc())
            .limit(100)
        )
    ).scalars().all()
    ages = []
    for row in pending:
        created = row.created_at.date() if row.created_at else today
        ages.append({"id": row.id, "kind": row.kind, "status": row.status, "age_days": (today - created).days})

    role = await get_user_role_scoped_to_tenant(db, user, tenant.id)
    can_pay = internal_permission_granted(role=role, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    return {
        "from_date": start.isoformat(),
        "to_date": end.isoformat(),
        "headcount_active": int(headcount or 0),
        "attrition_exits": int(exits or 0),
        "approved_leave_requests": int(leave_days or 0),
        "pending_approvals": ages,
        "payroll_metrics_masked": not can_pay,
        "overtime_hours": None if not can_pay else "0",
    }
