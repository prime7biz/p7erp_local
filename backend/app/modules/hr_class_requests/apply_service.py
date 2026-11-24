"""Kind-specific apply for HR class requests. Does not commit (except onboarding's own commits)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.hr_policy import assert_erp_user_invite_approver
from app.common.business_date import today_local
from app.common.ownership import ensure_owned
from app.common.plan_enforcer import assert_can_add_user
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_class_request import HrClassRequest, HrClassRequestLine, OPEN_HR_CLASS_STATUSES
from app.modules.audit.service import log_action
from app.modules.hr_change_requests import service as change_svc
from app.modules.hr_leave import request_core as leave_core
from app.modules.hr_separation import separation_core as sep_core
from app.models.hr_lifecycle import HrFinalSettlement
from app.modules.hr_separation.settlement_service import apply_values, compute_settlement, link_settlement_extras


ESS_CORRECTION_ALLOWLIST = frozenset(
    {
        "phone",
        "address_line",
        "city",
        "district",
        "postal_code",
        "country",
        "present_address_line",
        "present_city",
        "present_district",
        "present_postal_code",
        "present_country",
        "permanent_address_line",
        "permanent_city",
        "permanent_district",
        "permanent_postal_code",
        "permanent_country",
        "emergency_contact_name",
        "emergency_contact_phone",
        "emergency_contact_relation",
    }
)


def _parse_date(value: Any) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    return date.fromisoformat(str(value)[:10])


def _parts_from_payload(kind: str, payload: dict[str, Any]) -> list[tuple[str, BaseModel]]:
    """Map INCREMENT/PROMOTION/CORRECTION payload into change-request parts."""
    parts: list[tuple[str, BaseModel]] = []
    if kind == "INCREMENT":
        body = change_svc.parse_body("COMPENSATION", {**payload, "change_type": payload.get("change_type") or "INCREMENT"})
        parts.append(("COMPENSATION", body))
        return parts
    if kind == "PROMOTION":
        info = payload.get("info") or {k: payload[k] for k in ("designation_id", "department_id", "section_id", "grade") if k in payload}
        if info:
            info_body = change_svc.parse_body("INFO", info)
            forbidden = {"is_active", "user_id"} & set(info_body.model_dump(exclude_unset=True))
            if forbidden:
                raise HTTPException(status_code=400, detail=f"INFO cannot change {sorted(forbidden)}")
            parts.append(("INFO", info_body))
        comp = payload.get("compensation")
        if comp:
            parts.append(("COMPENSATION", change_svc.parse_body("COMPENSATION", {**comp, "change_type": "PROMOTION"})))
        if not parts:
            raise HTTPException(status_code=400, detail="PROMOTION needs info and/or compensation")
        return parts
    # CORRECTION
    for part_kind in ("INFO", "COMPENSATION", "PAY_BENEFITS", "TAX_PROFILE"):
        chunk = payload.get(part_kind.lower()) if part_kind != "INFO" else payload.get("info") or payload.get("INFO")
        if chunk is None and part_kind == "INFO" and any(k in payload for k in ESS_CORRECTION_ALLOWLIST):
            chunk = {k: payload[k] for k in ESS_CORRECTION_ALLOWLIST if k in payload}
        if chunk is None:
            continue
        body = change_svc.parse_body(part_kind, chunk)
        if part_kind == "INFO":
            forbidden = {"is_active", "user_id"} & set(body.model_dump(exclude_unset=True))
            if forbidden:
                raise HTTPException(status_code=400, detail=f"INFO cannot change {sorted(forbidden)}")
        parts.append((part_kind, body))
    if not parts:
        # single flat compensation-style correction
        if "structure_id" in payload or "base_salary" in payload:
            parts.append(("COMPENSATION", change_svc.parse_body("COMPENSATION", payload)))
        else:
            raise HTTPException(status_code=400, detail="CORRECTION payload has no recognised parts")
    return parts


def assert_ess_correction_payload(payload: dict[str, Any]) -> dict[str, Any]:
    info = payload.get("info") or payload
    if not isinstance(info, dict):
        raise HTTPException(status_code=422, detail="ESS correction payload must be an object")
    bad = sorted(k for k in info if k not in ESS_CORRECTION_ALLOWLIST)
    if bad:
        raise HTTPException(
            status_code=400,
            detail=f"ESS correction may only change phone, addresses and emergency contact; refused: {bad}",
        )
    if not info:
        raise HTTPException(status_code=400, detail="No ESS correction fields to apply")
    return {"info": {k: info[k] for k in info if k in ESS_CORRECTION_ALLOWLIST}}


async def apply_leave(db: AsyncSession, *, tenant: Tenant, actor: User, req: HrClassRequest) -> None:
    if not req.leave_request_id:
        raise HTTPException(status_code=409, detail="LEAVE request has no linked leave_request_id")
    # Lock order: class_request (already locked) → Employee → LeaveRequest → LeaveBalance
    if req.employee_id:
        emp = await db.get(Employee, req.employee_id)
        if emp is None or emp.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Employee not found")
        await db.execute(
            select(Employee.id).where(Employee.id == emp.id).with_for_update()
        )
    leave = await leave_core.lock_leave_request(db, tenant.id, req.leave_request_id)
    await leave_core.approve_leave_request_core(db, tenant=tenant, actor=actor, row=leave, note=req.approve_note)


async def apply_change_parts(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    req: HrClassRequest,
    maker: User,
) -> None:
    if not req.employee_id:
        raise HTTPException(status_code=400, detail="employee_id required")
    emp = (
        await db.execute(
            select(Employee)
            .where(Employee.id == req.employee_id, Employee.tenant_id == tenant.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    payload = dict(req.payload or {})
    if req.source == "ESS" and req.kind == "CORRECTION":
        payload = assert_ess_correction_payload(payload)
    parts = _parts_from_payload(req.kind, payload)
    # Stale before check for first part
    for part_kind, body in parts:
        before_now = await change_svc.current_values(db, tenant.id, emp, part_kind, body)
        stored = (req.before or {}).get(part_kind) if isinstance(req.before, dict) else None
        if stored is not None and stored != before_now:
            raise HTTPException(status_code=409, detail="Employee data changed since this request was entered (stale before)")
        await change_svc.apply_part(
            db, tenant=tenant, actor=maker, audit_user_id=actor.id, row=emp, kind=part_kind, body=body
        )


async def apply_new_employee(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    req: HrClassRequest,
    maker: User,
) -> str:
    """Returns next status: APPLIED | APPROVED | FAILED. May use onboarding's own commits."""
    from app.modules.hr.onboarding_service import continue_onboarding, start_onboarding
    from app.modules.hr.schemas import OnboardingRequest

    if not maker.is_active:
        raise HTTPException(status_code=409, detail="The maker is inactive; cannot run onboarding as that user")

    payload = dict(req.payload or {})
    system_access = str(payload.get("system_access") or "NONE").upper()
    invite = payload.get("invite") or {}
    # Never link an existing login from the NEW_EMPLOYEE payload (Option A invite only).
    emp_payload = payload.get("employee") if isinstance(payload.get("employee"), dict) else payload
    if isinstance(emp_payload, dict) and emp_payload.get("user_id") is not None:
        raise HTTPException(
            status_code=400,
            detail="NEW_EMPLOYEE cannot set user_id; use system_access ESS_ONLY or ERP_USER to invite a login",
        )
    if system_access == "ERP_USER":
        await assert_erp_user_invite_approver(
            db,
            tenant=tenant,
            actor=actor,
            system_access="ERP_USER",
            authority_class=invite.get("authority_class"),
            module_grants=invite.get("module_grants") or invite.get("modules"),
        )
        await assert_can_add_user(db, tenant.id)
    elif system_access == "ESS_ONLY":
        await assert_erp_user_invite_approver(
            db, tenant=tenant, actor=actor, system_access="ESS_ONLY", authority_class=None, module_grants=None
        )
        await assert_can_add_user(db, tenant.id)

    run_id = req.onboarding_request_id or f"hrreq-{req.id}"
    req.onboarding_request_id = run_id

    async def _issue_option_a_invite(employee_id: int) -> None:
        if system_access not in {"ESS_ONLY", "ERP_USER"}:
            return
        if req.staff_invitation_id:
            return
        from app.models.hr import Employee as EmpModel
        from app.modules.staff_invite.service import create_staff_invitation

        emp = await db.get(EmpModel, employee_id)
        if emp is None or emp.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Employee not found after onboarding")
        email = (invite.get("email") or emp.email or "").strip()
        if not email:
            raise HTTPException(status_code=400, detail="Invite email is required for ESS_ONLY / ERP_USER")
        if system_access == "ESS_ONLY":
            cls = "CLASS_4"
            modules = ["ess"]
            emp.ess_enabled = True
        else:
            cls = str(invite.get("authority_class") or "CLASS_4").upper()
            modules = list(invite.get("module_grants") or invite.get("modules") or [])
            if invite.get("ess") or "ess" in [str(m).lower() for m in modules]:
                if "ess" not in [str(m).lower() for m in modules]:
                    modules.append("ess")
                emp.ess_enabled = True
        inv, _plain = await create_staff_invitation(
            db,
            tenant=tenant,
            invited_by=actor,
            email=email,
            first_name=emp.first_name,
            last_name=emp.last_name,
            role_id=None,
            authority_class=cls,
            module_grants=modules,
            employee_id=emp.id,
        )
        req.staff_invitation_id = inv.id
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=actor.id,
            action="HR_CLASS_REQUEST_INVITE_CREATED",
            resource=f"hr.class_request:{req.id}",
            details=f"invitation={inv.id} access={system_access}",
        )

    # Late retry path: employee already created
    if req.employee_id and req.status in {"APPROVED", "APPLYING", "FAILED"}:
        steps = payload.get("steps") or payload
        try:
            # Rebuild OnboardingSteps-like object from stored payload
            from app.modules.hr.schemas import OnboardingSteps

            body_steps = OnboardingSteps.model_validate(steps if isinstance(steps, dict) else {})
            await continue_onboarding(
                db,
                tenant=tenant,
                user=maker,
                request_id=run_id,
                steps=body_steps,
                authorized=True,
                commit_steps=False,
            )
            await _issue_option_a_invite(req.employee_id)
            return "APPLIED"
        except HTTPException as exc:
            req.failure_reason = str(exc.detail)
            return "APPROVED" if req.employee_id else "FAILED"

    try:
        onboarding_body = OnboardingRequest.model_validate({**payload, "request_id": run_id})
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=change_svc.jsonable(exc.errors(include_url=False))) from exc

    try:
        # Keep employee create + class-request status in one outer transaction (no mid-apply commit).
        run = await start_onboarding(
            db, tenant=tenant, user=maker, body=onboarding_body, commit_steps=False
        )
    except HTTPException as exc:
        req.failure_reason = str(exc.detail)
        return "FAILED"

    if run.employee_id:
        req.employee_id = run.employee_id
        try:
            await _issue_option_a_invite(run.employee_id)
        except HTTPException as exc:
            req.failure_reason = str(exc.detail)
            return "APPROVED"
    if run.status == "COMPLETED":
        return "APPLIED"
    # Employee created but later step failed / incomplete
    req.failure_reason = "Onboarding incomplete after employee create; use Retry with full steps"
    return "APPROVED"


