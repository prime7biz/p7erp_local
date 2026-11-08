"""Employee building blocks shared by POST /hr/employees, PATCH /hr/employees/{id} and onboarding.

``build_employee`` validates and adds a new employee without committing, so the onboarding saga can
insert the employee and link its run row in one transaction.

Field access (who may see / change what):
* identity, family and address fields - visible with HR sensitive access; changing them needs
  ``hr.identity.manage`` (manager-type roles pass).
* bank and salary-payment fields - visible and changeable only with ``hr.payroll.manage``.
A field the caller cannot see is returned as null and listed in ``masked_fields``; a resubmitted
masked value is ignored, never written.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authz import get_user_role_scoped_to_tenant
from app.common.permissions import (
    HR_SETUP_BYPASS_ROLES,
    PERMISSION_HR_IDENTITY_MANAGE,
    PERMISSION_HR_PAYROLL_MANAGE,
    assert_hr_manager_or_permission,
    internal_permission_granted,
)
from app.common.tenant_feature_keys import is_age_verification_required
from app.models import Department, Designation, Employee, HrSection, Tenant, User
from app.modules.hr.employee_identity import (
    assert_identity_complete,
    assert_identity_unique,
    identity_required,
    next_employee_code,
    normalize_digits,
    normalize_mobile,
    validate_identity_values,
)
from app.modules.hr.schemas import EmployeeCreate, EmployeePaySnapshot, EmployeeResponse
from app.modules.hr_compliance.service import assert_dob_allowed

# city / country hold the present address once onboarding fields are used, so they are masked with it.
LEGACY_SENSITIVE_FIELDS = ("date_of_birth", "address_line", "city", "country", "national_id", "birth_registration_no")
PRESENT_ADDRESS_FIELDS = (
    "present_address_line",
    "present_city",
    "present_district",
    "present_postal_code",
    "present_country",
)
PERMANENT_ADDRESS_FIELDS = (
    "permanent_address_line",
    "permanent_city",
    "permanent_district",
    "permanent_postal_code",
    "permanent_country",
)
IDENTITY_PROFILE_FIELDS = (
    "father_name",
    "mother_name",
    "spouse_name",
    "religion",
    "nationality",
    *PRESENT_ADDRESS_FIELDS,
    *PERMANENT_ADDRESS_FIELDS,
    "emergency_contact_relation",
    "mobile_is_bkash",
)
PAYMENT_FIELDS = (
    "salary_payment_method",
    "bank_account_name",
    "bank_account_number",
    "bank_name",
    "bank_branch",
    "bank_routing_no",
)
ONBOARDING_FIELDS = (*IDENTITY_PROFILE_FIELDS, *PAYMENT_FIELDS, "probation_months", "facilities")


@dataclass(frozen=True)
class EmployeeFieldAccess:
    can_view_sensitive: bool
    can_manage_identity: bool
    can_manage_payroll: bool

    def masked_fields(self) -> list[str]:
        hidden: list[str] = []
        if not self.can_view_sensitive:
            hidden += [*LEGACY_SENSITIVE_FIELDS, *IDENTITY_PROFILE_FIELDS]
        if not self.can_manage_payroll:
            hidden += list(PAYMENT_FIELDS)
        return hidden


FULL_ACCESS = EmployeeFieldAccess(True, True, True)


async def employee_field_access(db: AsyncSession, user: User, tenant_id: int) -> EmployeeFieldAccess:
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    if (role.name if role else "").strip().lower() in HR_SETUP_BYPASS_ROLES:
        return FULL_ACCESS
    payroll = internal_permission_granted(role=role, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    return EmployeeFieldAccess(
        can_view_sensitive=payroll or internal_permission_granted(role=role, permission_key="hr.access"),
        can_manage_identity=internal_permission_granted(role=role, permission_key=PERMISSION_HR_IDENTITY_MANAGE),
        can_manage_payroll=payroll,
    )


def employee_to_response(
    row: Employee,
    access: EmployeeFieldAccess = FULL_ACCESS,
    *,
    pay_snapshot: EmployeePaySnapshot | None = None,
) -> EmployeeResponse:
    out = EmployeeResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_code=row.employee_code,
        first_name=row.first_name,
        last_name=row.last_name,
        email=row.email,
        phone=row.phone,
        joining_date=row.joining_date,
        date_of_birth=row.date_of_birth,
        gender=row.gender,
        marital_status=row.marital_status,
        blood_group=row.blood_group,
        emergency_contact_name=row.emergency_contact_name,
        emergency_contact_phone=row.emergency_contact_phone,
        address_line=row.address_line,
        city=row.city,
        country=row.country,
        national_id=row.national_id,
        employment_type=row.employment_type,
        confirmation_date=row.confirmation_date,
        exit_date=row.exit_date,
        department_id=row.department_id,
        designation_id=row.designation_id,
        section_id=row.section_id,
        employee_category=row.employee_category,
        reporting_manager_id=row.reporting_manager_id,
        user_id=row.user_id,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
        attendance_device_pin=row.attendance_device_pin,
        birth_registration_no=row.birth_registration_no,
        has_photo=bool(row.photo_path),
        facilities=list(row.facilities) if isinstance(row.facilities, list) else None,
        pay_snapshot=pay_snapshot,
        **{f: getattr(row, f) for f in ONBOARDING_FIELDS if f != "facilities"},
    )
    hidden = access.masked_fields()
    if hidden:
        out = out.model_copy(update={**{f: None for f in hidden}, "masked_fields": hidden})
    return out


def identity_inputs(tenant: Tenant, national_id, birth_registration_no, phone):
    """Normalized (national_id, birth_registration_no, phone); validated under Bangladesh identity rules."""
    if not identity_required(tenant.feature_flags):
        return (
            national_id.strip() if national_id else None,
            birth_registration_no.strip() if birth_registration_no else None,
            phone.strip() if phone else None,
        )
    nid, brn, mobile = normalize_digits(national_id), normalize_digits(birth_registration_no), normalize_mobile(phone)
    validate_identity_values(national_id=nid, birth_registration_no=brn, phone=mobile)
    return nid, brn, mobile


async def get_department_or_404(db: AsyncSession, tenant_id: int, department_id: int) -> Department:
    row = await db.get(Department, department_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    return row


async def get_designation_or_404(db: AsyncSession, tenant_id: int, designation_id: int) -> Designation:
    row = await db.get(Designation, designation_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Designation not found")
    return row


async def get_employee_or_404(db: AsyncSession, tenant_id: int, employee_id: int) -> Employee:
    row = await db.get(Employee, employee_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return row


async def validate_fk_values(
    db: AsyncSession,
    tenant_id: int,
    department_id: int | None,
    designation_id: int | None,
    reporting_manager_id: int | None,
    user_id: int | None = None,
    employee_id: int | None = None,
    section_id: int | None = None,
) -> None:
    if department_id is not None:
        await get_department_or_404(db, tenant_id, department_id)
    if designation_id is not None:
        await get_designation_or_404(db, tenant_id, designation_id)
    if section_id is not None:
        sec = await db.get(HrSection, section_id)
        if not sec or sec.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    if reporting_manager_id is not None:
        manager = await get_employee_or_404(db, tenant_id, reporting_manager_id)
        if employee_id is not None and manager.id == employee_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee cannot report to self")
        if employee_id is not None:
            # Guard against manager-cycle chains like A->B->C->A.
            cursor_id = manager.reporting_manager_id
            while cursor_id is not None:
                parent = await get_employee_or_404(db, tenant_id, cursor_id)
                if parent.id == employee_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Reporting manager creates a cycle in hierarchy",
                    )
                cursor_id = parent.reporting_manager_id
    if user_id is not None:
        linked_user = await db.get(User, user_id)
        if not linked_user or linked_user.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked user not found in tenant")
        existing_link = (
            await db.execute(
                select(Employee.id).where(
                    Employee.tenant_id == tenant_id,
                    Employee.user_id == user_id,
                    Employee.id != (employee_id or 0),
                )
            )
        ).first()
        if existing_link:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This user is already linked to another employee",
            )


def clean_device_pin(value: str | None) -> str | None:
    return (value or "").strip() or None


def _clean(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip() or None
    return value


def _is_blank(value: Any) -> bool:
    return value is None or value is False or value == "" or value == []


def assert_protected_writes_allowed(
    access: EmployeeFieldAccess, values: dict[str, Any], current: Employee | None = None
) -> None:
    """403 when a field is set (create) or changed (update) without the matching permission.

    Call after ``drop_masked_resubmits`` so fields the caller cannot see were already removed.
    """

    def changed(field: str) -> bool:
        new = _clean(values[field])
        if current is None:
            return not _is_blank(new)
        old = getattr(current, field)
        if field == "facilities":
            old = list(old) if isinstance(old, list) else None
        return (None if _is_blank(new) else new) != (None if _is_blank(old) else old)

    if not access.can_manage_identity:
        blocked = [f for f in IDENTITY_PROFILE_FIELDS if f in values and changed(f)]
        if blocked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires manager/admin role or permission '{PERMISSION_HR_IDENTITY_MANAGE}' to change: "
                + ", ".join(blocked),
            )
    if not access.can_manage_payroll:
        blocked = [f for f in PAYMENT_FIELDS if f in values and changed(f)]
        if blocked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires manager/admin role or permission '{PERMISSION_HR_PAYROLL_MANAGE}' to change: "
                + ", ".join(blocked),
            )


def drop_masked_resubmits(access: EmployeeFieldAccess, payload: dict[str, Any]) -> None:
    for field in access.masked_fields():
        payload.pop(field, None)


def apply_onboarding_fields(row: Employee, values: dict[str, Any]) -> None:
    """Set migration-288 columns present in ``values``; mirror the present address into the legacy columns."""
    previous_present = {f: getattr(row, f) for f in PRESENT_ADDRESS_FIELDS}
    for field in ONBOARDING_FIELDS:
        if field not in values:
            continue
        value = values[field]
        if field == "facilities":
            row.facilities = list(value) if value else None
        elif field == "mobile_is_bkash":
            row.mobile_is_bkash = value
        elif field == "probation_months":
            row.probation_months = value
        else:
            setattr(row, field, _clean(value))
    if not any(f in values for f in PRESENT_ADDRESS_FIELDS):
        return
    if any(getattr(row, f) for f in PRESENT_ADDRESS_FIELDS):
        row.address_line = row.present_address_line
        row.city = row.present_city
        row.country = row.present_country
    elif any(previous_present.values()) and (row.address_line, row.city, row.country) == (
        previous_present["present_address_line"],
        previous_present["present_city"],
        previous_present["present_country"],
    ):
        # A deliberately cleared present address also clears its legacy copy; an older employee whose
        # address only lives in the legacy columns (no present address yet) keeps it.
        row.address_line = row.city = row.country = None


async def build_employee(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    body: EmployeeCreate,
    access: EmployeeFieldAccess,
) -> Employee:
    """Validate, number and add a new employee. Flushes, never commits.

    Raises ``IntegrityError`` from the flush on a duplicate employee code / device PIN.
    """
    values = body.model_dump()
    assert_protected_writes_allowed(access, values)
    if body.user_id is not None:
        await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    assert_dob_allowed(body.date_of_birth, required=is_age_verification_required(tenant.feature_flags))
    national_id, birth_reg, phone = identity_inputs(tenant, body.national_id, body.birth_registration_no, body.phone)
    if identity_required(tenant.feature_flags):
        assert_identity_complete(national_id=national_id, birth_registration_no=birth_reg, phone=phone)
        await assert_identity_unique(db, tenant.id, national_id=national_id, birth_registration_no=birth_reg)
    employee_code = await next_employee_code(db, tenant.id, tenant.feature_flags)
    await validate_fk_values(
        db,
        tenant.id,
        body.department_id,
        body.designation_id,
        body.reporting_manager_id,
        user_id=body.user_id,
        section_id=body.section_id,
    )
    row = Employee(
        tenant_id=tenant.id,
        employee_code=employee_code,
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip() if body.last_name else None,
        email=body.email.strip() if body.email else None,
        phone=phone,
        joining_date=body.joining_date,
        date_of_birth=body.date_of_birth,
        gender=body.gender.strip() if body.gender else None,
        marital_status=body.marital_status.strip() if body.marital_status else None,
        blood_group=body.blood_group.strip() if body.blood_group else None,
        emergency_contact_name=body.emergency_contact_name.strip() if body.emergency_contact_name else None,
        emergency_contact_phone=body.emergency_contact_phone.strip() if body.emergency_contact_phone else None,
        address_line=body.address_line.strip() if body.address_line else None,
        city=body.city.strip() if body.city else None,
        country=body.country.strip() if body.country else None,
        national_id=national_id,
        birth_registration_no=birth_reg,
        employment_type=body.employment_type.strip() if body.employment_type else None,
        confirmation_date=body.confirmation_date,
        exit_date=body.exit_date,
        department_id=body.department_id,
        designation_id=body.designation_id,
        section_id=body.section_id,
        employee_category=body.employee_category.strip() if body.employee_category else None,
        reporting_manager_id=body.reporting_manager_id,
        user_id=body.user_id,
        is_active=body.is_active,
        attendance_device_pin=clean_device_pin(body.attendance_device_pin),
    )
    onboarding = {f: values[f] for f in ONBOARDING_FIELDS if not _is_blank(values.get(f))}
    if values.get("mobile_is_bkash") is not None:
        onboarding["mobile_is_bkash"] = values["mobile_is_bkash"]
    if any(f in onboarding for f in PRESENT_ADDRESS_FIELDS):
        onboarding.update({f: values.get(f) for f in PRESENT_ADDRESS_FIELDS})
    apply_onboarding_fields(row, onboarding)
    db.add(row)
    await db.flush()
    return row
