"""Retry-safe employee onboarding (one request id = one employee, whatever happens).

Steps, each committed on its own while holding ``FOR UPDATE`` on the run row:
1. employee   - the employee insert, ``run.employee_id`` and the step status commit together, so a
                crash can never leave an employee without its run.
2. payroll    - ``replace_employee_compensation`` (legal wage floors, effective dating, component
                overrides, change type JOINING) and the overtime / bill switches (idempotent upsert).
3. gate_pass  - seven-day temporary pass, created and activated through the gate-pass service.
4. checklist  - truthful DUE tasks (``onboarding_tasks``).

A failed step is recorded (status FAILED + safe error text) and the next call with the same request
id resumes only the steps that are not COMPLETED / SKIPPED. Leaving a step out of a resume call
marks it SKIPPED. Authorisation and related-record ownership are checked before anything is written.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authz import get_user_role_scoped_to_tenant
from app.common.business_date import today_local
from app.common.ownership import ensure_owned
from app.common.permissions import (
    HR_SETUP_BYPASS_ROLES,
    PERMISSION_HR_GATE_PASS_MANAGE,
    PERMISSION_HR_PAYROLL_MANAGE,
    assert_hr_manager_or_permission,
)
from app.database import safe_async_session_rollback
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_bd import HrBdWageScheduleRate
from app.models.hr_lifecycle import HrEmployeeGatePass
from app.models.hr_onboarding import HrEmployeeOnboardingRun
from app.models.hr_payroll import PayrollStructure
from app.modules.audit.service import log_action
from app.modules.hr import employee_service
from app.modules.hr import tax_profile as tax
from app.modules.hr.onboarding_tasks import create_onboarding_tasks
from app.modules.hr.schemas import PAY_BENEFIT_CODES, ComponentOverrides, EmployeeCreate, PayBenefitItem
from app.modules.hr_allowances import pay_benefits as benefits
from app.modules.hr_gate import service as gate_service
from app.modules.hr_payroll import compensation_service as comp

TEMP_PASS_DAYS = 7
EMPLOYEE_DUPLICATE_DETAIL = "Employee code or attendance device PIN already exists"
DONE = ("COMPLETED", "SKIPPED")


class OnboardingCompensation(BaseModel):
    structure_id: int
    bd_wage_rate_id: int | None = None
    base_salary: str | None = Field(None, max_length=32)
    effective_from: date | None = None
    component_overrides: ComponentOverrides | None = None


class OnboardingSteps(BaseModel):
    compensation: OnboardingCompensation | None = None
    # Overtime + bill switches; saved in the payroll step (needs hr.payroll.manage).
    pay_benefits: list[PayBenefitItem] | None = Field(None, max_length=len(PAY_BENEFIT_CODES))
    # Bangladesh salary tax (TDS) profile; saved in the payroll step (needs hr.payroll.manage).
    tax_profile: tax.TaxProfileBody | None = None
    issue_temp_gate_pass: bool = False


class OnboardingRequest(OnboardingSteps):
    request_id: str = Field(..., min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    employee: EmployeeCreate


async def lock_run(db: AsyncSession, tenant_id: int, request_id: str) -> HrEmployeeOnboardingRun | None:
    return (
        await db.execute(
            select(HrEmployeeOnboardingRun)
            .where(HrEmployeeOnboardingRun.tenant_id == tenant_id, HrEmployeeOnboardingRun.request_id == request_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


async def _get_or_create_run(db: AsyncSession, tenant_id: int, request_id: str, actor_id: int) -> HrEmployeeOnboardingRun:
    """Insert-if-missing then lock. A concurrent first request waits on the unique key until this
    transaction ends, then finds the committed row."""
    now = datetime.utcnow()
    await db.execute(
        pg_insert(HrEmployeeOnboardingRun)
        .values(
            tenant_id=tenant_id, request_id=request_id, status="PENDING", employee_step_status="PENDING",
            payroll_step_status="PENDING", gate_pass_step_status="PENDING", checklist_step_status="PENDING",
            created_by=actor_id, created_at=now, updated_at=now,
        )
        .on_conflict_do_nothing(constraint="uq_hr_onboarding_run_request")
    )
    run = await lock_run(db, tenant_id, request_id)
    if run is None:
        raise HTTPException(status_code=409, detail="Onboarding run could not be locked; retry")
    return run


async def _employee(db: AsyncSession, tenant_id: int, employee_id: int | None) -> Employee:
    row = None
    if employee_id is not None:
        row = (
            await db.execute(
                select(Employee)
                .where(Employee.id == employee_id, Employee.tenant_id == tenant_id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=409, detail="The onboarding run has no employee; start a new onboarding")
    return row


async def _authorize(
    db: AsyncSession, *, tenant: Tenant, user: User, steps: OnboardingSteps, phone: str | None
) -> None:
    if steps.compensation is not None or steps.pay_benefits or steps.tax_profile is not None:
        await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    if steps.compensation is not None:
        await ensure_owned(db, PayrollStructure, steps.compensation.structure_id, tenant.id, "Payroll structure", status_code=404)
        await ensure_owned(db, HrBdWageScheduleRate, steps.compensation.bd_wage_rate_id, tenant.id, "Wage rate", status_code=404)
        comp.parse_money(steps.compensation.base_salary)
    for item in steps.pay_benefits or []:
        benefits.parse_bill_amount(item.amount_override, item.benefit_code)
    if steps.tax_profile is not None:
        tax.parse_profile(steps.tax_profile)
    if steps.issue_temp_gate_pass:
        await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_GATE_PASS_MANAGE)
        if not (phone or "").strip():
            raise HTTPException(status_code=400, detail="A mobile number is needed for the temporary gate pass")


async def assert_run_access(db: AsyncSession, user: User, tenant_id: int, run: HrEmployeeOnboardingRun) -> None:
    """Only the user who started the onboarding, or a manager-type role, may read or resume it."""
    if run.created_by == user.id:
        return
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    if (role.name if role else "").strip().lower() in HR_SETUP_BYPASS_ROLES:
        return
    raise HTTPException(status_code=404, detail="Onboarding run not found")


def _record_error(run: HrEmployeeOnboardingRun, step: str, exc: Exception) -> None:
    if isinstance(exc, HTTPException):
        code, message = f"http_{exc.status_code}", str(exc.detail)
    else:
        code, message = "conflict", "The record changed at the same time; retry"
    run.last_error_step, run.last_error_code, run.last_error_message = step, code[:64], message[:255]


async def _skip(db: AsyncSession, run: HrEmployeeOnboardingRun, step: str, user_id: int) -> None:
    """Mark a step not requested; giving up a step that already FAILED is audited."""
    attr = f"{step}_step_status"
    previous = getattr(run, attr)
    setattr(run, attr, "SKIPPED")
    if previous == "FAILED":
        await log_action(
            db, tenant_id=run.tenant_id, user_id=user_id, action="HR_ONBOARDING_STEP_SKIPPED",
            resource=f"hr.employee:{run.employee_id}", details=f"onboarding {run.request_id} {step} (was FAILED)",
        )


def _overall(run: HrEmployeeOnboardingRun) -> str:
    steps = (run.employee_step_status, run.payroll_step_status, run.gate_pass_step_status, run.checklist_step_status)
    if all(s in DONE for s in steps):
        return "COMPLETED"
    if "FAILED" in steps:
        return "FAILED"
    return "IN_PROGRESS"


async def start_onboarding(
    db: AsyncSession, *, tenant: Tenant, user: User, body: OnboardingRequest
) -> HrEmployeeOnboardingRun:
    tenant_id, user_id = tenant.id, user.id
    existing = (
        await db.execute(
            select(HrEmployeeOnboardingRun.employee_step_status).where(
                HrEmployeeOnboardingRun.tenant_id == tenant_id, HrEmployeeOnboardingRun.request_id == body.request_id
            )
        )
    ).scalar_one_or_none()
    first_attempt = existing != "COMPLETED"
    access = await employee_service.employee_field_access(db, user, tenant_id)
    if first_attempt:
        await _authorize(db, tenant=tenant, user=user, steps=body, phone=body.employee.phone)
        e = body.employee
        employee_service.assert_protected_writes_allowed(access, e.model_dump())
        await employee_service.validate_fk_values(
            db, tenant_id, e.department_id, e.designation_id, e.reporting_manager_id,
            user_id=e.user_id, section_id=e.section_id,
        )
    run = await _get_or_create_run(db, tenant_id, body.request_id, user_id)
    if run.created_by != user_id:
        await assert_run_access(db, user, tenant_id, run)
    if run.employee_step_status != "COMPLETED":
        try:
            emp = await employee_service.build_employee(db, tenant=tenant, user=user, body=body.employee, access=access)
        except IntegrityError:
            await safe_async_session_rollback(db)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=EMPLOYEE_DUPLICATE_DETAIL) from None
        run.employee_id = emp.id
        run.employee_step_status, run.status = "COMPLETED", "IN_PROGRESS"
        run.updated_at = datetime.utcnow()
        await log_action(
            db, tenant_id=tenant_id, user_id=user_id, action="HR_EMPLOYEE_CREATED",
            resource=f"hr.employee:{emp.id}", details=f"{emp.employee_code} onboarding {body.request_id}",
        )
        await db.commit()
    return await continue_onboarding(
        db, tenant=tenant, user=user, request_id=body.request_id, steps=body, authorized=first_attempt
    )


async def continue_onboarding(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    request_id: str,
    steps: OnboardingSteps,
    authorized: bool = False,
) -> HrEmployeeOnboardingRun:
    tenant_id, user_id = tenant.id, user.id
    run = await lock_run(db, tenant_id, request_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Onboarding run not found")
    await assert_run_access(db, user, tenant_id, run)
    if run.status == "COMPLETED":
        return run
    emp = await _employee(db, tenant_id, run.employee_id)
    if not authorized:
        await _authorize(
            db,
            tenant=tenant,
            user=user,
            steps=OnboardingSteps(
                compensation=steps.compensation if run.payroll_step_status not in DONE else None,
                pay_benefits=steps.pay_benefits if run.payroll_step_status not in DONE else None,
                tax_profile=steps.tax_profile if run.payroll_step_status not in DONE else None,
                issue_temp_gate_pass=steps.issue_temp_gate_pass and run.gate_pass_step_status not in DONE,
            ),
            phone=emp.phone,
        )

    if run.payroll_step_status not in DONE:
        if steps.compensation is None and not steps.pay_benefits and steps.tax_profile is None:
            await _skip(db, run, "payroll", user_id)
        else:
            c = steps.compensation
            try:
                async with db.begin_nested():
                    result = None
                    if c is not None:
                        result = await comp.replace_employee_compensation(
                            db, tenant=tenant, employee_id=emp.id, structure_id=c.structure_id,
                            bd_wage_rate_id=c.bd_wage_rate_id, base_salary=c.base_salary,
                            effective_from=c.effective_from or emp.joining_date or today_local(tenant), actor_id=user_id,
                            component_overrides=c.component_overrides, change_type="JOINING",
                        )
                        await log_action(
                            db, tenant_id=tenant_id, user_id=user_id, action="HR_EMPLOYEE_COMPENSATION_REPLACED",
                            resource=f"hr.employee:{emp.id}",
                            details=f"onboarding {request_id} "
                            + comp.audit_details(result, result.structure_assignment.effective_from),
                        )
                    if steps.pay_benefits:
                        await comp.lock_employee(db, tenant_id, emp.id)
                        switched_off = await benefits.upsert_pay_benefits(
                            db, tenant_id=tenant_id, employee_id=emp.id, items=steps.pay_benefits, actor_id=user_id
                        )
                        await log_action(
                            db, tenant_id=tenant_id, user_id=user_id, action="HR_EMPLOYEE_PAY_BENEFITS_UPDATED",
                            resource=f"hr.employee:{emp.id}",
                            details=f"onboarding {request_id} off={switched_off}",
                        )
                    if steps.tax_profile is not None:
                        await comp.lock_employee(db, tenant_id, emp.id)
                        changed = await tax.upsert_tax_profile(
                            db, tenant_id=tenant_id, employee_id=emp.id, body=steps.tax_profile, actor_id=user_id
                        )
                        await log_action(
                            db, tenant_id=tenant_id, user_id=user_id, action="HR_EMPLOYEE_TAX_PROFILE_UPDATED",
                            resource=f"hr.employee:{emp.id}", details=f"onboarding {request_id} fields={changed}",
                        )
                run.payroll_assignment_id = result.structure_assignment.id if result else None
                run.wage_assignment_id = result.wage_assignment.id if result and result.wage_assignment else None
                run.payroll_step_status = "COMPLETED"
            except (HTTPException, IntegrityError) as exc:
                run.payroll_step_status = "FAILED"
                _record_error(run, "payroll", exc)
        run.updated_at = datetime.utcnow()
        await db.commit()
        run = await lock_run(db, tenant_id, request_id)
        emp = await _employee(db, tenant_id, run.employee_id)

    if run.gate_pass_step_status not in DONE:
        if not steps.issue_temp_gate_pass:
            await _skip(db, run, "gate_pass", user_id)
        else:
            try:
                async with db.begin_nested():
                    if not (emp.phone or "").strip():
                        raise HTTPException(status_code=400, detail="A mobile number is needed for the temporary gate pass")
                    start = gate_service.tenant_now(tenant)
                    gate_pass = await gate_service.create_draft_pass(
                        db, tenant=tenant, user=user, employee_id=emp.id,
                        person_name=" ".join(p for p in (emp.first_name, emp.last_name) if p)[:128],
                        mobile=emp.phone, identity_ref=None, sponsor_employee_id=None,
                        purpose="New employee - temporary gate pass until the ID card is issued",
                        permitted_zones=[], valid_from=start, valid_to=start + timedelta(days=TEMP_PASS_DAYS),
                    )
                    await gate_service.activate_pass(db, tenant=tenant, user=user, row=gate_pass)
                run.gate_pass_id = gate_pass.id
                run.gate_pass_step_status = "COMPLETED"
            except (HTTPException, IntegrityError) as exc:
                run.gate_pass_step_status = "FAILED"
                _record_error(run, "gate_pass", exc)
        run.updated_at = datetime.utcnow()
        await db.commit()
        run = await lock_run(db, tenant_id, request_id)
        emp = await _employee(db, tenant_id, run.employee_id)

    if run.checklist_step_status not in DONE:
        try:
            async with db.begin_nested():
                await create_onboarding_tasks(db, tenant=tenant, employee=emp, actor_id=user_id)
            run.checklist_step_status = "COMPLETED"
        except (HTTPException, IntegrityError) as exc:
            run.checklist_step_status = "FAILED"
            _record_error(run, "checklist", exc)

    run.status = _overall(run)
    if run.status == "COMPLETED":
        run.last_error_step = run.last_error_code = run.last_error_message = None
    run.updated_at = datetime.utcnow()
    await db.commit()
    return run


async def get_gate_pass(db: AsyncSession, tenant_id: int, gate_pass_id: int | None) -> HrEmployeeGatePass | None:
    if gate_pass_id is None:
        return None
    row = await db.get(HrEmployeeGatePass, gate_pass_id)
    return row if row is not None and row.tenant_id == tenant_id else None
