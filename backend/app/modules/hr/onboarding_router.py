"""Employee onboarding (employee workspace "Create employee") and the onboarding checklist.

POST /hr/onboarding                               hr.access; salary needs hr.payroll.manage,
                                                  temporary gate pass needs hr.gate_pass.manage
GET  /hr/onboarding/{request_id}                  hr.access
POST /hr/onboarding/{request_id}/resume           as POST /hr/onboarding for the remaining steps
GET  /hr/employees/{employee_id}/onboarding-tasks hr.compliance.view (soft)
POST /hr/onboarding-tasks/{task_id}/waive         hr.compliance.manage, reason required

Tasks complete only from real evidence (see ``onboarding_tasks``); there is no manual "complete".
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_HR_COMPLIANCE_MANAGE,
    PERMISSION_HR_COMPLIANCE_VIEW,
    assert_hr_manager_or_permission,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.models.hr_onboarding import HrEmployeeOnboardingRun, HrEmployeeOnboardingTask
from app.modules.audit.service import log_action
from app.modules.hr import employee_service
from app.modules.hr import onboarding_service as svc
from app.modules.hr.onboarding_tasks import sync_onboarding_tasks, task_out

router = APIRouter(prefix="/hr", tags=["hr-onboarding"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _run_out(db: AsyncSession, tenant: Tenant, user: User, run: HrEmployeeOnboardingRun) -> dict:
    access = await employee_service.employee_field_access(db, user, tenant.id)
    employee = None
    if run.employee_id is not None:
        emp = await employee_service.get_employee_or_404(db, tenant.id, run.employee_id)
        employee = employee_service.employee_to_response(emp, access).model_dump(mode="json")
    error_message = run.last_error_message
    if run.last_error_step == "payroll" and not access.can_manage_payroll:
        error_message = "The salary step did not finish. Ask a payroll manager to check it."
    gate_pass = await svc.get_gate_pass(db, tenant.id, run.gate_pass_id)
    return {
        "run_id": run.id,
        "request_id": run.request_id,
        "status": run.status,
        "steps": {
            "employee": run.employee_step_status,
            "payroll": run.payroll_step_status,
            "gate_pass": run.gate_pass_step_status,
            "checklist": run.checklist_step_status,
        },
        "employee": employee,
        "payroll_assignment_id": run.payroll_assignment_id,
        "wage_assignment_id": run.wage_assignment_id,
        "gate_pass": (
            {
                "id": gate_pass.id,
                "pass_code": gate_pass.pass_code,
                "status": gate_pass.status,
                "valid_to": gate_pass.valid_to.isoformat(),
            }
            if gate_pass
            else None
        ),
        "error": (
            {"step": run.last_error_step, "code": run.last_error_code, "message": error_message}
            if run.last_error_step
            else None
        ),
    }


@router.post("/onboarding")
async def start_onboarding(
    body: svc.OnboardingRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    run = await svc.start_onboarding(db, tenant=tenant, user=user, body=body)
    return await _run_out(db, tenant, user, run)


@router.get("/onboarding/{request_id}")
async def get_onboarding(
    request_id: str,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    run = (
        await db.execute(
            select(HrEmployeeOnboardingRun).where(
                HrEmployeeOnboardingRun.tenant_id == tenant.id, HrEmployeeOnboardingRun.request_id == request_id
            )
        )
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Onboarding run not found")
    await svc.assert_run_access(db, user, tenant.id, run)
    return await _run_out(db, tenant, user, run)


@router.post("/onboarding/{request_id}/resume")
async def resume_onboarding(
    request_id: str,
    body: svc.OnboardingSteps,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    run = await svc.continue_onboarding(db, tenant=tenant, user=user, request_id=request_id, steps=body)
    return await _run_out(db, tenant, user, run)


@router.get("/employees/{employee_id}/onboarding-tasks")
async def list_onboarding_tasks(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_COMPLIANCE_VIEW)
    await employee_service.get_employee_or_404(db, tenant.id, employee_id)
    tasks = await sync_onboarding_tasks(db, tenant_id=tenant.id, employee_id=employee_id, actor_id=user.id)
    return [task_out(t) for t in tasks]


class WaiveBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)


@router.post("/onboarding-tasks/{task_id}/waive")
async def waive_onboarding_task(
    task_id: int,
    body: WaiveBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_COMPLIANCE_MANAGE)
    reason = body.reason.strip()
    if len(reason) < 3:
        raise HTTPException(status_code=422, detail="Give a reason for waiving this task")
    task = (
        await db.execute(
            select(HrEmployeeOnboardingTask)
            .where(HrEmployeeOnboardingTask.id == task_id, HrEmployeeOnboardingTask.tenant_id == tenant.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Onboarding task not found")
    if task.status != "DUE":
        raise HTTPException(status_code=409, detail=f"Only a due task can be waived (this one is {task.status})")
    task.status, task.waived_at, task.waived_by, task.waive_reason = "WAIVED", datetime.utcnow(), user.id, reason
    await log_action(
        db, tenant_id=tenant.id, user_id=user.id, action="HR_ONBOARDING_TASK_WAIVED",
        resource=f"hr.employee:{task.employee_id}:onboarding-task:{task.id}", details=f"{task.task_type}: {reason}"[:500],
    )
    await db.commit()
    return task_out(task)
