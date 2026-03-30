"""Commercial change request lifecycle (propose → approve/reject → apply)."""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CommercialChangeRequest, Order, Quotation, User
from app.modules.ai_tool.audit import log_ai_event
from app.modules.master_data_ai.request_context import get_master_data_ai_request_id
from app.modules.orders.commercial_fields import (
    is_order_commercial_locked,
    is_protected_order_field,
    is_protected_quotation_field,
    is_quotation_commercial_locked,
)

DATE_FIELDS: frozenset[str] = frozenset(
    {"delivery_date", "projected_delivery_date", "valid_until"}
)
INT_FIELDS: frozenset[str] = frozenset({"quantity", "projected_quantity"})
NUMERIC_NEW_VALUE_REQUIRED: frozenset[str] = frozenset({"quantity", "projected_quantity", "commission_value"})


def _serialize_value(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return json.dumps(val.date().isoformat())
    if isinstance(val, date):
        return json.dumps(val.isoformat())
    if isinstance(val, float):
        return json.dumps(val)
    if isinstance(val, int):
        return json.dumps(val)
    return json.dumps(val, default=str)


def snapshot_order_field(order: Order, key: str) -> str | None:
    return _serialize_value(getattr(order, key, None))


def snapshot_quotation_field(q: Quotation, key: str) -> str | None:
    return _serialize_value(getattr(q, key, None))


def _parse_stored_scalar(raw: str | None) -> Any:
    if raw is None or raw == "":
        return None
    return json.loads(raw)


def parse_value_for_apply(field_key: str, raw: str | None) -> Any:
    data = _parse_stored_scalar(raw)
    if field_key in DATE_FIELDS:
        if isinstance(data, str):
            return date.fromisoformat(data[:10])
        return data
    if field_key in INT_FIELDS:
        if data is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_NEW_VALUE",
                    "message": "Stored new value is null for an integer field; cannot apply.",
                },
            )
        return int(data)
    if field_key == "commission_value":
        if data is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_NEW_VALUE",
                    "message": "Stored new value is null for commission; cannot apply.",
                },
            )
        return float(data)
    return data


async def _log_cr_event(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    action: str,
    details: dict[str, Any],
) -> None:
    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        severity="INFO",
        resource="commercial_change_request",
        details_json=details,
        request_id=get_master_data_ai_request_id(),
        prompt_category="commercial_change_control",
    )


async def create_change_request(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    entity_type: str,
    entity_id: int,
    field_key: str,
    new_value: Any,
    reason: str,
    source: str = "manual",
    source_ref: str | None = None,
) -> CommercialChangeRequest:
    et = entity_type.strip().lower()
    fk = field_key.strip()

    if fk in NUMERIC_NEW_VALUE_REQUIRED and new_value is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_NEW_VALUE",
                "message": f"Field {fk} does not accept null as the proposed value.",
            },
        )

    if et == "order":
        row = await db.get(Order, entity_id)
        if not row or row.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        if not is_order_commercial_locked(row.status):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "CHANGE_REQUEST_NOT_REQUIRED",
                    "message": "Order is not in a commercially locked status; edit the order directly.",
                },
            )
        if not is_protected_order_field(fk):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "FIELD_NOT_PROTECTED", "message": f"Field {fk} is not under change-control."},
            )
        old_snap = snapshot_order_field(row, fk)
    elif et == "quotation":
        row = await db.get(Quotation, entity_id)
        if not row or row.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
        if not is_quotation_commercial_locked(row.status):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "CHANGE_REQUEST_NOT_REQUIRED",
                    "message": "Quotation is not locked; edit the quotation directly.",
                },
            )
        if not is_protected_quotation_field(fk):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "FIELD_NOT_PROTECTED", "message": f"Field {fk} is not under change-control."},
            )
        old_snap = snapshot_quotation_field(row, fk)
    else:
        raise HTTPException(status_code=400, detail="Invalid entity_type")

    new_snap = _serialize_value(new_value)
    if new_snap == old_snap:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_OP", "message": "New value matches current value."},
        )

    cr = CommercialChangeRequest(
        tenant_id=tenant_id,
        entity_type=et,
        entity_id=entity_id,
        field_key=fk,
        old_value=old_snap,
        new_value=new_snap,
        reason=reason.strip(),
        source=source,
        source_ref=source_ref,
        status="pending_approval",
        proposed_by=user.id,
        proposed_at=datetime.utcnow(),
        request_id=get_master_data_ai_request_id(),
    )
    db.add(cr)
    await db.flush()

    await _log_cr_event(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="COMMERCIAL_CHANGE_PROPOSED",
        details={
            "change_request_id": cr.id,
            "entity_type": et,
            "entity_id": entity_id,
            "field_key": fk,
            "old_value": old_snap,
            "new_value": new_snap,
        },
    )
    return cr


async def get_change_request(
    db: AsyncSession, *, tenant_id: int, cr_id: int
) -> CommercialChangeRequest | None:
    row = await db.get(CommercialChangeRequest, cr_id)
    if not row or row.tenant_id != tenant_id:
        return None
    return row


async def list_change_requests(
    db: AsyncSession,
    *,
    tenant_id: int,
    entity_type: str | None,
    entity_id: int | None,
    status_filter: str | None,
    limit: int = 50,
    offset: int = 0,
) -> list[CommercialChangeRequest]:
    stmt = select(CommercialChangeRequest).where(CommercialChangeRequest.tenant_id == tenant_id)
    if entity_type:
        stmt = stmt.where(CommercialChangeRequest.entity_type == entity_type.strip().lower())
    if entity_id is not None:
        stmt = stmt.where(CommercialChangeRequest.entity_id == entity_id)
    if status_filter:
        stmt = stmt.where(CommercialChangeRequest.status == status_filter)
    stmt = stmt.order_by(CommercialChangeRequest.proposed_at.desc()).limit(limit).offset(offset)
    r = await db.execute(stmt)
    return list(r.scalars().all())


