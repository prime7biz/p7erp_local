"""Gate Pass / Delivery Challan Class 3/4 → Class 2 recommend → Class 1 approve.

Active only when BOTH ``user_authority_classes_v1`` AND ``material_conversion_v1`` are ON.
Flag OFF → no-op / 404 so legacy role flows stay unchanged.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.constants import (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
    AUTHORITY_SUPER,
)
from app.common.authority.policy import (
    is_authority_classes_enabled_for_tenant,
    load_user_module_codes,
    user_has_module,
)
from app.common.tenant_feature_keys import is_material_conversion_v1_enabled
from app.models import User

INVENTORY_MODULE = "inventory"

STATUS_ENTERED = "ENTERED"
STATUS_RECOMMENDED = "RECOMMENDED"
STATUS_APPROVED = "APPROVED"
STATUS_REJECTED = "REJECTED"


class _ChainDoc(Protocol):
    created_by_user_id: int | None
    recommended_by_user_id: int | None
    recommended_at: datetime | None
    class_approval_status: str | None


def _norm_class(user: User) -> str | None:
    raw = getattr(user, "authority_class", None)
    if raw is None:
        return None
    text = str(raw).strip().upper()
    return text or None


def chain_enabled(feature_flags: Any) -> bool:
    return is_authority_classes_enabled_for_tenant(feature_flags) and is_material_conversion_v1_enabled(
        feature_flags
    )


async def _require_inventory_module(db: AsyncSession, user: User) -> None:
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return
    modules = await load_user_module_codes(db, tenant_id=user.tenant_id, user_id=user.id)
    if not user_has_module(modules, INVENTORY_MODULE):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inventory module is required for this action",
        )


def mark_entered(row: _ChainDoc, *, user: User, feature_flags: Any) -> None:
    """Call on create when chain is enabled (Class 3/4 or Super/Class1 may enter)."""
    if not chain_enabled(feature_flags):
        return
    cls = _norm_class(user)
    if cls not in {
        AUTHORITY_CLASS_3,
        AUTHORITY_CLASS_4,
        AUTHORITY_CLASS_1,
        AUTHORITY_CLASS_2,
        AUTHORITY_SUPER,
    } and not bool(getattr(user, "is_tenant_super_admin", False)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Class 3/4 (or Class 1/2/Super) with Inventory may enter gate/challan",
        )
    if getattr(row, "class_approval_status", None) is None:
        row.class_approval_status = STATUS_ENTERED


async def recommend(
    db: AsyncSession,
    *,
    user: User,
    row: _ChainDoc,
    feature_flags: Any,
    when: datetime,
) -> None:
    if not chain_enabled(feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await _require_inventory_module(db, user)
    cls = _norm_class(user)
    if not bool(getattr(user, "is_tenant_super_admin", False)) and cls not in {
        AUTHORITY_CLASS_2,
        AUTHORITY_CLASS_1,
        AUTHORITY_SUPER,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Class 2 (or Class 1/Super) can recommend",
        )
    if getattr(row, "class_approval_status", None) not in {STATUS_ENTERED, None}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document is not awaiting recommend")
    if not bool(getattr(user, "is_tenant_super_admin", False)):
        if user.id == getattr(row, "created_by_user_id", None):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Separation of duties: creator cannot recommend",
            )
    row.recommended_by_user_id = user.id
    row.recommended_at = when
    row.class_approval_status = STATUS_RECOMMENDED


async def approve(
    db: AsyncSession,
    *,
    user: User,
    row: _ChainDoc,
    feature_flags: Any,
    when: datetime,
) -> None:
    if not chain_enabled(feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await _require_inventory_module(db, user)
    cls = _norm_class(user)
    if not bool(getattr(user, "is_tenant_super_admin", False)) and cls not in {
        AUTHORITY_CLASS_1,
        AUTHORITY_SUPER,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Class 1 or Super Admin can approve",
        )
    if getattr(row, "class_approval_status", None) != STATUS_RECOMMENDED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document is not recommended yet")
    if not bool(getattr(user, "is_tenant_super_admin", False)):
        blocked = {
            i
            for i in (getattr(row, "created_by_user_id", None), getattr(row, "recommended_by_user_id", None))
            if i is not None
        }
        if user.id in blocked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Separation of duties: you cannot approve a document you created or recommended",
            )
    row.class_approval_status = STATUS_APPROVED
    # Keep legacy class1_* in sync when present (gate pass)
    if hasattr(row, "class1_approval_status"):
        row.class1_approval_status = "APPROVED"  # type: ignore[attr-defined]
        row.class1_approved_by = user.id  # type: ignore[attr-defined]
        row.class1_approved_at = when  # type: ignore[attr-defined]


def assert_release_allowed(row: _ChainDoc, *, feature_flags: Any) -> None:
    """Block release/post until Class 1 approved when chain is on."""
    if not chain_enabled(feature_flags):
        return
    if getattr(row, "class_approval_status", None) != STATUS_APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Gate/Challan requires Class 2 recommend and Class 1 approve before release",
        )