async def apply_separation(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    req: HrClassRequest,
) -> None:
    if not req.employee_id:
        raise HTTPException(status_code=400, detail="employee_id required")
    payload = dict(req.payload or {})
    if req.kind == "RESIGNATION":
        sep_type = "RESIGNATION"
    else:
        sep_type = str(payload.get("separation_type") or "TERMINATION").upper()
        if sep_type not in sep_core.SEPARATION_TYPES or sep_type == "RESIGNATION":
            raise HTTPException(status_code=400, detail="DISCONTINUE needs TERMINATION / RETRENCHMENT / DISMISSAL / RETIREMENT / DEATH")

    request_date = _parse_date(payload.get("request_date") or today_local(tenant))
    last_working = _parse_date(payload["last_working_date"])
    effective = _parse_date(payload.get("effective_date") or last_working)

    nested = await db.begin_nested()
    try:
        sep = await sep_core.create_separation_core(
            db,
            tenant=tenant,
            actor=actor,
            employee_id=req.employee_id,
            separation_type=sep_type,
            request_date=request_date,
            last_working_date=last_working,
            effective_date=effective,
            notice_days_served=int(payload.get("notice_days_served") or 0),
            permanent=bool(payload.get("permanent", True)),
            monthly_rated=bool(payload.get("monthly_rated", True)),
            misconduct_no_compensation=bool(payload.get("misconduct_no_compensation", False)),
            death_at_work=bool(payload.get("death_at_work", False)),
            reason=payload.get("reason") or req.reason,
        )
        await sep_core.approve_separation_core(db, tenant=tenant, actor=actor, sep=sep)
        req.separation_id = sep.id
        await sep_core.seed_standard_clearance(db, tenant_id=tenant.id, separation_id=sep.id)

        # DRAFT settlement inside the same savepoint
        try:
            from app.common.tenant_feature_keys import is_hr_bd_salary_tds_enabled
            from app.modules.hr_localization import bd_salary_tds as tds_engine

            emp = await db.get(Employee, req.employee_id)
            if emp is None or emp.tenant_id != tenant.id:
                raise HTTPException(status_code=404, detail="Employee not found")
            if is_hr_bd_salary_tds_enabled(tenant.feature_flags) and tds_engine.SETTLEMENT_CLASSIFICATION_VERSION is None:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Final-settlement income tax rules are not approved yet; "
                        "the settlement cannot be calculated while salary TDS is on"
                    ),
                )
            comp = await compute_settlement(db, tenant, sep, emp, settlement_id=None)
            fs = HrFinalSettlement(
                tenant_id=tenant.id,
                separation_id=sep.id,
                employee_id=emp.id,
                status="DRAFT",
                created_by=actor.id,
            )
            db.add(fs)
            apply_values(fs, comp)
            await db.flush()
            await link_settlement_extras(db, tenant.id, fs.id, comp.extra_ids)
            req.settlement_status = "DRAFT"
        except HTTPException as exc:
            # Never safe_async_session_rollback on savepoint fail — just mark MANUAL_REQUIRED
            req.settlement_status = "MANUAL_REQUIRED"
            req.failure_reason = str(exc.detail)
        await nested.commit()
    except HTTPException:
        await nested.rollback()
        raise
    except Exception:
        await nested.rollback()
        raise


