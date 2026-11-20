"""Purchase order Class 1 ratification when ``user_authority_classes_v1`` is ON.

Flag OFF: callers skip this module (legacy status transitions only).
Approve (status APPROVED) = operational "post"; Class 1 then ratifies
(PENDING_CLASS1 → APPROVED / REJECTED). Reject → CANCELLED.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.constants import (
    CLASS1_APPROVAL_APPROVED,
    CLASS1_APPROVAL_PENDING,
    CLASS1_APPROVAL_REJECTED,
)
from app.common.authority.policy import (
    is_authority_classes_enabled_for_tenant,
    is_class1_for_module,
    load_user_module_codes,
    user_has_module,
)
from app.models import User
from app.models.inventory import PurchaseOrder

INVENTORY_MODULE = "inventory"


async def _require_inventory_module(db: AsyncSession, user: User) -> None:
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return
    modules = await load_user_module_codes(db, tenant_id=user.tenant_id, user_id=user.id)
    if not user_has_module(modules, INVENTORY_MODULE):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inventory module is required for this purchase order action",
        )


async def on_purchase_order_approved(
    db: AsyncSession,
    *,
    user: User,
    row: PurchaseOrder,
    feature_flags: Any,
    when: datetime,
) -> None:
    """After status becomes APPROVED: always queue Class 1 (four-eyes; Super Admin may later self-ratify)."""
    del when  # reserved for future auto-approve audit timestamps
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return
    await _require_inventory_module(db, user)
    if getattr(row, "class1_approval_status", None) == CLASS1_APPROVAL_APPROVED:
        return
    row.class1_approval_status = CLASS1_APPROVAL_PENDING
    row.class1_approved_by = None
    row.class1_approved_at = None


async def assert_can_class1_ratify_purchase_order(
    db: AsyncSession,
    *,
    user: User,
    row: PurchaseOrder,
    feature_flags: Any,
) -> None:
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    if not await is_class1_for_module(db, user, INVENTORY_MODULE, feature_flags=feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Class 1 (with Inventory) or Super Admin can ratify purchase orders",
        )
    if not bool(getattr(user, "is_tenant_super_admin", False)):
        blocked_ids = {
            i
            for i in (getattr(row, "created_by_user_id", None), getattr(row, "approved_by_user_id", None))
            if i is not None
        }
        if user.id in blocked_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Separation of duties: you cannot ratify a purchase order you created or approved",
            )
    if getattr(row, "class1_approval_status", None) != CLASS1_APPROVAL_PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Purchase order is not waiting for Class 1 approval",
        )
    if (row.status or "").strip().upper() != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only approved purchase orders can be Class 1 ratified",
        )


def apply_class1_approve_purchase_order(row: PurchaseOrder, *, user_id: int, when: datetime) -> None:
    row.class1_approval_status = CLASS1_APPROVAL_APPROVED
    row.class1_approved_by = user_id
    row.class1_approved_at = when


def apply_class1_reject_purchase_order(row: PurchaseOrder, *, user_id: int, when: datetime) -> None:
    """Reject ratification and cancel the PO (audit-ready cancel)."""
    row.class1_approval_status = CLASS1_APPROVAL_REJECTED
    row.class1_approved_by = user_id
    row.class1_approved_at = when
    row.status = "CANCELLED"
