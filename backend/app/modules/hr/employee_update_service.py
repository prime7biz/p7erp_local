"""Apply a field update to an existing employee (shared by PATCH /hr/employees/{id} and approved change requests).

Every permission and data rule of the direct edit lives here, so an approved change request is checked
exactly like a direct save. ``actor`` is the user whose permissions apply (the person who asked for the
change); ``audit_user_id`` is who is recorded in the audit log. Nothing here commits.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authz import get_user_role_scoped_to_tenant
from app.common.permissions import HR_SETUP_BYPASS_ROLES, PERMISSION_HR_PAYROLL_MANAGE, assert_hr_manager_or_permission
from app.common.tenant_feature_keys import is_age_verification_required
from app.models import Tenant, User
from app.models.hr import Employee
from app.modules.audit.service import log_action
from app.modules.hr import employee_service
from app.modules.hr.employee_identity import assert_identity_complete, assert_identity_unique, identity_required
from app.modules.hr_compliance.service import assert_dob_allowed

SENSITIVE_FIELDS = (
    *employee_service.IDENTITY_PROFILE_FIELDS,
    *employee_service.PAYMENT_FIELDS,
    *employee_service.LEGACY_SENSITIVE_FIELDS,
)


def _strip(value: Any) -> str | None:
    return value.strip() if value else None


async def apply_employee_update(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    row: Employee,
    payload: dict[str, Any],
    audit_user_id: int | None = None,
) -> employee_service.EmployeeFieldAccess:
    """Validate and apply ``payload`` (an ``EmployeeUpdate`` dump with ``exclude_unset``) to ``row``.

    Raises ``HTTPException`` for any refused change. ``payload`` may be edited in place (masked resubmits
    dropped, identity numbers normalised).
    """
    # The linked login decides whose payslips and ESS data a user sees.
    if "user_id" in payload and payload["user_id"] != row.user_id:
        await assert_hr_manager_or_permission(db, actor, tenant.id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    # Activation has its own manager-only endpoints, so a plain edit must not flip it.
    if "is_active" in payload and bool(payload["is_active"]) != bool(row.is_active):
        role = await get_user_role_scoped_to_tenant(db, actor, tenant.id)
        if (role.name if role else "").strip().lower() not in HR_SETUP_BYPASS_ROLES:
            raise HTTPException(status_code=403, detail="Only manager/admin can perform this action")
    access = await employee_service.employee_field_access(db, actor, tenant.id)
    # Masked fields come back as null in a resubmitted form and must not overwrite real data.
    employee_service.drop_masked_resubmits(access, payload)
    employee_service.assert_protected_writes_allowed(access, payload, row)
    sensitive_before = {f: getattr(row, f) for f in SENSITIVE_FIELDS}
    if "date_of_birth" in payload:
        assert_dob_allowed(payload.get("date_of_birth"), required=is_age_verification_required(tenant.feature_flags))
    await employee_service.validate_fk_values(
        db,
        tenant.id,
        payload.get("department_id"),
        payload.get("designation_id"),
        payload.get("reporting_manager_id"),
        user_id=payload.get("user_id"),
        employee_id=row.id,
        section_id=payload.get("section_id"),
    )
    # Manpower quota: reassign into a full cell, or activate into a full cell, needs a free slot.
    from app.modules.hr_manpower.quota_guard import consume_exception_slot, guard_and_prepare

    new_dept = payload["department_id"] if "department_id" in payload else row.department_id
    new_desig = payload["designation_id"] if "designation_id" in payload else row.designation_id
    new_active = bool(payload["is_active"]) if "is_active" in payload else bool(row.is_active)
    cell_changing = ("department_id" in payload and payload["department_id"] != row.department_id) or (
        "designation_id" in payload and payload["designation_id"] != row.designation_id
    )
    activating = (not row.is_active) and new_active
    exception_id = None
    if new_active and (activating or cell_changing):
        exception_id = await guard_and_prepare(
            db,
            tenant,
            department_id=new_dept,
            designation_id=new_desig,
            exclude_employee_id=row.id,
        )
    if "employee_code" in payload and payload["employee_code"] is not None:
        if payload["employee_code"].strip() != row.employee_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The employee number is permanent and cannot be changed",
            )
    new_nid = payload["national_id"] if "national_id" in payload else row.national_id
    new_brn = payload["birth_registration_no"] if "birth_registration_no" in payload else row.birth_registration_no
    new_phone = payload["phone"] if "phone" in payload else row.phone
    if any(k in payload for k in ("national_id", "birth_registration_no", "phone")):
        new_nid, new_brn, new_phone = employee_service.identity_inputs(tenant, new_nid, new_brn, new_phone)
        if identity_required(tenant.feature_flags):
            assert_identity_complete(national_id=new_nid, birth_registration_no=new_brn, phone=new_phone)
            await assert_identity_unique(db, tenant.id, national_id=new_nid, birth_registration_no=new_brn, exclude_id=row.id)
        payload["national_id"], payload["birth_registration_no"], payload["phone"] = new_nid, new_brn, new_phone
    if "birth_registration_no" in payload:
        row.birth_registration_no = payload["birth_registration_no"] or None
    if "first_name" in payload and payload["first_name"] is not None:
        row.first_name = payload["first_name"].strip()
    for key in (
        "last_name", "email", "phone", "gender", "marital_status", "blood_group", "emergency_contact_name",
        "emergency_contact_phone", "address_line", "city", "country", "national_id", "employment_type",
        "employee_category",
    ):
        if key in payload:
            setattr(row, key, _strip(payload[key]))
    for key in (
        "joining_date", "date_of_birth", "confirmation_date", "exit_date", "department_id", "designation_id",
        "section_id", "reporting_manager_id", "user_id",
    ):
        if key in payload:
            setattr(row, key, payload[key])
    if "is_active" in payload:
        row.is_active = bool(payload["is_active"])
    if "attendance_device_pin" in payload:
        row.attendance_device_pin = employee_service.clean_device_pin(payload["attendance_device_pin"])
    employee_service.apply_onboarding_fields(row, payload)
    if exception_id is not None and row.is_active:
        await consume_exception_slot(
            db,
            tenant_id=tenant.id,
            exception_id=exception_id,
            employee_id=row.id,
            user_id=audit_user_id if audit_user_id is not None else actor.id,
        )
    sensitive_changed = sorted(f for f, before in sensitive_before.items() if getattr(row, f) != before)
    if sensitive_changed:
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=audit_user_id if audit_user_id is not None else actor.id,
            action="HR_EMPLOYEE_SENSITIVE_UPDATED",
            resource=f"hr.employee:{row.id}",
            details=",".join(sensitive_changed)[:500],
        )
    return access
