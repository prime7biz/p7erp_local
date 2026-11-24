"""Printable employee service record (JSON/PDF data)."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authz import get_user_role_scoped_to_tenant
from app.common.ownership import ensure_owned
from app.common.permissions import PERMISSION_HR_PAYROLL_MANAGE, internal_permission_granted
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_class_request import HrClassRequest
from app.modules.hr_class_requests.masking import mask_mapping


async def build_service_record(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    employee_id: int,
) -> dict[str, Any]:
    emp = await ensure_owned(db, Employee, employee_id, tenant.id, "Employee", status_code=404)
    assert emp is not None
    history = (
        await db.execute(
            select(HrClassRequest)
            .where(
                HrClassRequest.tenant_id == tenant.id,
                HrClassRequest.employee_id == employee_id,
                HrClassRequest.status == "APPLIED",
            )
            .order_by(HrClassRequest.applied_at.asc().nulls_last(), HrClassRequest.id.asc())
            .limit(500)
        )
    ).scalars().all()
    role = await get_user_role_scoped_to_tenant(db, user, tenant.id)
    can_pay = internal_permission_granted(role=role, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    events = []
    for row in history:
        events.append(
            mask_mapping(
                {
                    "id": row.id,
                    "request_no": row.request_no,
                    "kind": row.kind,
                    "applied_at": row.applied_at.isoformat() if row.applied_at else None,
                    "reason": row.reason,
                    "payload": row.payload or {},
                },
                can_view_pay=can_pay,
                can_view_identity=True,
            )
        )
    return {
        "employee": {
            "id": emp.id,
            "employee_code": emp.employee_code,
            "name": f"{emp.first_name} {emp.last_name or ''}".strip(),
            "joining_date": emp.joining_date.isoformat() if emp.joining_date else None,
            "exit_date": emp.exit_date.isoformat() if emp.exit_date else None,
            "is_active": emp.is_active,
            "department_id": emp.department_id,
            "designation_id": emp.designation_id,
        },
        "events": events,
    }