async def pending_counts_for_orders(
    db: AsyncSession, *, tenant_id: int, order_ids: list[int]
) -> dict[int, int]:
    if not order_ids:
        return {}
    r = await db.execute(
        select(CommercialChangeRequest.entity_id, func.count())
        .where(
            CommercialChangeRequest.tenant_id == tenant_id,
            CommercialChangeRequest.entity_type == "order",
            CommercialChangeRequest.status == "pending_approval",
            CommercialChangeRequest.entity_id.in_(order_ids),
        )
        .group_by(CommercialChangeRequest.entity_id)
    )
    return {int(row[0]): int(row[1]) for row in r.all()}


async def count_pending_approvals(db: AsyncSession, *, tenant_id: int) -> int:
    r = await db.execute(
        select(func.count())
        .select_from(CommercialChangeRequest)
        .where(
            CommercialChangeRequest.tenant_id == tenant_id,
            CommercialChangeRequest.status == "pending_approval",
        )
    )
    return int(r.scalar_one() or 0)


async def approve_change_request(
    db: AsyncSession, *, tenant_id: int, user: User, cr_id: int, note: str | None
) -> CommercialChangeRequest:
    cr = await get_change_request(db, tenant_id=tenant_id, cr_id=cr_id)
    if not cr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")
    if cr.status != "pending_approval":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be approved")
    cr.status = "approved"
    cr.reviewed_by = user.id
    cr.reviewed_at = datetime.utcnow()
    cr.review_note = note
    await db.flush()
    await _log_cr_event(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="COMMERCIAL_CHANGE_APPROVED",
        details={"change_request_id": cr.id, "entity_type": cr.entity_type, "entity_id": cr.entity_id},
    )
    return cr


async def reject_change_request(
    db: AsyncSession, *, tenant_id: int, user: User, cr_id: int, note: str | None
) -> CommercialChangeRequest:
    cr = await get_change_request(db, tenant_id=tenant_id, cr_id=cr_id)
    if not cr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")
    if cr.status != "pending_approval":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be rejected")
    cr.status = "rejected"
    cr.reviewed_by = user.id
    cr.reviewed_at = datetime.utcnow()
    cr.review_note = note
    await db.flush()
    await _log_cr_event(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="COMMERCIAL_CHANGE_REJECTED",
        details={"change_request_id": cr.id},
    )
    return cr


async def cancel_change_request(
    db: AsyncSession, *, tenant_id: int, user: User, cr_id: int
) -> CommercialChangeRequest:
    cr = await get_change_request(db, tenant_id=tenant_id, cr_id=cr_id)
    if not cr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")
    if cr.status != "pending_approval":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be cancelled")
    cr.status = "cancelled"
    await db.flush()
    await _log_cr_event(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="COMMERCIAL_CHANGE_CANCELLED",
        details={"change_request_id": cr.id},
    )
    return cr


async def apply_change_request(
    db: AsyncSession, *, tenant_id: int, user: User, cr_id: int
) -> CommercialChangeRequest:
    cr = await get_change_request(db, tenant_id=tenant_id, cr_id=cr_id)
    if not cr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")
    if cr.status == "applied":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ALREADY_APPLIED", "message": "This change request was already applied."},
        )
    if cr.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only approved change requests can be applied",
        )

    fk = cr.field_key
    parsed = parse_value_for_apply(fk, cr.new_value)

    if cr.entity_type == "order":
        row = await db.get(Order, cr.entity_id)
        if not row or row.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Order not found")
        before = snapshot_order_field(row, fk)
        setattr(row, fk, parsed)
        row.updated_at = datetime.utcnow()
    elif cr.entity_type == "quotation":
        row = await db.get(Quotation, cr.entity_id)
        if not row or row.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Quotation not found")
        before = snapshot_quotation_field(row, fk)
        setattr(row, fk, parsed)
        row.updated_at = datetime.utcnow()
    else:
        raise HTTPException(status_code=400, detail="Invalid entity")

    cr.status = "applied"
    cr.applied_by = user.id
    cr.applied_at = datetime.utcnow()
    await db.flush()

    after = (
        snapshot_order_field(row, fk)
        if cr.entity_type == "order"
        else snapshot_quotation_field(row, fk)  # type: ignore[arg-type]
    )
    await _log_cr_event(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="COMMERCIAL_CHANGE_APPLIED",
        details={
            "change_request_id": cr.id,
            "entity_type": cr.entity_type,
            "entity_id": cr.entity_id,
            "field_key": fk,
            "before": before,
            "after": after,
        },
    )
    return cr


def cr_to_out(cr: CommercialChangeRequest) -> dict[str, Any]:
    return {
        "id": cr.id,
        "tenant_id": cr.tenant_id,
        "entity_type": cr.entity_type,
        "entity_id": cr.entity_id,
        "field_key": cr.field_key,
        "old_value": cr.old_value,
        "new_value": cr.new_value,
        "reason": cr.reason,
        "source": cr.source,
        "source_ref": cr.source_ref,
        "status": cr.status,
        "proposed_by": cr.proposed_by,
        "proposed_at": cr.proposed_at.isoformat() if cr.proposed_at else "",
        "reviewed_by": cr.reviewed_by,
        "reviewed_at": cr.reviewed_at.isoformat() if cr.reviewed_at else None,
        "review_note": cr.review_note,
        "applied_by": cr.applied_by,
        "applied_at": cr.applied_at.isoformat() if cr.applied_at else None,
        "request_id": cr.request_id,
    }
