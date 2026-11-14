"""Employee change requests: submit, Tier 1 / Tier 2 decision, apply, cancel.

Flow: the maker submits the same body the direct endpoint takes -> PENDING_TIER1 -> Tier 1 approves ->
PENDING_TIER2 -> Tier 2 approves -> the change is applied through the same service functions the direct
endpoints use, inside the approval transaction -> APPLIED. A rejection at either tier ends it (REJECTED).
If the employee changed after the request (``before`` no longer matches) or a rule refuses the change at
apply time (for example a locked payroll period), the request ends as FAILED with the reason and nothing
is written.

Rules:
* Tier keys are strict (``explicit_permission_granted``): no admin / manager / wildcard bypass.
* The maker cannot approve at either tier; the Tier 1 approver cannot give the Tier 2 approval.
* Pay kinds (COMPENSATION, PAY_BENEFITS, TAX_PROFILE) also need ``hr.payroll.manage`` for the maker and
  both approvers, and their amounts are shown only to users with that permission.
* The maker's permissions are checked again when the change is applied (``actor`` = maker).
Nothing here commits; the router owns the transaction.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authz import get_user_role_scoped_to_tenant
from app.common.pagination import MAX_PAGE_SIZE
from app.common.permissions import (
    HR_SETUP_BYPASS_ROLES,
    PERMISSION_HR_EMPLOYEE_CHANGE_TIER1,
    PERMISSION_HR_EMPLOYEE_CHANGE_TIER2,
    PERMISSION_HR_PAYROLL_MANAGE,
    assert_hr_manager_or_permission,
    explicit_permission_granted,
    internal_permission_granted,
)
from app.common.tenant_feature_keys import is_hr_employee_change_approval_enabled
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_bd import HrBdEmployeeWageAssignment
from app.models.hr_change_request import OPEN_CHANGE_STATUSES, HrEmployeeChangeRequest
from app.models.hr_payroll import PayrollEmployeeStructureAssignment
from app.modules.audit.service import log_action
from app.modules.hr import employee_service, employee_update_service
from app.modules.hr import tax_profile as tax
from app.modules.hr.schemas import EmployeeCompensationReplace, EmployeeUpdate, PayBenefitsUpdate
from app.modules.hr_allowances import pay_benefits as benefits
from app.modules.hr_localization import bd_salary_tds_service as tds_service
from app.modules.hr_payroll import compensation_service as comp

PAY_KINDS = ("COMPENSATION", "PAY_BENEFITS", "TAX_PROFILE")
TIER_KEYS = {1: PERMISSION_HR_EMPLOYEE_CHANGE_TIER1, 2: PERMISSION_HR_EMPLOYEE_CHANGE_TIER2}
MAX_REASON = 2000
MAX_NOTE = 2000

BODY_MODELS: dict[str, type[BaseModel]] = {
    "INFO": EmployeeUpdate,
    "COMPENSATION": EmployeeCompensationReplace,
    "PAY_BENEFITS": PayBenefitsUpdate,
    "TAX_PROFILE": tax.TaxProfileBody,
}


def jsonable(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return value


def parse_body(kind: str, payload: Any) -> BaseModel:
    model = BODY_MODELS.get(kind)
    if model is None:
        raise HTTPException(status_code=400, detail="Unknown change type")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="payload must be an object")
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=jsonable(exc.errors(include_url=False, include_context=False))) from exc


def _body_values(kind: str, body: BaseModel) -> dict[str, Any]:
    return body.model_dump(exclude_unset=True) if kind == "INFO" else body.model_dump()


# --- current values ("before") ----------------------------------------------------------------------


async def current_values(db: AsyncSession, tenant_id: int, row: Employee, kind: str, body: BaseModel) -> dict[str, Any]:
    """What the request replaces. Applying fails if these values moved after the request was made."""
    if kind == "INFO":
        keys = [k for k in _body_values(kind, body) if hasattr(row, k)]
        return jsonable({k: getattr(row, k) for k in keys})
    if kind == "COMPENSATION":
        asg = (
            await db.execute(
                select(PayrollEmployeeStructureAssignment)
                .where(
                    PayrollEmployeeStructureAssignment.tenant_id == tenant_id,
                    PayrollEmployeeStructureAssignment.employee_id == row.id,
                )
                .order_by(PayrollEmployeeStructureAssignment.effective_from.desc(), PayrollEmployeeStructureAssignment.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        wage = (
            await db.execute(
                select(HrBdEmployeeWageAssignment)
                .where(HrBdEmployeeWageAssignment.tenant_id == tenant_id, HrBdEmployeeWageAssignment.employee_id == row.id)
                .order_by(HrBdEmployeeWageAssignment.effective_from.desc(), HrBdEmployeeWageAssignment.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        return jsonable(
            {
                "structure_assignment_id": asg.id if asg else None,
                "structure_id": asg.structure_id if asg else None,
                "base_salary": asg.base_salary if asg else None,
                "effective_from": asg.effective_from if asg else None,
                "effective_to": asg.effective_to if asg else None,
                "structure_updated_at": asg.updated_at if asg else None,
                "wage_assignment_id": wage.id if wage else None,
                "wage_rate_id": wage.wage_rate_id if wage else None,
                "wage_updated_at": wage.updated_at if wage else None,
            }
        )
    if kind == "PAY_BENEFITS":
        rows = (await benefits.benefits_by_employee(db, tenant_id, [row.id])).get(row.id, {})
        return jsonable({"benefits": benefits.benefits_view(rows)})
    profile = await tds_service.get_tax_profile(db, tenant_id, row.id)
    return jsonable({"profile": tax.profile_out(profile)})


# --- apply ------------------------------------------------------------------------------------------


async def _apply(
    db: AsyncSession, *, tenant: Tenant, actor: User, audit_user_id: int, row: Employee, kind: str, body: BaseModel
) -> None:
    """Write the change through the same functions the direct endpoints use. Raises HTTPException if refused."""
    if kind == "INFO":
        payload = _body_values(kind, body)
        await employee_update_service.apply_employee_update(
            db, tenant=tenant, actor=actor, row=row, payload=payload, audit_user_id=audit_user_id
        )
        await db.flush()
        return
    await assert_hr_manager_or_permission(db, actor, tenant.id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    if kind == "COMPENSATION":
        assert isinstance(body, EmployeeCompensationReplace)
        result = await comp.replace_employee_compensation(
            db,
            tenant=tenant,
            employee_id=row.id,
            structure_id=body.structure_id,
            bd_wage_rate_id=body.bd_wage_rate_id,
            base_salary=body.base_salary,
            effective_from=body.effective_from,
            actor_id=actor.id,
            component_overrides=body.component_overrides,
            change_type=body.change_type,
            change_note=body.change_note,
        )
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=audit_user_id,
            action="HR_EMPLOYEE_COMPENSATION_REPLACED",
            resource=f"hr.employee:{row.id}",
            details=comp.audit_details(result, body.effective_from),
        )
        return
    await comp.lock_employee(db, tenant.id, row.id)
    if kind == "PAY_BENEFITS":
        assert isinstance(body, PayBenefitsUpdate)
        switched_off = await benefits.upsert_pay_benefits(
            db, tenant_id=tenant.id, employee_id=row.id, items=body.benefits, actor_id=actor.id
        )
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=audit_user_id,
            action="HR_EMPLOYEE_PAY_BENEFITS_UPDATED",
            resource=f"hr.employee:{row.id}",
            details=f"codes={sorted(b.benefit_code for b in body.benefits)} off={switched_off}",
        )
        return
    assert isinstance(body, tax.TaxProfileBody)
    changed = await tax.upsert_tax_profile(db, tenant_id=tenant.id, employee_id=row.id, body=body, actor_id=actor.id)
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=audit_user_id,
        action="HR_EMPLOYEE_TAX_PROFILE_UPDATED",
        resource=f"hr.employee:{row.id}",
        details=f"fields={changed}",
    )


async def _dry_run(db: AsyncSession, *, tenant: Tenant, actor: User, row: Employee, kind: str, body: BaseModel) -> None:
    """Run the full apply inside a savepoint and always undo it: a bad request fails now, not at Tier 2."""
    savepoint = await db.begin_nested()
    try:
        await _apply(db, tenant=tenant, actor=actor, audit_user_id=actor.id, row=row, kind=kind, body=body)
        await db.flush()
    except IntegrityError as exc:
        await savepoint.rollback()
        raise HTTPException(status_code=409, detail="This change clashes with existing data (duplicate value)") from exc
    except Exception:
        await savepoint.rollback()
        raise
    await savepoint.rollback()


# --- permissions ------------------------------------------------------------------------------------


async def _role(db: AsyncSession, user: User, tenant_id: int):
    return await get_user_role_scoped_to_tenant(db, user, tenant_id)


async def _has_payroll(db: AsyncSession, user: User, tenant_id: int) -> bool:
    role = await _role(db, user, tenant_id)
    if (role.name if role else "").strip().lower() in HR_SETUP_BYPASS_ROLES:
        return True
    return internal_permission_granted(role=role, permission_key=PERMISSION_HR_PAYROLL_MANAGE)


async def viewer_rights(db: AsyncSession, user: User, tenant_id: int) -> dict[str, bool]:
    role = await _role(db, user, tenant_id)
    return {
        "can_tier1": explicit_permission_granted(role=role, permission_key=PERMISSION_HR_EMPLOYEE_CHANGE_TIER1),
        "can_tier2": explicit_permission_granted(role=role, permission_key=PERMISSION_HR_EMPLOYEE_CHANGE_TIER2),
        "can_view_pay": await _has_payroll(db, user, tenant_id),
    }


def _require_flag(tenant: Tenant) -> None:
    if not is_hr_employee_change_approval_enabled(tenant.feature_flags):
        raise HTTPException(status_code=409, detail="Employee change approval is switched off; save the change directly")


# --- load -------------------------------------------------------------------------------------------


async def _employee(db: AsyncSession, tenant_id: int, employee_id: int, *, lock: bool = False) -> Employee:
    if lock:
        return await comp.lock_employee(db, tenant_id, employee_id)
    return await employee_service.get_employee_or_404(db, tenant_id, employee_id)


async def _request_locked(db: AsyncSession, tenant_id: int, request_pk: int) -> HrEmployeeChangeRequest:
    row = (
        await db.execute(
            select(HrEmployeeChangeRequest)
            .where(HrEmployeeChangeRequest.id == request_pk, HrEmployeeChangeRequest.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Change request not found")
    return row


async def get_request(db: AsyncSession, tenant_id: int, request_pk: int) -> HrEmployeeChangeRequest:
    row = await db.get(HrEmployeeChangeRequest, request_pk)
    if row is None or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Change request not found")
    return row


# --- submit -----------------------------------------------------------------------------------------


async def submit(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    employee_id: int,
    kind: str,
    payload: dict[str, Any],
    reason: str,
    request_id: str,
) -> tuple[HrEmployeeChangeRequest, bool]:
    """Returns (request, created). A retry with the same ``request_id`` returns the stored request."""
    _require_flag(tenant)
    existing = (
        await db.execute(
            select(HrEmployeeChangeRequest).where(
                HrEmployeeChangeRequest.tenant_id == tenant.id, HrEmployeeChangeRequest.request_id == request_id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.employee_id != employee_id or existing.kind != kind or existing.requested_by != user.id:
            raise HTTPException(status_code=409, detail="This request id was already used for another change")
        return existing, False
    reason = (reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="A reason is required")
    if len(reason) > MAX_REASON:
        raise HTTPException(status_code=400, detail="The reason is too long")
    body = parse_body(kind, payload)
    if kind == "INFO" and not _body_values(kind, body):
        raise HTTPException(status_code=400, detail="No changes to submit")
    if kind in PAY_KINDS:
        await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    row = await _employee(db, tenant.id, employee_id, lock=True)
    before = await current_values(db, tenant.id, row, kind, body)
    await _dry_run(db, tenant=tenant, actor=user, row=row, kind=kind, body=body)
    now = datetime.utcnow()
    request = HrEmployeeChangeRequest(
        tenant_id=tenant.id,
        employee_id=employee_id,
        kind=kind,
        payload=jsonable(body.model_dump(exclude_unset=True, mode="json") if kind == "INFO" else body.model_dump(mode="json")),
        before=before,
        reason=reason,
        status="PENDING_TIER1",
        request_id=request_id,
        requested_by=user.id,
        requested_at=now,
        created_at=now,
        updated_at=now,
    )
    savepoint = await db.begin_nested()
    try:
        db.add(request)
        await db.flush()
    except IntegrityError as exc:
        await savepoint.rollback()
        raise HTTPException(
            status_code=409, detail="A change of this type for this employee is already waiting for approval"
        ) from exc
    await savepoint.commit()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="HR_CHANGE_REQUESTED",
        resource=f"hr.employee_change:{request.id}",
        details=f"employee={employee_id} kind={kind} fields={sorted(request.payload)[:40]}",
    )
    return request, True


# --- decide -----------------------------------------------------------------------------------------


async def decide(
    db: AsyncSession, *, tenant: Tenant, user: User, request_pk: int, tier: int, decision: str, note: str | None
) -> HrEmployeeChangeRequest:
    _require_flag(tenant)
    decision = (decision or "").strip().upper()
    if decision not in ("APPROVE", "REJECT"):
        raise HTTPException(status_code=400, detail="decision must be APPROVE or REJECT")
    note = (note or "").strip() or None
    if note and len(note) > MAX_NOTE:
        raise HTTPException(status_code=400, detail="The note is too long")
    if decision == "REJECT" and not note:
        raise HTTPException(status_code=400, detail="Give a reason to reject")
    req = await _request_locked(db, tenant.id, request_pk)
    expected = "PENDING_TIER1" if tier == 1 else "PENDING_TIER2"
    decided_by = req.tier1_by if tier == 1 else req.tier2_by
    if req.status != expected:
        # Same person repeating the same tier decision (double click / retry): return what is stored.
        if decided_by == user.id:
            return req
        raise HTTPException(status_code=409, detail=f"The request is {req.status}, not waiting for Tier {tier}")
    role = await _role(db, user, tenant.id)
    if not explicit_permission_granted(role=role, permission_key=TIER_KEYS[tier]):
        raise HTTPException(status_code=403, detail=f"Requires permission '{TIER_KEYS[tier]}'")
    if req.requested_by == user.id:
        raise HTTPException(status_code=403, detail="You cannot approve or reject your own change request")
    if tier == 2 and req.tier1_by == user.id:
        raise HTTPException(status_code=403, detail="The Tier 1 approver cannot also give the Tier 2 approval")
    if req.kind in PAY_KINDS:
        await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    now = datetime.utcnow()
    if tier == 1:
        req.tier1_by, req.tier1_at, req.tier1_note = user.id, now, note
    else:
        req.tier2_by, req.tier2_at, req.tier2_note = user.id, now, note
    req.updated_at = now
    if decision == "REJECT":
        req.status = "REJECTED"
        await log_action(
            db, tenant_id=tenant.id, user_id=user.id, action=f"HR_CHANGE_TIER{tier}_REJECTED",
            resource=f"hr.employee_change:{req.id}", details=f"employee={req.employee_id} kind={req.kind}",
        )
        return req
    if tier == 1:
        req.status = "PENDING_TIER2"
        await log_action(
            db, tenant_id=tenant.id, user_id=user.id, action="HR_CHANGE_TIER1_APPROVED",
            resource=f"hr.employee_change:{req.id}", details=f"employee={req.employee_id} kind={req.kind}",
        )
        return req
    await _apply_approved(db, tenant=tenant, approver=user, req=req)
    return req


async def _fail(db: AsyncSession, tenant: Tenant, approver: User, req: HrEmployeeChangeRequest, reason: str) -> None:
    req.status = "FAILED"
    req.failure_reason = reason[:2000]
    req.updated_at = datetime.utcnow()
    await log_action(
        db, tenant_id=tenant.id, user_id=approver.id, action="HR_CHANGE_FAILED",
        resource=f"hr.employee_change:{req.id}", details=f"employee={req.employee_id} kind={req.kind}",
    )


async def _apply_approved(db: AsyncSession, *, tenant: Tenant, approver: User, req: HrEmployeeChangeRequest) -> None:
    await log_action(
        db, tenant_id=tenant.id, user_id=approver.id, action="HR_CHANGE_TIER2_APPROVED",
        resource=f"hr.employee_change:{req.id}", details=f"employee={req.employee_id} kind={req.kind}",
    )
    maker = await db.get(User, req.requested_by) if req.requested_by else None
    if maker is None or maker.tenant_id != tenant.id or not maker.is_active:
        await _fail(db, tenant, approver, req, "The person who asked for this change is no longer an active user")
        return
    row = await _employee(db, tenant.id, req.employee_id, lock=True)
    try:
        body = parse_body(req.kind, req.payload)
    except HTTPException as exc:
        await _fail(db, tenant, approver, req, f"The stored change is no longer valid: {exc.detail}")
        return
    if await current_values(db, tenant.id, row, req.kind, body) != req.before:
        await _fail(db, tenant, approver, req, "Employee data changed since the request; please submit it again")
        return
    savepoint = await db.begin_nested()
    try:
        await _apply(db, tenant=tenant, actor=maker, audit_user_id=approver.id, row=row, kind=req.kind, body=body)
        await db.flush()
    except HTTPException as exc:
        await savepoint.rollback()
        await _fail(db, tenant, approver, req, str(exc.detail))
        return
    except IntegrityError:
        await savepoint.rollback()
        await _fail(db, tenant, approver, req, "This change clashes with existing data (duplicate value)")
        return
    await savepoint.commit()
    now = datetime.utcnow()
    req.status, req.applied_at, req.updated_at = "APPLIED", now, now
    await log_action(
        db, tenant_id=tenant.id, user_id=approver.id, action="HR_CHANGE_APPLIED",
        resource=f"hr.employee_change:{req.id}", details=f"employee={req.employee_id} kind={req.kind}",
    )


# --- cancel -----------------------------------------------------------------------------------------


async def cancel(db: AsyncSession, *, tenant: Tenant, user: User, request_pk: int) -> HrEmployeeChangeRequest:
    req = await _request_locked(db, tenant.id, request_pk)
    if req.status == "CANCELLED":
        return req
    if req.status not in OPEN_CHANGE_STATUSES:
        raise HTTPException(status_code=409, detail=f"The request is {req.status} and can no longer be cancelled")
    role = await _role(db, user, tenant.id)
    is_manager = (role.name if role else "").strip().lower() in HR_SETUP_BYPASS_ROLES
    if req.requested_by != user.id and not is_manager:
        raise HTTPException(status_code=403, detail="Only the person who asked for the change (or a manager) can cancel it")
    req.status, req.updated_at = "CANCELLED", datetime.utcnow()
    await log_action(
        db, tenant_id=tenant.id, user_id=user.id, action="HR_CHANGE_CANCELLED",
        resource=f"hr.employee_change:{req.id}", details=f"employee={req.employee_id} kind={req.kind}",
    )
    return req


# --- list / output ----------------------------------------------------------------------------------


async def list_requests(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    status: str | None,
    employee_id: int | None,
    view: str | None,
    limit: int,
    offset: int,
) -> list[tuple[HrEmployeeChangeRequest, Employee]]:
    stmt = (
        select(HrEmployeeChangeRequest, Employee)
        .join(
            Employee,
            and_(Employee.id == HrEmployeeChangeRequest.employee_id, Employee.tenant_id == tenant_id),
        )
        .where(HrEmployeeChangeRequest.tenant_id == tenant_id)
    )
    if status:
        stmt = stmt.where(HrEmployeeChangeRequest.status == status)
    if employee_id is not None:
        stmt = stmt.where(HrEmployeeChangeRequest.employee_id == employee_id)
    if view == "tier1":
        stmt = stmt.where(HrEmployeeChangeRequest.status == "PENDING_TIER1", HrEmployeeChangeRequest.requested_by != user.id)
    elif view == "tier2":
        stmt = stmt.where(
            HrEmployeeChangeRequest.status == "PENDING_TIER2",
            HrEmployeeChangeRequest.requested_by != user.id,
            or_(HrEmployeeChangeRequest.tier1_by.is_(None), HrEmployeeChangeRequest.tier1_by != user.id),
        )
    elif view == "mine":
        stmt = stmt.where(HrEmployeeChangeRequest.requested_by == user.id)
    stmt = stmt.order_by(HrEmployeeChangeRequest.created_at.desc(), HrEmployeeChangeRequest.id.desc())
    stmt = stmt.offset(offset).limit(min(limit, MAX_PAGE_SIZE))
    return list((await db.execute(stmt)).all())


def _mask(values: dict[str, Any], masked: set[str]) -> dict[str, Any]:
    return {k: (None if k in masked else v) for k, v in values.items()}


def request_out(
    req: HrEmployeeChangeRequest,
    employee: Employee | None,
    *,
    can_view_pay: bool,
    masked_fields: list[str],
) -> dict[str, Any]:
    """Pay kinds hide amounts without hr.payroll.manage; INFO hides the fields masked for the viewer."""
    hidden = req.kind in PAY_KINDS and not can_view_pay
    masked = set(masked_fields)
    payload = None if hidden else (_mask(req.payload, masked) if req.kind == "INFO" else req.payload)
    before = None if hidden else (_mask(req.before, masked) if req.kind == "INFO" else req.before)
    return {
        "id": req.id,
        "employee_id": req.employee_id,
        "employee_code": employee.employee_code if employee else None,
        "employee_name": " ".join(p for p in (employee.first_name, employee.last_name) if p) if employee else None,
        "kind": req.kind,
        "status": req.status,
        "reason": req.reason,
        "payload": payload,
        "before": before,
        "details_hidden": hidden,
        "masked_fields": sorted(masked & set(req.payload)) if req.kind == "INFO" and not hidden else [],
        "request_id": req.request_id,
        "requested_by": req.requested_by,
        "requested_at": jsonable(req.requested_at),
        "tier1_by": req.tier1_by,
        "tier1_at": jsonable(req.tier1_at),
        "tier1_note": req.tier1_note,
        "tier2_by": req.tier2_by,
        "tier2_at": jsonable(req.tier2_at),
        "tier2_note": req.tier2_note,
        "applied_at": jsonable(req.applied_at),
        "failure_reason": req.failure_reason,
    }