async def apply_warning(db: AsyncSession, *, tenant: Tenant, req: HrClassRequest) -> None:
    case_id = (req.payload or {}).get("discipline_case_id") or req.discipline_case_id
    if case_id is None:
        raise HTTPException(status_code=400, detail="WARNING needs discipline_case_id")
    from app.models.hr_lifecycle import HrEmployeeCase

    case = await ensure_owned(db, HrEmployeeCase, int(case_id), tenant_id=tenant.id, label="Discipline case")
    req.discipline_case_id = case.id


async def apply_bulk_increment(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    req: HrClassRequest,
    maker: User,
) -> None:
    lines = (
        await db.execute(
            select(HrClassRequestLine)
            .where(HrClassRequestLine.tenant_id == tenant.id, HrClassRequestLine.request_pk == req.id)
            .order_by(HrClassRequestLine.employee_id)
        )
    ).scalars().all()
    if not lines:
        raise HTTPException(status_code=400, detail="BULK_INCREMENT has no lines")
    if len(lines) > 200:
        raise HTTPException(status_code=400, detail="BULK_INCREMENT allows at most 200 lines")
    # All-or-nothing: lock employees in id order
    for line in lines:
        emp = (
            await db.execute(
                select(Employee)
                .where(Employee.id == line.employee_id, Employee.tenant_id == tenant.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if emp is None:
            raise HTTPException(status_code=404, detail=f"Employee {line.employee_id} not found")
        body = change_svc.parse_body("COMPENSATION", {**(line.payload or {}), "change_type": "INCREMENT"})
        await change_svc.apply_part(
            db, tenant=tenant, actor=maker, audit_user_id=actor.id, row=emp, kind="COMPENSATION", body=body
        )
        line.line_status = "APPLIED"


async def apply_confirmation(db: AsyncSession, *, tenant: Tenant, actor: User, req: HrClassRequest) -> None:
    if not req.employee_id:
        raise HTTPException(status_code=400, detail="employee_id required")
    emp = await ensure_owned(db, Employee, req.employee_id, tenant_id=tenant.id, label="Employee")
    payload = dict(req.payload or {})
    if payload.get("clear_probation", True) and hasattr(emp, "probation_months"):
        emp.probation_months = None
    if "employment_type" in payload and payload["employment_type"]:
        emp.employment_type = str(payload["employment_type"])
    if "contract_end_date" in payload:
        emp.contract_end_date = _parse_date(payload["contract_end_date"]) if payload["contract_end_date"] else None
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=actor.id,
        action="HR_CLASS_CONFIRMATION_APPLIED",
        resource=f"hr.employee:{emp.id}",
        details=f"request={req.id}",
    )


async def apply_request(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    req: HrClassRequest,
    maker: User,
) -> str:
    """Apply and return terminal-ish status APPLIED / APPROVED / FAILED."""
    kind = req.kind
    if kind == "LEAVE":
        await apply_leave(db, tenant=tenant, actor=actor, req=req)
        return "APPLIED"
    if kind in {"INCREMENT", "PROMOTION", "CORRECTION"}:
        await apply_change_parts(db, tenant=tenant, actor=actor, req=req, maker=maker)
        return "APPLIED"
    if kind == "NEW_EMPLOYEE":
        return await apply_new_employee(db, tenant=tenant, actor=actor, req=req, maker=maker)
    if kind in {"RESIGNATION", "DISCONTINUE"}:
        await apply_separation(db, tenant=tenant, actor=actor, req=req)
        return "APPLIED"
    if kind == "WARNING":
        await apply_warning(db, tenant=tenant, req=req)
        return "APPLIED"
    if kind == "BULK_INCREMENT":
        await apply_bulk_increment(db, tenant=tenant, actor=actor, req=req, maker=maker)
        return "APPLIED"
    if kind == "CONFIRMATION":
        await apply_confirmation(db, tenant=tenant, actor=actor, req=req)
        return "APPLIED"
    raise HTTPException(status_code=400, detail=f"Unsupported kind {kind}")


async def assert_no_open_increment_conflict(
    db: AsyncSession, *, tenant_id: int, employee_id: int, exclude_request_pk: int | None = None
) -> None:
    """Cross-table: no open single INCREMENT and open bulk line for the same employee."""
    q = select(HrClassRequest.id).where(
        HrClassRequest.tenant_id == tenant_id,
        HrClassRequest.employee_id == employee_id,
        HrClassRequest.kind == "INCREMENT",
        HrClassRequest.status.in_(OPEN_HR_CLASS_STATUSES),
    )
    if exclude_request_pk is not None:
        q = q.where(HrClassRequest.id != exclude_request_pk)
    if (await db.execute(q.limit(1))).first():
        raise HTTPException(status_code=409, detail="Employee already has an open INCREMENT request")
    line_q = (
        select(HrClassRequestLine.id)
        .join(HrClassRequest, HrClassRequest.id == HrClassRequestLine.request_pk)
        .where(
            HrClassRequestLine.tenant_id == tenant_id,
            HrClassRequestLine.employee_id == employee_id,
            HrClassRequest.kind == "BULK_INCREMENT",
            HrClassRequest.status.in_(OPEN_HR_CLASS_STATUSES),
            HrClassRequestLine.line_status == "PENDING",
        )
    )
    if exclude_request_pk is not None:
        line_q = line_q.where(HrClassRequestLine.request_pk != exclude_request_pk)
    if (await db.execute(line_q.limit(1))).first():
        raise HTTPException(status_code=409, detail="Employee already sits on an open BULK_INCREMENT line")
