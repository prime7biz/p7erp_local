"""Finance voucher gates when ``user_authority_classes_v1`` is ON.

Flag OFF: callers skip this module entirely (legacy manager/admin workflow).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.constants import (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
    AUTHORITY_SUPER,
    CLASS1_APPROVAL_APPROVED,
    CLASS1_APPROVAL_PENDING,
    CLASS1_APPROVAL_REJECTED,
)
from app.common.authority.policy import (
    is_authority_classes_enabled_for_tenant,
    load_user_module_codes,
    user_has_module,
)
from app.models import User
from app.models.finance import Voucher
from app.modules.finance.voucher_history import voucher_stage_signers

FINANCE_MODULE = "finance"


def _norm_class(user: User) -> str | None:
    raw = getattr(user, "authority_class", None)
    if raw is None:
        return None
    text = str(raw).strip().upper()
    return text or None


def is_past_voucher_date(voucher_date: date, today: date) -> bool:
    return voucher_date < today


async def _require_finance_module(db: AsyncSession, user: User) -> None:
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return
    modules = await load_user_module_codes(db, tenant_id=user.tenant_id, user_id=user.id)
    if not user_has_module(modules, FINANCE_MODULE):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Finance module is required for this voucher action",
        )


def _require_class(user: User, allowed: set[str]) -> None:
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return
    cls = _norm_class(user)
    if cls == AUTHORITY_SUPER:
        return
    if cls not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your authority class cannot perform this step (need {', '.join(sorted(allowed))})",
        )


def _sod_block(user_id: int, *, creator_id: int | None, stage_user_ids: set[int]) -> None:
    if creator_id is not None and user_id == creator_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Separation of duties: the creator cannot perform a later approval step",
        )
    if user_id in stage_user_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Separation of duties: you already acted on an earlier step for this voucher",
        )


@dataclass(frozen=True)
class AuthorityTransitionResult:
    """How the router should continue after authority checks."""

    skip_legacy_manager_gate: bool = True
    # When Class 2 recommends a same-day voucher, post in the same request.
    auto_post_after_recommend: bool = False
    # When Class 1 approves a past-dated voucher, post in the same request.
    auto_post_after_approve: bool = False
    # Class 1 same-day direct post (audited).
    class1_direct_post: bool = False
    # Allow RECOMMENDED → POSTED without going through APPROVED (same-day system hop).
    allow_recommend_to_post: bool = False


async def assert_authority_voucher_transition(
    db: AsyncSession,
    *,
    user: User,
    voucher: Voucher,
    next_status: str,
    today: date,
    feature_flags: Any,
) -> AuthorityTransitionResult | None:
    """Return transition hints when the flag is ON; ``None`` means use legacy gates."""
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return None
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    next_status = (next_status or "").strip().upper()
    current = (voucher.status or "").strip().upper()
    if next_status == current:
        return AuthorityTransitionResult()

    past = is_past_voucher_date(voucher.voucher_date, today)
    signers = await voucher_stage_signers(db, tenant_id=voucher.tenant_id, voucher_id=voucher.id)
    prior_ids = {uid for uid, _ in signers.values() if uid is not None}
    creator_id = voucher.created_by

    # Own-draft cancel stays allowed for the creator.
    if next_status == "CANCELLED" and current == "DRAFT" and creator_id == user.id:
        return AuthorityTransitionResult()

    await _require_finance_module(db, user)

    if next_status == "SUBMITTED":
        # Class 4 (and higher) with finance may submit; creator preferred but Class 1 may submit too.
        _require_class(
            user,
            {AUTHORITY_CLASS_1, AUTHORITY_CLASS_2, AUTHORITY_CLASS_3, AUTHORITY_CLASS_4, AUTHORITY_SUPER},
        )
        return AuthorityTransitionResult()

    if next_status == "CHECKED":
        _require_class(user, {AUTHORITY_CLASS_3, AUTHORITY_CLASS_1, AUTHORITY_SUPER})
        # Class 3 is the verify step; Class 1 may take over verify (cannot later approve same request).
        if _norm_class(user) == AUTHORITY_CLASS_3 or (
            _norm_class(user) in {AUTHORITY_CLASS_1, AUTHORITY_SUPER}
            or bool(getattr(user, "is_tenant_super_admin", False))
        ):
            _sod_block(user.id, creator_id=creator_id, stage_user_ids=prior_ids)
        return AuthorityTransitionResult()

    if next_status == "RECOMMENDED":
        _require_class(user, {AUTHORITY_CLASS_2, AUTHORITY_CLASS_1, AUTHORITY_SUPER})
        _sod_block(user.id, creator_id=creator_id, stage_user_ids=prior_ids)
        if not past:
            return AuthorityTransitionResult(auto_post_after_recommend=True, allow_recommend_to_post=True)
        return AuthorityTransitionResult()

    if next_status == "APPROVED":
        # Past / sensitive path: Class 1 before books. Same-day uses recommend→post instead.
        if not past:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Same-day vouchers post after Class 2 recommendation; Class 1 approval is after posting",
            )
        _require_class(user, {AUTHORITY_CLASS_1, AUTHORITY_SUPER})
        _sod_block(user.id, creator_id=creator_id, stage_user_ids=prior_ids)
        return AuthorityTransitionResult(auto_post_after_approve=True)

    if next_status == "POSTED":
        if past:
            # Must already be APPROVED by Class 1 (or this call is the auto-post after approve).
            if current not in {"APPROVED", "RECOMMENDED"}:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Past-dated vouchers need Class 1 approval before posting",
                )
            if current == "RECOMMENDED":
                # Only internal auto-post from APPROVED path should reach POSTED; block manual skip.
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Past-dated vouchers need Class 1 approval (APPROVED) before posting",
                )
            _require_class(user, {AUTHORITY_CLASS_1, AUTHORITY_SUPER})
            return AuthorityTransitionResult()
        # Same-day: Class 1 direct post from any pre-post status, or system hop after recommend.
        if current == "RECOMMENDED":
            # System / Class 2 completed recommend; posting hop allowed for Class 2 actor or Class 1.
            _require_class(user, {AUTHORITY_CLASS_2, AUTHORITY_CLASS_1, AUTHORITY_SUPER})
            return AuthorityTransitionResult(allow_recommend_to_post=True)
        # Class 1 normal same-day direct
        _require_class(user, {AUTHORITY_CLASS_1, AUTHORITY_SUPER})
        return AuthorityTransitionResult(class1_direct_post=True)

    if next_status == "REJECTED":
        _require_class(user, {AUTHORITY_CLASS_1, AUTHORITY_CLASS_2, AUTHORITY_CLASS_3, AUTHORITY_SUPER})
        return AuthorityTransitionResult()

    if next_status == "CANCELLED":
        _require_class(user, {AUTHORITY_CLASS_1, AUTHORITY_SUPER})
        return AuthorityTransitionResult()

    if next_status == "DRAFT":
        # Return to draft after reject
        _require_class(
            user,
            {AUTHORITY_CLASS_1, AUTHORITY_CLASS_2, AUTHORITY_CLASS_3, AUTHORITY_CLASS_4, AUTHORITY_SUPER},
        )
        return AuthorityTransitionResult()

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported status {next_status}")


def mark_pending_class1_on_post(voucher: Voucher, *, feature_flags: Any) -> None:
    """Only entries posted while the flag is ON enter the Class 1 queue (existing NULL stay out)."""
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return
    if getattr(voucher, "class1_approval_status", None):
        return
    voucher.class1_approval_status = CLASS1_APPROVAL_PENDING


def mark_class1_approved_on_past_post(voucher: Voucher, *, user_id: int, when: datetime) -> None:
    """Past-dated path: Class 1 already approved before books — mark audit-ready immediately."""
    voucher.class1_approval_status = CLASS1_APPROVAL_APPROVED
    voucher.class1_approved_by = user_id
    voucher.class1_approved_at = when


async def assert_can_class1_ratify(
    db: AsyncSession,
    *,
    user: User,
    voucher: Voucher,
    feature_flags: Any,
) -> None:
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    # Posted originals stay POSTED until reverse; reversed rows are not in the Class 1 queue.
    if (voucher.status or "").upper() != "POSTED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only posted vouchers need Class 1 ratification")
    if getattr(voucher, "class1_approval_status", None) != CLASS1_APPROVAL_PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Voucher is not pending Class 1 approval")
    await _require_finance_module(db, user)
    _require_class(user, {AUTHORITY_CLASS_1, AUTHORITY_SUPER})
    if voucher.created_by is not None and voucher.created_by == user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A different Class 1 user must approve your own posted entry",
        )
    # SoD: anyone who already checked / recommended / approved / posted cannot also ratify.
    signers = await voucher_stage_signers(db, tenant_id=voucher.tenant_id, voucher_id=voucher.id)
    prior_ids = {uid for uid, _ in signers.values() if uid is not None}
    if user.id in prior_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Separation of duties: you already acted on an earlier step for this voucher",
        )


def apply_class1_approve(voucher: Voucher, *, user_id: int, when: datetime) -> None:
    voucher.class1_approval_status = CLASS1_APPROVAL_APPROVED
    voucher.class1_approved_by = user_id
    voucher.class1_approved_at = when


def apply_class1_reject_mark(voucher: Voucher, *, user_id: int, when: datetime) -> None:
    voucher.class1_approval_status = CLASS1_APPROVAL_REJECTED
    voucher.class1_approved_by = user_id
    voucher.class1_approved_at = when
