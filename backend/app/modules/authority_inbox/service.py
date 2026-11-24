"""Authority change-request workflow + actor-eligible inbox aggregate."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.constants import (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
    AUTHORITY_SUPER,
    CLASS1_APPROVAL_PENDING,
)
from app.common.authority.policy import (
    is_authority_classes_enabled_for_tenant,
    load_user_module_codes,
    user_has_module,
)
from app.models import User
from app.models.authority_change_request import AuthorityChangeAction, AuthorityChangeRequest
from app.models.finance import Voucher
from app.models.inventory import EnhancedGatePass, PurchaseOrder
from app.modules.authority_inbox.adapters import (
    apply_change,
    assert_proposed_allowed_for_resource,
    clean_proposed,
    load_before,
)

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def _norm_class(user: User) -> str | None:
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return AUTHORITY_SUPER
    raw = getattr(user, "authority_class", None)
    if raw is None:
        return None
    text = str(raw).strip().upper()
    return text or None


def _require_flag(feature_flags: Any) -> None:
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


async def _require_module(db: AsyncSession, user: User, module_code: str) -> None:
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return
    modules = await load_user_module_codes(db, tenant_id=user.tenant_id, user_id=user.id)
    if not user_has_module(modules, module_code):
        raise HTTPException(status_code=403, detail=f"Module '{module_code}' is required")


def _actor_ids(row: AuthorityChangeRequest) -> set[int]:
    out: set[int] = set()
    for uid in (row.created_by, row.verified_by, row.recommended_by, row.approved_by, row.takeover_by):
        if uid is not None:
            out.add(int(uid))
    return out


async def _append_action(
    db: AsyncSession,
    *,
    tenant_id: int,
    row: AuthorityChangeRequest,
    kind: str,
    actor_user_id: int | None,
    note: str | None,
    from_status: str | None,
    to_status: str | None,
) -> None:
    db.add(
        AuthorityChangeAction(
            tenant_id=tenant_id,
            change_request_id=row.id,
            action_kind=kind,
            actor_user_id=actor_user_id,
            note=(note or "").strip() or None,
            from_status=from_status,
            to_status=to_status,
            created_at=datetime.utcnow(),
        )
    )


def _row_out(row: AuthorityChangeRequest) -> dict[str, Any]:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "request_id": row.request_id,
        "module_code": row.module_code,
        "resource_type": row.resource_type,
        "resource_id": row.resource_id,
        "action": row.action,
        "status": row.status,
        "current_step": row.current_step,
        "base_version": row.base_version,
        "before_snapshot": row.before_snapshot,
        "proposed_snapshot": row.proposed_snapshot,
        "reason": row.reason,
        "created_by": row.created_by,
        "verified_by": row.verified_by,
        "recommended_by": row.recommended_by,
        "approved_by": row.approved_by,
        "takeover_by": row.takeover_by,
        "applied_at": row.applied_at,
        "failure_reason": row.failure_reason,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


async def submit_change_request(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    feature_flags: Any,
    request_id: str | None,
    module_code: str,
    resource_type: str,
    resource_id: int | None,
    action: str,
    proposed_snapshot: dict[str, Any],
    reason: str,
) -> AuthorityChangeRequest:
    _require_flag(feature_flags)
    module_code = (module_code or "").strip().lower() or "finance"
    await _require_module(db, user, module_code)
    cls = _norm_class(user)
    if cls not in {AUTHORITY_CLASS_1, AUTHORITY_CLASS_2, AUTHORITY_CLASS_3, AUTHORITY_CLASS_4, AUTHORITY_SUPER}:
        raise HTTPException(status_code=403, detail="Authority class required to submit a change request")

    rid = (request_id or "").strip() or f"acr-{uuid.uuid4().hex[:16]}"
    if not _REQUEST_ID_RE.match(rid):
        raise HTTPException(status_code=400, detail="request_id must be 8–64 letters, digits, _ or -")

    existing = (
        await db.execute(
            select(AuthorityChangeRequest).where(
                AuthorityChangeRequest.tenant_id == tenant_id,
                AuthorityChangeRequest.request_id == rid,
            ).limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing  # idempotent replay

    action_u = (action or "").strip().upper()
    if action_u not in {"CREATE", "UPDATE", "DEACTIVATE"}:
        raise HTTPException(status_code=400, detail="action must be CREATE, UPDATE or DEACTIVATE")
    if action_u != "CREATE" and resource_id is None:
        raise HTTPException(status_code=400, detail="resource_id is required for UPDATE/DEACTIVATE")

    proposed = clean_proposed(resource_type, proposed_snapshot)
    before = await load_before(db, tenant_id=tenant_id, resource_type=resource_type, resource_id=resource_id)
    await assert_proposed_allowed_for_resource(
        db,
        tenant_id=tenant_id,
        resource_type=resource_type,
        resource_id=resource_id,
        action=action_u,
        proposed=proposed,
    )
    reason_text = (reason or "").strip()
    if len(reason_text) < 3:
        raise HTTPException(status_code=400, detail="reason is required (at least 3 characters)")

    row = AuthorityChangeRequest(
        tenant_id=tenant_id,
        request_id=rid,
        module_code=module_code,
        resource_type=resource_type,
        resource_id=resource_id,
        action=action_u,
        status="SUBMITTED",
        current_step="VERIFY",
        base_version=1,
        before_snapshot=before,
        proposed_snapshot=proposed,
        reason=reason_text,
        created_by=user.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    await db.flush()
    await _append_action(
        db,
        tenant_id=tenant_id,
        row=row,
        kind="SUBMIT",
        actor_user_id=user.id,
        note=reason_text,
        from_status=None,
        to_status="SUBMITTED",
    )
    await db.flush()
    return row


async def _lock_request(db: AsyncSession, tenant_id: int, request_pk: int) -> AuthorityChangeRequest:
    row = (
        await db.execute(
            select(AuthorityChangeRequest)
            .where(AuthorityChangeRequest.id == request_pk, AuthorityChangeRequest.tenant_id == tenant_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Change request not found")
    return row


async def decide_change_request(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    feature_flags: Any,
    request_pk: int,
    decision: str,
    note: str | None,
) -> AuthorityChangeRequest:
    _require_flag(feature_flags)
    row = await _lock_request(db, tenant_id, request_pk)
    await _require_module(db, user, row.module_code)
    decision_u = (decision or "").strip().upper()
    cls = _norm_class(user)
    actors = _actor_ids(row)
    note_text = (note or "").strip() or None

    if decision_u == "TAKEOVER":
        if cls not in {AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
            raise HTTPException(status_code=403, detail="Only Class 1 can take over a stuck step")
        if row.status not in {"SUBMITTED", "VERIFIED", "RECOMMENDED"}:
            raise HTTPException(status_code=409, detail="Request is not open for takeover")
        row.takeover_by = user.id
        # Act at current step without skipping
        if row.current_step == "VERIFY":
            decision_u = "VERIFY"
        elif row.current_step == "RECOMMEND":
            decision_u = "RECOMMEND"
        elif row.current_step == "APPROVE":
            decision_u = "APPROVE"
        else:
            raise HTTPException(status_code=409, detail="Nothing to take over at this step")
        await _append_action(
            db,
            tenant_id=tenant_id,
            row=row,
            kind="TAKEOVER",
            actor_user_id=user.id,
            note=note_text,
            from_status=row.status,
            to_status=row.status,
        )

    if decision_u == "VERIFY":
        if row.status != "SUBMITTED" or row.current_step != "VERIFY":
            raise HTTPException(status_code=409, detail="Request is not waiting for verification")
        if cls not in {AUTHORITY_CLASS_3, AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
            raise HTTPException(status_code=403, detail="Class 3 (or Class 1 takeover) required to verify")
        if user.id in actors:
            raise HTTPException(status_code=403, detail="Separation of duties: you already acted on this request")
        prev = row.status
        row.status = "VERIFIED"
        row.current_step = "RECOMMEND"
        row.verified_by = user.id
        await _append_action(
            db, tenant_id=tenant_id, row=row, kind="VERIFY", actor_user_id=user.id, note=note_text, from_status=prev, to_status=row.status
        )
        await db.flush()
        return row

    if decision_u == "RECOMMEND":
        if row.status != "VERIFIED" or row.current_step != "RECOMMEND":
            raise HTTPException(status_code=409, detail="Request is not waiting for recommendation")
        if cls not in {AUTHORITY_CLASS_2, AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
            raise HTTPException(status_code=403, detail="Class 2 (or Class 1 takeover) required to recommend")
        if user.id in actors:
            raise HTTPException(status_code=403, detail="Separation of duties: you already acted on this request")
        prev = row.status
        row.status = "RECOMMENDED"
        row.current_step = "APPROVE"
        row.recommended_by = user.id
        await _append_action(
            db,
            tenant_id=tenant_id,
            row=row,
            kind="RECOMMEND",
            actor_user_id=user.id,
            note=note_text,
            from_status=prev,
            to_status=row.status,
        )
        await db.flush()
        return row

    if decision_u == "APPROVE":
        if row.status != "RECOMMENDED" or row.current_step != "APPROVE":
            raise HTTPException(status_code=409, detail="Request is not waiting for Class 1 approval")
        if cls not in {AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
            raise HTTPException(status_code=403, detail="Class 1 required to approve")
        if user.id in actors:
            raise HTTPException(status_code=403, detail="Separation of duties: you already acted on this request")
        if row.created_by == user.id:
            raise HTTPException(status_code=403, detail="Creator cannot approve their own sensitive change")
        prev = row.status
        row.status = "APPLYING"
        row.current_step = "APPLY"
        row.approved_by = user.id
        await _append_action(
            db, tenant_id=tenant_id, row=row, kind="APPROVE", actor_user_id=user.id, note=note_text, from_status=prev, to_status="APPLYING"
        )
        try:
            new_id = await apply_change(
                db,
                tenant_id=tenant_id,
                resource_type=row.resource_type,
                action=row.action,
                resource_id=row.resource_id,
                proposed=row.proposed_snapshot or {},
                base_version=row.base_version,
            )
            row.resource_id = new_id
            row.status = "APPLIED"
            row.applied_at = datetime.utcnow()
            await _append_action(
                db,
                tenant_id=tenant_id,
                row=row,
                kind="APPLY",
                actor_user_id=user.id,
                note=None,
                from_status="APPLYING",
                to_status="APPLIED",
            )
        except HTTPException as exc:
            row.status = "CONFLICT" if exc.status_code == 409 else "ROUTING_EXCEPTION"
            row.failure_reason = str(exc.detail)
            await _append_action(
                db,
                tenant_id=tenant_id,
                row=row,
                kind="FAIL",
                actor_user_id=user.id,
                note=row.failure_reason,
                from_status="APPLYING",
                to_status=row.status,
            )
        await db.flush()
        return row

    if decision_u == "REJECT":
        if row.status not in {"SUBMITTED", "VERIFIED", "RECOMMENDED"}:
            raise HTTPException(status_code=409, detail="Request is not open")
        if cls not in {AUTHORITY_CLASS_1, AUTHORITY_CLASS_2, AUTHORITY_CLASS_3, AUTHORITY_SUPER}:
            raise HTTPException(status_code=403, detail="Not allowed to reject")
        if not note_text or len(note_text) < 3:
            raise HTTPException(status_code=400, detail="Reject reason is required")
        prev = row.status
        row.status = "REJECTED"
        await _append_action(
            db, tenant_id=tenant_id, row=row, kind="REJECT", actor_user_id=user.id, note=note_text, from_status=prev, to_status="REJECTED"
        )
        await db.flush()
        return row

    if decision_u == "RETURN":
        if row.status not in {"VERIFIED", "RECOMMENDED"}:
            raise HTTPException(status_code=409, detail="Only verified/recommended requests can be returned")
        if cls not in {AUTHORITY_CLASS_1, AUTHORITY_CLASS_2, AUTHORITY_SUPER}:
            raise HTTPException(status_code=403, detail="Not allowed to return")
        if not note_text or len(note_text) < 3:
            raise HTTPException(status_code=400, detail="Return reason is required")
        prev = row.status
        row.status = "RETURNED"
        row.current_step = "VERIFY"
        await _append_action(
            db, tenant_id=tenant_id, row=row, kind="RETURN", actor_user_id=user.id, note=note_text, from_status=prev, to_status="RETURNED"
        )
        await db.flush()
        return row

    raise HTTPException(status_code=400, detail="decision must be VERIFY, RECOMMEND, APPROVE, REJECT, RETURN or TAKEOVER")


async def list_change_requests(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    feature_flags: Any,
    scope: str,
    limit: int = 50,
    offset: int = 0,
) -> list[AuthorityChangeRequest]:
    _require_flag(feature_flags)
    modules = await load_user_module_codes(db, tenant_id=tenant_id, user_id=user.id)
    if bool(getattr(user, "is_tenant_super_admin", False)):
        modules = set(modules) | {"finance", "settings", "hr", "inventory", "merch", "production", "commercial", "trade", "facility"}
    q: Select[Any] = select(AuthorityChangeRequest).where(AuthorityChangeRequest.tenant_id == tenant_id)
    scope_u = (scope or "waiting").strip().lower()
    cls = _norm_class(user)
    if scope_u == "mine":
        q = q.where(AuthorityChangeRequest.created_by == user.id)
    elif scope_u == "history":
        q = q.where(AuthorityChangeRequest.status.in_(("APPLIED", "REJECTED", "RETURNED", "CONFLICT", "ROUTING_EXCEPTION")))
        if modules:
            q = q.where(AuthorityChangeRequest.module_code.in_(sorted(modules)))
    else:
        # waiting for me
        step_filters = []
        if cls in {AUTHORITY_CLASS_3, AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
            step_filters.append(
                (AuthorityChangeRequest.status == "SUBMITTED") & (AuthorityChangeRequest.current_step == "VERIFY")
            )
        if cls in {AUTHORITY_CLASS_2, AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
            step_filters.append(
                (AuthorityChangeRequest.status == "VERIFIED") & (AuthorityChangeRequest.current_step == "RECOMMEND")
            )
        if cls in {AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
            step_filters.append(
                (AuthorityChangeRequest.status == "RECOMMENDED") & (AuthorityChangeRequest.current_step == "APPROVE")
            )
        if not step_filters:
            return []
        q = q.where(or_(*step_filters))
        if modules:
            q = q.where(AuthorityChangeRequest.module_code.in_(sorted(modules)))
        q = q.where(
            or_(AuthorityChangeRequest.created_by.is_(None), AuthorityChangeRequest.created_by != user.id)
        )
    q = q.order_by(AuthorityChangeRequest.id.desc()).offset(offset).limit(limit)
    return list((await db.execute(q)).scalars().all())


async def build_inbox(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    feature_flags: Any,
    limit: int = 50,
) -> dict[str, Any]:
    """Actor-eligible aggregate: vouchers + Class1 pending + change requests + counts."""
    enabled = is_authority_classes_enabled_for_tenant(feature_flags)
    if not enabled:
        return {
            "authority_classes_enabled": False,
            "counts": {
                "verify": 0,
                "recommend": 0,
                "approve": 0,
                "class1_pending": 0,
                "change_requests": 0,
                "hr_class_recommend": 0,
                "hr_class_approve": 0,
            },
            "waiting_for_me": [],
            "my_requests": [],
        }

    cls = _norm_class(user)
    modules = await load_user_module_codes(db, tenant_id=tenant_id, user_id=user.id)
    has_finance = bool(getattr(user, "is_tenant_super_admin", False)) or user_has_module(modules, "finance")
    waiting: list[dict[str, Any]] = []
    counts = {
        "verify": 0,
        "recommend": 0,
        "approve": 0,
        "class1_pending": 0,
        "change_requests": 0,
        "hr_class_recommend": 0,
        "hr_class_approve": 0,
    }

    if has_finance:
        if cls in {AUTHORITY_CLASS_3, AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
            rows = (
                await db.execute(
                    select(Voucher)
                    .where(
                        Voucher.tenant_id == tenant_id,
                        Voucher.status == "SUBMITTED",
                        or_(Voucher.created_by.is_(None), Voucher.created_by != user.id),
                    )
                    .order_by(Voucher.id.desc())
                    .limit(limit)
                )
            ).scalars().all()
            counts["verify"] = len(rows)
            for v in rows:
                waiting.append(
                    {
                        "kind": "voucher_verify",
                        "id": v.id,
                        "number": v.voucher_number,
                        "date": v.voucher_date.isoformat(),
                        "status": v.status,
                        "href": f"/app/accounts/vouchers/{v.id}",
                        "actions": ["check", "reject"],
                    }
                )
        if cls in {AUTHORITY_CLASS_2, AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
            rows = (
                await db.execute(
                    select(Voucher)
                    .where(
                        Voucher.tenant_id == tenant_id,
                        Voucher.status == "CHECKED",
                        or_(Voucher.created_by.is_(None), Voucher.created_by != user.id),
                    )
                    .order_by(Voucher.id.desc())
                    .limit(limit)
                )
            ).scalars().all()
            counts["recommend"] = len(rows)
            for v in rows:
                waiting.append(
                    {
                        "kind": "voucher_recommend",
                        "id": v.id,
                        "number": v.voucher_number,
                        "date": v.voucher_date.isoformat(),
                        "status": v.status,
                        "href": f"/app/accounts/vouchers/{v.id}",
                        "actions": ["recommend", "reject"],
                    }
                )
        if cls in {AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
            rows = (
                await db.execute(
                    select(Voucher)
                    .where(
                        Voucher.tenant_id == tenant_id,
                        Voucher.status == "POSTED",
                        Voucher.class1_approval_status == CLASS1_APPROVAL_PENDING,
                        or_(Voucher.created_by.is_(None), Voucher.created_by != user.id),
                    )
                    .order_by(Voucher.id.desc())
                    .limit(limit)
                )
            ).scalars().all()
            counts["class1_pending"] = len(rows)
            for v in rows:
                waiting.append(
                    {
                        "kind": "voucher_class1",
                        "id": v.id,
                        "number": v.voucher_number,
                        "date": v.voucher_date.isoformat(),
                        "status": v.class1_approval_status,
                        "href": f"/app/accounts/vouchers/{v.id}",
                        "actions": ["class1_approve", "class1_reject"],
                    }
                )
            past_rows = (
                await db.execute(
                    select(Voucher)
                    .where(
                        Voucher.tenant_id == tenant_id,
                        Voucher.status == "RECOMMENDED",
                        or_(Voucher.created_by.is_(None), Voucher.created_by != user.id),
                    )
                    .order_by(Voucher.id.desc())
                    .limit(limit)
                )
            ).scalars().all()
            counts["approve"] = len(past_rows)
            for v in past_rows:
                waiting.append(
                    {
                        "kind": "voucher_approve",
                        "id": v.id,
                        "number": v.voucher_number,
                        "date": v.voucher_date.isoformat(),
                        "status": v.status,
                        "href": f"/app/accounts/vouchers/{v.id}",
                        "actions": ["approve", "reject"],
                    }
                )

    has_inventory = bool(getattr(user, "is_tenant_super_admin", False)) or user_has_module(modules, "inventory")
    if has_inventory and cls in {AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
        gp_rows = (
            await db.execute(
                select(EnhancedGatePass)
                .where(
                    EnhancedGatePass.tenant_id == tenant_id,
                    EnhancedGatePass.status == "RELEASED",
                    EnhancedGatePass.class1_approval_status == CLASS1_APPROVAL_PENDING,
                    or_(
                        EnhancedGatePass.created_by_user_id.is_(None),
                        EnhancedGatePass.created_by_user_id != user.id,
                    ),
                    or_(
                        EnhancedGatePass.signed_by_user_id.is_(None),
                        EnhancedGatePass.signed_by_user_id != user.id,
                    ),
                )
                .order_by(EnhancedGatePass.id.desc())
                .limit(limit)
            )
        ).scalars().all()
        counts["class1_pending"] = int(counts.get("class1_pending") or 0) + len(gp_rows)
        for gp in gp_rows:
            waiting.append(
                {
                    "kind": "gate_pass_class1",
                    "id": gp.id,
                    "number": gp.gate_pass_code,
                    "date": gp.created_at.date().isoformat() if gp.created_at else None,
                    "status": gp.class1_approval_status,
                    "href": f"/app/inventory/enhanced-gate-passes/{gp.id}",
                    "actions": ["class1_approve", "class1_reject"],
                }
            )

        po_rows = (
            await db.execute(
                select(PurchaseOrder)
                .where(
                    PurchaseOrder.tenant_id == tenant_id,
                    PurchaseOrder.status == "APPROVED",
                    PurchaseOrder.class1_approval_status == CLASS1_APPROVAL_PENDING,
                    or_(
                        PurchaseOrder.created_by_user_id.is_(None),
                        PurchaseOrder.created_by_user_id != user.id,
                    ),
                    or_(
                        PurchaseOrder.approved_by_user_id.is_(None),
                        PurchaseOrder.approved_by_user_id != user.id,
                    ),
                )
                .order_by(PurchaseOrder.id.desc())
                .limit(limit)
            )
        ).scalars().all()
        counts["class1_pending"] = int(counts.get("class1_pending") or 0) + len(po_rows)
        for po in po_rows:
            waiting.append(
                {
                    "kind": "purchase_order_class1",
                    "id": po.id,
                    "number": po.po_code,
                    "date": po.order_date.isoformat() if po.order_date else (
                        po.created_at.date().isoformat() if po.created_at else None
                    ),
                    "status": po.class1_approval_status,
                    "href": f"/app/inventory/purchase-orders?highlight={po.id}",
                    "actions": ["class1_approve", "class1_reject"],
                }
            )

    crs = await list_change_requests(
        db, tenant_id=tenant_id, user=user, feature_flags=feature_flags, scope="waiting", limit=limit
    )
    counts["change_requests"] = len(crs)
    for row in crs:
        waiting.append(
            {
                "kind": "change_request",
                "id": row.id,
                "number": row.request_id,
                "date": row.created_at.date().isoformat() if row.created_at else "",
                "status": row.status,
                "current_step": row.current_step,
                "resource_type": row.resource_type,
                "href": f"/app/approvals?tab=authority&id={row.id}",
                "actions": _cr_actions_for_step(row.current_step, cls),
                "before_snapshot": row.before_snapshot,
                "proposed_snapshot": row.proposed_snapshot,
                "reason": row.reason,
            }
        )

    # HR class requests (voucher-style)
    counts["hr_class_recommend"] = 0
    counts["hr_class_approve"] = 0
    has_hr = bool(getattr(user, "is_tenant_super_admin", False)) or user_has_module(modules, "hr")
    if has_hr:
        from app.models.hr_class_request import HrClassRequest
        from app.modules.hr_class_requests.masking import mask_mapping

        if cls in {AUTHORITY_CLASS_2, AUTHORITY_SUPER}:
            hr_rec = (
                await db.execute(
                    select(HrClassRequest)
                    .where(
                        HrClassRequest.tenant_id == tenant_id,
                        HrClassRequest.status == "SUBMITTED",
                        or_(HrClassRequest.entered_by.is_(None), HrClassRequest.entered_by != user.id),
                    )
                    .order_by(HrClassRequest.id.desc())
                    .limit(limit)
                )
            ).scalars().all()
            counts["hr_class_recommend"] = len(hr_rec)
            for r in hr_rec:
                waiting.append(
                    {
                        "kind": "hr_class_recommend",
                        "id": r.id,
                        "number": r.request_no,
                        "date": r.created_at.date().isoformat() if r.created_at else "",
                        "status": r.status,
                        "hr_kind": r.kind,
                        "href": f"/app/hr/requests?id={r.id}",
                        "actions": ["recommend", "return", "reject"],
                        "payload": mask_mapping(r.payload or {}, can_view_pay=False, can_view_identity=False),
                        "reason": r.reason,
                    }
                )
        if cls in {AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
            hr_appr = (
                await db.execute(
                    select(HrClassRequest)
                    .where(
                        HrClassRequest.tenant_id == tenant_id,
                        HrClassRequest.status.in_(("RECOMMENDED", "APPROVED", "FAILED")),
                        or_(HrClassRequest.entered_by.is_(None), HrClassRequest.entered_by != user.id),
                        or_(HrClassRequest.recommended_by.is_(None), HrClassRequest.recommended_by != user.id),
                    )
                    .order_by(HrClassRequest.id.desc())
                    .limit(limit)
                )
            ).scalars().all()
            counts["hr_class_approve"] = len(hr_appr)
            for r in hr_appr:
                waiting.append(
                    {
                        "kind": "hr_class_approve",
                        "id": r.id,
                        "number": r.request_no,
                        "date": r.created_at.date().isoformat() if r.created_at else "",
                        "status": r.status,
                        "hr_kind": r.kind,
                        "href": f"/app/hr/requests?id={r.id}",
                        "actions": ["approve", "return", "reject", "retry"] if r.status in {"APPROVED", "FAILED"} else ["approve", "return", "reject"],
                        "payload": mask_mapping(r.payload or {}, can_view_pay=False, can_view_identity=False),
                        "reason": r.reason,
                    }
                )

    mine = await list_change_requests(
        db, tenant_id=tenant_id, user=user, feature_flags=feature_flags, scope="mine", limit=limit
    )
    return {
        "authority_classes_enabled": True,
        "authority_class": cls,
        "counts": counts,
        "waiting_for_me": waiting[: limit * 2],
        "my_requests": [_row_out(r) for r in mine],
    }


def _cr_actions_for_step(step: str, cls: str | None) -> list[str]:
    if step == "VERIFY" and cls in {AUTHORITY_CLASS_3, AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
        return ["VERIFY", "REJECT"]
    if step == "RECOMMEND" and cls in {AUTHORITY_CLASS_2, AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
        return ["RECOMMEND", "REJECT", "RETURN"]
    if step == "APPROVE" and cls in {AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
        return ["APPROVE", "REJECT", "RETURN", "TAKEOVER"]
    if cls in {AUTHORITY_CLASS_1, AUTHORITY_SUPER}:
        return ["TAKEOVER"]
    return []


async def count_waiting_for_user(
    db: AsyncSession, *, tenant_id: int, user: User, feature_flags: Any
) -> int:
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return 0
    inbox = await build_inbox(db, tenant_id=tenant_id, user=user, feature_flags=feature_flags, limit=200)
    c = inbox["counts"]
    return int(
        c.get("verify", 0)
        + c.get("recommend", 0)
        + c.get("approve", 0)
        + c.get("class1_pending", 0)
        + c.get("change_requests", 0)
        + c.get("hr_class_recommend", 0)
        + c.get("hr_class_approve", 0)
    )
