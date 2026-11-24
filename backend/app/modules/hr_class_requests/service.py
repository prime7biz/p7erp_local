"""HR class request CRUD + workflow. Router owns commit."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.hr_policy import (
    assert_erp_user_invite_approver,
    assert_hr_sod,
    auto_recommend_on_entry,
    hr_actor_role,
    is_hr_authority_enabled,
    load_linked_employee_for_ess,
)
from app.common.ownership import ensure_owned
from app.common.pagination import MAX_PAGE_SIZE
from app.common.permissions import (
    PERMISSION_HR_IDENTITY_MANAGE,
    PERMISSION_HR_PAYROLL_MANAGE,
    internal_permission_granted,
)
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.plan_enforcer import assert_can_add_user
from app.database import safe_async_session_rollback
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_class_request import (
    OPEN_HR_CLASS_STATUSES,
    HrClassRequest,
    HrClassRequestAction,
    HrClassRequestLine,
)
from app.modules.audit.service import log_action
from app.modules.hr_change_requests import service as change_svc
from app.modules.hr_class_requests import apply_service
from app.modules.hr_class_requests.masking import mask_request_dict
from app.modules.hr_class_requests.state_machine import assert_transition, can_auto_recommend_on_entry
from app.modules.hr_leave import request_core as leave_core

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MAX_REASON = 2000


def _require_flag(tenant: Tenant) -> None:
    if not is_hr_authority_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=409,
            detail="HR class requests need fixed-class authority (user_authority_classes_v1) switched on",
        )


async def _role(db: AsyncSession, user: User, tenant: Tenant) -> str:
    return await hr_actor_role(db, user, feature_flags=tenant.feature_flags)


async def _has_perm(db: AsyncSession, user: User, tenant_id: int, key: str) -> bool:
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    return internal_permission_granted(role=role, permission_key=key)


async def viewer_flags(db: AsyncSession, user: User, tenant: Tenant) -> dict[str, bool]:
    return {
        "can_view_pay": await _has_perm(db, user, tenant.id, PERMISSION_HR_PAYROLL_MANAGE),
        "can_view_identity": await _has_perm(db, user, tenant.id, PERMISSION_HR_IDENTITY_MANAGE),
    }


async def next_request_no(db: AsyncSession, tenant_id: int) -> str:
    n = (
        await db.execute(select(func.count()).select_from(HrClassRequest).where(HrClassRequest.tenant_id == tenant_id))
    ).scalar_one()
    return f"HRR-{int(n) + 1:06d}"


async def lock_request(db: AsyncSession, tenant_id: int, request_pk: int) -> HrClassRequest:
    row = (
        await db.execute(
            select(HrClassRequest)
            .where(HrClassRequest.id == request_pk, HrClassRequest.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="HR request not found")
    return row


async def get_request(db: AsyncSession, tenant_id: int, request_pk: int) -> HrClassRequest:
    row = await db.get(HrClassRequest, request_pk)
    if row is None or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="HR request not found")
    return row


async def _append_action(
    db: AsyncSession,
    *,
    tenant_id: int,
    req: HrClassRequest,
    action: str,
    actor_user_id: int | None,
    note: str | None = None,
    is_auto: bool = False,
) -> None:
    db.add(
        HrClassRequestAction(
            tenant_id=tenant_id,
            request_pk=req.id,
            action=action,
            actor_user_id=actor_user_id,
            note=(note or "").strip() or None,
            is_auto=is_auto,
            created_at=datetime.utcnow(),
        )
    )


def request_out(row: HrClassRequest, *, can_view_pay: bool, can_view_identity: bool) -> dict[str, Any]:
    raw = {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "request_no": row.request_no,
        "request_id": row.request_id,
        "schema_version": row.schema_version,
        "source": row.source,
        "kind": row.kind,
        "status": row.status,
        "employee_id": row.employee_id,
        "payload": row.payload or {},
        "before": row.before or {},
        "reason": row.reason,
        "revision": row.revision,
        "leave_request_id": row.leave_request_id,
        "separation_id": row.separation_id,
        "onboarding_request_id": row.onboarding_request_id,
        "staff_invitation_id": row.staff_invitation_id,
        "discipline_case_id": row.discipline_case_id,
        "settlement_status": row.settlement_status,
        "entered_by": row.entered_by,
        "entered_at": row.entered_at.isoformat() if row.entered_at else None,
        "recommended_by": row.recommended_by,
        "recommended_at": row.recommended_at.isoformat() if row.recommended_at else None,
        "recommend_note": row.recommend_note,
        "recommend_is_auto": row.recommend_is_auto,
        "approved_by": row.approved_by,
        "approved_at": row.approved_at.isoformat() if row.approved_at else None,
        "approve_note": row.approve_note,
        "applied_at": row.applied_at.isoformat() if row.applied_at else None,
        "failure_reason": row.failure_reason,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
    return mask_request_dict(raw, can_view_pay=can_view_pay, can_view_identity=can_view_identity)


async def _capture_before(db: AsyncSession, tenant: Tenant, kind: str, employee_id: int | None, payload: dict) -> dict:
    if employee_id is None or kind in {"NEW_EMPLOYEE", "BULK_INCREMENT", "LEAVE", "WARNING"}:
        return {}
    emp = await ensure_owned(db, Employee, employee_id, tenant.id, "Employee", status_code=404)
    assert emp is not None
    before: dict[str, Any] = {}
    try:
        parts = apply_service._parts_from_payload(kind, payload)
    except HTTPException:
        return {}
    for part_kind, body in parts:
        before[part_kind] = await change_svc.current_values(db, tenant.id, emp, part_kind, body)
    return before


async def _prepare_leave_on_submit(
    db: AsyncSession, *, tenant: Tenant, user: User, req: HrClassRequest, exclude_request_id: int | None = None
) -> None:
    payload = dict(req.payload or {})
    if req.leave_request_id:
        leave = await leave_core.lock_leave_request(db, tenant.id, req.leave_request_id)
        await leave_core.submit_leave_request_core(
            db, tenant=tenant, row=leave, exclude_request_id=exclude_request_id or leave.id
        )
        return
    if not req.employee_id:
        raise HTTPException(status_code=400, detail="LEAVE needs employee_id")
    await ensure_owned(db, Employee, req.employee_id, tenant.id, "Employee", status_code=404)
    leave = await leave_core.create_leave_request_core(
        db,
        tenant=tenant,
        actor=user,
        employee_id=req.employee_id,
        leave_type_id=int(payload["leave_type_id"]),
        from_date=apply_service._parse_date(payload["from_date"]),
        to_date=apply_service._parse_date(payload["to_date"]),
        days_requested=payload.get("days_requested"),
        reason=payload.get("reason") or req.reason,
        force_pending=True,
    )
    req.leave_request_id = leave.id


async def create_draft(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    kind: str,
    request_id: str,
    employee_id: int | None,
    payload: dict[str, Any],
    reason: str,
    source: str = "HR_ENTRY",
    lines: list[dict[str, Any]] | None = None,
) -> tuple[HrClassRequest, bool]:
    _require_flag(tenant)
    source_norm = (source or "HR_ENTRY").upper()
    if source_norm == "ESS":
        # ESS-only users hold `ess` (not `hr`); they may enter leave / correction / resignation only.
        # Always bind to the caller's linked ESS employee (never trust a different employee_id).
        if kind not in {"LEAVE", "CORRECTION", "RESIGNATION"}:
            raise HTTPException(status_code=403, detail="ESS can only submit leave, correction or resignation")
        linked = await load_linked_employee_for_ess(db, tenant=tenant, user=user)
        if employee_id is not None and int(employee_id) != int(linked.id):
            raise HTTPException(status_code=403, detail="ESS requests can only target your linked employee")
        employee_id = linked.id
        role = "ENTRY"
    else:
        role = await _role(db, user, tenant)
        if role not in {"SUPER", "ENTRY", "RECOMMEND", "APPROVE"}:
            raise HTTPException(status_code=403, detail="No HR class authority to enter requests")
    if not _REQUEST_ID_RE.match(request_id or ""):
        raise HTTPException(status_code=400, detail="request_id must be 8–64 letters, digits, _ or -")

    existing = (
        await db.execute(
            select(HrClassRequest).where(HrClassRequest.tenant_id == tenant.id, HrClassRequest.request_id == request_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.entered_by != user.id or existing.kind != kind or existing.employee_id != employee_id:
            raise HTTPException(status_code=409, detail="This request id was already used for another HR request")
        return existing, False

    if employee_id is not None:
        await ensure_owned(db, Employee, employee_id, tenant.id, "Employee", status_code=404)
    if kind in {"INCREMENT", "BULK_INCREMENT"} and employee_id:
        await apply_service.assert_no_open_increment_conflict(db, tenant_id=tenant.id, employee_id=employee_id)
    if kind == "BULK_INCREMENT":
        if not lines:
            raise HTTPException(status_code=400, detail="BULK_INCREMENT needs lines")
        if len(lines) > 200:
            raise HTTPException(status_code=400, detail="BULK_INCREMENT allows at most 200 lines")
        for line in lines:
            eid = int(line["employee_id"])
            await ensure_owned(db, Employee, eid, tenant.id, "Employee", status_code=404)
            await apply_service.assert_no_open_increment_conflict(db, tenant_id=tenant.id, employee_id=eid)

    if kind == "NEW_EMPLOYEE":
        system_access = str((payload or {}).get("system_access") or "NONE").upper()
        invite = (payload or {}).get("invite") or {}
        if system_access in {"ESS_ONLY", "ERP_USER"}:
            await assert_can_add_user(db, tenant.id)
        if "compensation" in (payload or {}) or "pay_benefits" in (payload or {}) or "tax_profile" in (payload or {}):
            if not await _has_perm(db, user, tenant.id, PERMISSION_HR_PAYROLL_MANAGE) and role != "SUPER":
                raise HTTPException(status_code=403, detail="Salary / pay benefits / tax on NEW_EMPLOYEE need hr.payroll.manage")

    if source == "ESS" and kind == "CORRECTION":
        payload = apply_service.assert_ess_correction_payload(payload or {})

    reason = (reason or "").strip()
    if len(reason) > MAX_REASON:
        raise HTTPException(status_code=400, detail="Reason is too long")

    before = await _capture_before(db, tenant, kind, employee_id, payload or {})
    now = datetime.utcnow()
    req = HrClassRequest(
        tenant_id=tenant.id,
        request_no=await next_request_no(db, tenant.id),
        request_id=request_id,
        schema_version=1,
        source=source,
        kind=kind,
        status="DRAFT",
        employee_id=employee_id,
        payload=change_svc.jsonable(payload or {}),
        before=before,
        reason=reason,
        revision=1,
        entered_by=user.id,
        entered_at=now,
        created_at=now,
        updated_at=now,
    )
    savepoint = await db.begin_nested()
    try:
        db.add(req)
        await db.flush()
        if kind == "BULK_INCREMENT" and lines:
            for line in lines:
                db.add(
                    HrClassRequestLine(
                        tenant_id=tenant.id,
                        request_pk=req.id,
                        employee_id=int(line["employee_id"]),
                        before=line.get("before") or {},
                        payload=change_svc.jsonable(line.get("payload") or {}),
                        line_status="PENDING",
                        created_at=now,
                    )
                )
            await db.flush()
        await savepoint.commit()
    except IntegrityError as exc:
        await savepoint.rollback()
        raise HTTPException(status_code=409, detail="An open request of this kind already exists for the employee") from exc

    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="HR_CLASS_REQUEST_DRAFT",
        resource=f"hr.class_request:{req.id}",
        details=f"kind={kind}",
    )
    return req, True


async def update_draft(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    request_pk: int,
    payload: dict[str, Any] | None,
    reason: str | None,
    employee_id: int | None,
    lines: list[dict[str, Any]] | None = None,
) -> HrClassRequest:
    _require_flag(tenant)
    req = await lock_request(db, tenant.id, request_pk)
    if req.status not in {"DRAFT", "RETURNED"}:
        raise HTTPException(status_code=409, detail="Only draft or returned requests can be edited")
    if req.entered_by != user.id and not bool(getattr(user, "is_tenant_super_admin", False)):
        raise HTTPException(status_code=403, detail="Only the maker can edit this request")
    if employee_id is not None:
        await ensure_owned(db, Employee, employee_id, tenant.id, "Employee", status_code=404)
        req.employee_id = employee_id
    if payload is not None:
        if req.source == "ESS" and req.kind == "CORRECTION":
            payload = apply_service.assert_ess_correction_payload(payload)
        req.payload = change_svc.jsonable(payload)
        req.before = await _capture_before(db, tenant, req.kind, req.employee_id, payload)
    if reason is not None:
        req.reason = reason.strip()[:MAX_REASON]
    req.revision = int(req.revision or 1) + 1
    req.updated_at = datetime.utcnow()
    if lines is not None and req.kind == "BULK_INCREMENT":
        if len(lines) > 200:
            raise HTTPException(status_code=400, detail="BULK_INCREMENT allows at most 200 lines")
        old = (
            await db.execute(
                select(HrClassRequestLine).where(
                    HrClassRequestLine.tenant_id == tenant.id, HrClassRequestLine.request_pk == req.id
                )
            )
        ).scalars().all()
        for row in old:
            await db.delete(row)
        for line in lines:
            eid = int(line["employee_id"])
            await ensure_owned(db, Employee, eid, tenant.id, "Employee", status_code=404)
            db.add(
                HrClassRequestLine(
                    tenant_id=tenant.id,
                    request_pk=req.id,
                    employee_id=eid,
                    before=line.get("before") or {},
                    payload=change_svc.jsonable(line.get("payload") or {}),
                    line_status="PENDING",
                    created_at=datetime.utcnow(),
                )
            )
    await log_action(
        db, tenant_id=tenant.id, user_id=user.id, action="HR_CLASS_REQUEST_UPDATED", resource=f"hr.class_request:{req.id}"
    )
    return req


async def _auto_recommend(db: AsyncSession, *, tenant: Tenant, user: User, req: HrClassRequest, note: str | None) -> None:
    req.status = "RECOMMENDED"
    req.recommended_by = user.id
    req.recommended_at = datetime.utcnow()
    req.recommend_note = (note or "Auto-recommended (Class 2 entry)").strip()
    req.recommend_is_auto = True
    await _append_action(
        db, tenant_id=tenant.id, req=req, action="RECOMMEND", actor_user_id=user.id, note=req.recommend_note, is_auto=True
    )


async def submit(
    db: AsyncSession, *, tenant: Tenant, user: User, request_pk: int, note: str | None = None, resubmit: bool = False
) -> HrClassRequest:
    _require_flag(tenant)
    req = await lock_request(db, tenant.id, request_pk)
    action = "RESUBMIT" if resubmit else "SUBMIT"
    assert_transition(req.status, action)
    if req.entered_by != user.id and not bool(getattr(user, "is_tenant_super_admin", False)):
        raise HTTPException(status_code=403, detail="Only the maker can submit this request")
    role = await _role(db, user, tenant)
    if (
        role not in {"SUPER", "ENTRY", "RECOMMEND", "APPROVE"}
        and not (
            (req.source or "").upper() == "ESS"
            and req.entered_by == user.id
            and req.kind in {"LEAVE", "CORRECTION", "RESIGNATION"}
        )
    ):
        raise HTTPException(status_code=403, detail="No HR class authority to submit")
    if (req.source or "").upper() == "ESS" and role not in {"SUPER", "ENTRY", "RECOMMEND", "APPROVE"}:
        role = "ENTRY"

    if req.kind == "LEAVE":
        # Lock employee before leave
        if req.employee_id:
            await db.execute(select(Employee.id).where(Employee.id == req.employee_id, Employee.tenant_id == tenant.id).with_for_update())
        await _prepare_leave_on_submit(
            db, tenant=tenant, user=user, req=req, exclude_request_id=req.leave_request_id
        )
    if req.kind == "NEW_EMPLOYEE":
        system_access = str((req.payload or {}).get("system_access") or "NONE").upper()
        invite = (req.payload or {}).get("invite") or {}
        if system_access in {"ESS_ONLY", "ERP_USER"}:
            await assert_can_add_user(db, tenant.id)
        if system_access == "ERP_USER":
            # dry-check invite rules for a hypothetical Class 1 approver path at submit
            pass

    req.status = "SUBMITTED"
    req.recommended_by = None
    req.recommended_at = None
    req.recommend_note = None
    req.recommend_is_auto = False
    req.failure_reason = None
    req.updated_at = datetime.utcnow()
    await _append_action(db, tenant_id=tenant.id, req=req, action=action, actor_user_id=user.id, note=note)
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action=f"HR_CLASS_REQUEST_{action}",
        resource=f"hr.class_request:{req.id}",
        details=req.kind,
    )
    if can_auto_recommend_on_entry(role) or auto_recommend_on_entry(role):  # Class 2
        await _auto_recommend(db, tenant=tenant, user=user, req=req, note=note)
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            action="HR_CLASS_REQUEST_AUTO_RECOMMEND",
            resource=f"hr.class_request:{req.id}",
        )
    return req


async def recommend(
    db: AsyncSession, *, tenant: Tenant, user: User, request_pk: int, note: str | None
) -> HrClassRequest:
    from app.modules.hr_class_requests import delegation_service as del_svc

    _require_flag(tenant)
    req = await lock_request(db, tenant.id, request_pk)
    assert_transition(req.status, "RECOMMEND")
    role = await _role(db, user, tenant)
    delegated = None
    if role not in {"SUPER", "RECOMMEND"}:
        delegated = await del_svc.active_delegation_for(
            db, tenant_id=tenant.id, delegate_user_id=user.id, step="RECOMMEND"
        )
        if delegated is None:
            raise HTTPException(status_code=403, detail="Only Class 2 or Super Admin can recommend")
        if delegated.delegator_user_id == req.entered_by:
            raise HTTPException(status_code=403, detail="Delegator cannot recommend their own request via a delegate")
    await assert_hr_sod(
        db, tenant=tenant, actor=user, entered_by=req.entered_by, employee_id=req.employee_id, step="recommend"
    )
    req.status = "RECOMMENDED"
    req.recommended_by = user.id
    req.recommended_at = datetime.utcnow()
    req.recommend_note = (note or "").strip() or None
    req.recommend_is_auto = False
    req.updated_at = datetime.utcnow()
    await _append_action(db, tenant_id=tenant.id, req=req, action="RECOMMEND", actor_user_id=user.id, note=note)
    await log_action(
        db, tenant_id=tenant.id, user_id=user.id, action="HR_CLASS_REQUEST_RECOMMEND", resource=f"hr.class_request:{req.id}"
    )
    return req


async def return_request(
    db: AsyncSession, *, tenant: Tenant, user: User, request_pk: int, note: str | None
) -> HrClassRequest:
    _require_flag(tenant)
    req = await lock_request(db, tenant.id, request_pk)
    assert_transition(req.status, "RETURN")
    role = await _role(db, user, tenant)
    if req.status == "SUBMITTED" and role not in {"SUPER", "RECOMMEND"}:
        raise HTTPException(status_code=403, detail="Only Class 2 or Super Admin can return at recommend step")
    if req.status == "RECOMMENDED" and role not in {"SUPER", "APPROVE"}:
        raise HTTPException(status_code=403, detail="Only Class 1 or Super Admin can return at approve step")
    await assert_hr_sod(
        db,
        tenant=tenant,
        actor=user,
        entered_by=req.entered_by,
        recommended_by=req.recommended_by,
        employee_id=req.employee_id,
        step="approve" if req.status == "RECOMMENDED" else "recommend",
    )
    if req.kind == "LEAVE" and req.leave_request_id:
        if req.employee_id:
            await db.execute(
                select(Employee.id).where(Employee.id == req.employee_id, Employee.tenant_id == tenant.id).with_for_update()
            )
        leave = await leave_core.lock_leave_request(db, tenant.id, req.leave_request_id)
        await leave_core.return_leave_to_draft_core(db, tenant=tenant, row=leave)
    req.status = "RETURNED"
    req.recommended_by = None
    req.recommended_at = None
    req.recommend_is_auto = False
    req.updated_at = datetime.utcnow()
    await _append_action(db, tenant_id=tenant.id, req=req, action="RETURN", actor_user_id=user.id, note=note)
    await log_action(
        db, tenant_id=tenant.id, user_id=user.id, action="HR_CLASS_REQUEST_RETURN", resource=f"hr.class_request:{req.id}"
    )
    return req


async def reject(
    db: AsyncSession, *, tenant: Tenant, user: User, request_pk: int, note: str | None
) -> HrClassRequest:
    from app.modules.hr_class_requests import delegation_service as del_svc

    _require_flag(tenant)
    req = await lock_request(db, tenant.id, request_pk)
    assert_transition(req.status, "REJECT")
    role = await _role(db, user, tenant)
    if req.status == "SUBMITTED" and role not in {"SUPER", "RECOMMEND"}:
        delegated = await del_svc.active_delegation_for(
            db, tenant_id=tenant.id, delegate_user_id=user.id, step="RECOMMEND"
        )
        if delegated is None:
            raise HTTPException(status_code=403, detail="Only Class 2 or Super Admin can reject at recommend step")
        if delegated.delegator_user_id == req.entered_by:
            raise HTTPException(status_code=403, detail="Delegator cannot reject their own request via a delegate")
    if req.status == "RECOMMENDED" and role not in {"SUPER", "APPROVE"}:
        delegated = await del_svc.active_delegation_for(
            db, tenant_id=tenant.id, delegate_user_id=user.id, step="APPROVE"
        )
        if delegated is None:
            raise HTTPException(status_code=403, detail="Only Class 1 or Super Admin can reject at approve step")
        if delegated.delegator_user_id in {req.entered_by, req.recommended_by}:
            raise HTTPException(
                status_code=403,
                detail="Delegator cannot reject a request they entered or recommended via a delegate",
            )
    await assert_hr_sod(
        db,
        tenant=tenant,
        actor=user,
        entered_by=req.entered_by,
        recommended_by=req.recommended_by,
        employee_id=req.employee_id,
        step="approve" if req.status == "RECOMMENDED" else "recommend",
    )
    if req.kind == "LEAVE" and req.leave_request_id:
        leave = await leave_core.lock_leave_request(db, tenant.id, req.leave_request_id)
        await leave_core.reject_leave_request_core(db, tenant=tenant, actor=user, row=leave, note=note)
    req.status = "REJECTED"
    req.updated_at = datetime.utcnow()
    await _append_action(db, tenant_id=tenant.id, req=req, action="REJECT", actor_user_id=user.id, note=note)
    await log_action(
        db, tenant_id=tenant.id, user_id=user.id, action="HR_CLASS_REQUEST_REJECT", resource=f"hr.class_request:{req.id}"
    )
    return req


async def approve(
    db: AsyncSession, *, tenant: Tenant, user: User, request_pk: int, note: str | None
) -> HrClassRequest:
    from app.modules.hr_class_requests import delegation_service as del_svc

    _require_flag(tenant)
    req = await lock_request(db, tenant.id, request_pk)
    assert_transition(req.status, "APPROVE")
    role = await _role(db, user, tenant)
    if role not in {"SUPER", "APPROVE"}:
        delegated = await del_svc.active_delegation_for(
            db, tenant_id=tenant.id, delegate_user_id=user.id, step="APPROVE"
        )
        if delegated is None:
            raise HTTPException(status_code=403, detail="Only Class 1 or Super Admin can approve")
        if delegated.delegator_user_id in {req.entered_by, req.recommended_by}:
            raise HTTPException(
                status_code=403,
                detail="Delegator cannot approve a request they entered or recommended via a delegate",
            )
    await assert_hr_sod(
        db,
        tenant=tenant,
        actor=user,
        entered_by=req.entered_by,
        recommended_by=req.recommended_by,
        employee_id=req.employee_id,
        step="approve",
    )
    # Option A invite check at approve
    if req.kind == "NEW_EMPLOYEE":
        system_access = str((req.payload or {}).get("system_access") or "NONE").upper()
        invite = (req.payload or {}).get("invite") or {}
        await assert_erp_user_invite_approver(
            db,
            tenant=tenant,
            actor=user,
            system_access=system_access if system_access in {"NONE", "ESS_ONLY", "ERP_USER"} else "NONE",
            authority_class=invite.get("authority_class"),
            module_grants=invite.get("module_grants") or invite.get("modules"),
        )
        if system_access in {"ESS_ONLY", "ERP_USER"}:
            await assert_can_add_user(db, tenant.id)

    maker = await db.get(User, req.entered_by) if req.entered_by else None
    if maker is None or maker.tenant_id != tenant.id:
        raise HTTPException(status_code=409, detail="Maker user not found")

    req.status = "APPLYING"
    req.approved_by = user.id
    req.approved_at = datetime.utcnow()
    req.approve_note = (note or "").strip() or None
    req.updated_at = datetime.utcnow()
    await _append_action(db, tenant_id=tenant.id, req=req, action="APPROVE", actor_user_id=user.id, note=note)
    await log_action(
        db, tenant_id=tenant.id, user_id=user.id, action="HR_CLASS_REQUEST_APPROVE", resource=f"hr.class_request:{req.id}"
    )
    # Caller (router) should commit APPLYING, then call finish_apply — but we apply in same txn for most kinds.
    # NEW_EMPLOYEE may commit inside onboarding; status set after apply.
    try:
        next_status = await apply_service.apply_request(db, tenant=tenant, actor=user, req=req, maker=maker)
        req.status = next_status
        if next_status == "APPLIED":
            req.applied_at = datetime.utcnow()
            req.failure_reason = None
            await _append_action(db, tenant_id=tenant.id, req=req, action="APPLY", actor_user_id=user.id)
        elif next_status == "FAILED":
            await _append_action(db, tenant_id=tenant.id, req=req, action="FAIL", actor_user_id=user.id, note=req.failure_reason)
        else:
            # APPROVED = retryable late failure
            await _append_action(db, tenant_id=tenant.id, req=req, action="FAIL", actor_user_id=user.id, note=req.failure_reason)
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            action="HR_CLASS_REQUEST_APPLY",
            resource=f"hr.class_request:{req.id}",
            details=next_status,
        )
    except HTTPException as exc:
        req.status = "FAILED"
        req.failure_reason = str(exc.detail)
        await _append_action(db, tenant_id=tenant.id, req=req, action="FAIL", actor_user_id=user.id, note=req.failure_reason)
    except Exception as exc:
        await safe_async_session_rollback(db)
        raise
    return req


async def retry_apply(
    db: AsyncSession, *, tenant: Tenant, user: User, request_pk: int, note: str | None
) -> HrClassRequest:
    _require_flag(tenant)
    req = await lock_request(db, tenant.id, request_pk)
    assert_transition(req.status, "RETRY")
    role = await _role(db, user, tenant)
    if role not in {"SUPER", "APPROVE"}:
        raise HTTPException(status_code=403, detail="Only Class 1 or Super Admin can retry apply")
    maker = await db.get(User, req.entered_by) if req.entered_by else None
    if maker is None or maker.tenant_id != tenant.id:
        raise HTTPException(status_code=409, detail="Maker user not found")
    req.status = "APPLYING"
    req.updated_at = datetime.utcnow()
    await _append_action(db, tenant_id=tenant.id, req=req, action="RETRY", actor_user_id=user.id, note=note)
    try:
        next_status = await apply_service.apply_request(db, tenant=tenant, actor=user, req=req, maker=maker)
        req.status = next_status
        if next_status == "APPLIED":
            req.applied_at = datetime.utcnow()
            req.failure_reason = None
            await _append_action(db, tenant_id=tenant.id, req=req, action="APPLY", actor_user_id=user.id)
        else:
            await _append_action(db, tenant_id=tenant.id, req=req, action="FAIL", actor_user_id=user.id, note=req.failure_reason)
    except HTTPException as exc:
        req.status = "FAILED"
        req.failure_reason = str(exc.detail)
        await _append_action(db, tenant_id=tenant.id, req=req, action="FAIL", actor_user_id=user.id, note=req.failure_reason)
    except Exception:
        await safe_async_session_rollback(db)
        raise
    return req


async def cancel(
    db: AsyncSession, *, tenant: Tenant, user: User, request_pk: int, note: str | None
) -> HrClassRequest:
    _require_flag(tenant)
    req = await lock_request(db, tenant.id, request_pk)
    assert_transition(req.status, "CANCEL")
    if req.entered_by != user.id and not bool(getattr(user, "is_tenant_super_admin", False)):
        role = await _role(db, user, tenant)
        if role not in {"SUPER", "APPROVE"}:
            raise HTTPException(status_code=403, detail="Only the maker, Class 1 or Super Admin can cancel")
    # Cancel after return must not double-release leave balance (already DRAFT)
    if req.kind == "LEAVE" and req.leave_request_id and req.status != "RETURNED":
        leave = await leave_core.lock_leave_request(db, tenant.id, req.leave_request_id)
        if leave.status == "PENDING":
            await leave_core.return_leave_to_draft_core(db, tenant=tenant, row=leave)
            leave.status = "CANCELLED" if hasattr(leave, "status") else leave.status
    req.status = "CANCELLED"
    req.updated_at = datetime.utcnow()
    await _append_action(db, tenant_id=tenant.id, req=req, action="CANCEL", actor_user_id=user.id, note=note)
    await log_action(
        db, tenant_id=tenant.id, user_id=user.id, action="HR_CLASS_REQUEST_CANCEL", resource=f"hr.class_request:{req.id}"
    )
    return req


async def list_requests(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    status_filter: str | None = None,
    kind: str | None = None,
    employee_id: int | None = None,
    view: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[HrClassRequest]:
    _require_flag(tenant)
    limit = min(max(limit, 1), MAX_PAGE_SIZE)
    offset = max(offset, 0)
    stmt = select(HrClassRequest).where(HrClassRequest.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(HrClassRequest.status == status_filter.strip().upper())
    if kind:
        stmt = stmt.where(HrClassRequest.kind == kind.strip().upper())
    if employee_id is not None:
        stmt = stmt.where(HrClassRequest.employee_id == employee_id)
    role = await _role(db, user, tenant)
    if view == "mine":
        stmt = stmt.where(HrClassRequest.entered_by == user.id)
    elif view == "recommend" and role in {"RECOMMEND", "SUPER"}:
        stmt = stmt.where(HrClassRequest.status == "SUBMITTED", HrClassRequest.entered_by != user.id)
    elif view == "approve" and role in {"APPROVE", "SUPER"}:
        stmt = stmt.where(
            HrClassRequest.status.in_(("RECOMMENDED", "APPROVED", "FAILED")),
            HrClassRequest.entered_by != user.id,
        )
    stmt = stmt.order_by(HrClassRequest.id.desc()).offset(offset).limit(limit)
    return list((await db.execute(stmt)).scalars().all())
