"""Voucher entry assistant API (read-only hints for the voucher form).

POST /api/v1/finance/voucher-entry-assist             ledger insight, usual accounts, narrations, warnings
POST /api/v1/finance/voucher-entry-assist/narration   one-line narration (tenant AI, template fallback)

Tenant flag `voucher_entry_assist_enabled` (default ON; explicit false turns it off).
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import require_internal_permission
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_voucher_entry_assist_enabled
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.modules.finance import voucher_entry_assist_service as svc

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/finance/voucher-entry-assist",
    tags=["finance-voucher-entry-assist"],
    dependencies=[Depends(require_internal_permission("finance.access"))],
)


class AssistLine(BaseModel):
    account_id: int = Field(default=0, ge=0)
    entry_type: Literal["DEBIT", "CREDIT"] = "DEBIT"
    amount: str | None = "0"
    notes: str | None = Field(default=None, max_length=500)


class AssistBody(BaseModel):
    voucher_type: str = Field(default="JOURNAL", max_length=32)
    voucher_date: date
    reference: str | None = Field(default=None, max_length=64)
    exclude_voucher_id: int | None = None
    lines: list[AssistLine] = Field(default_factory=list, max_length=200)


def _guard(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    if not is_voucher_entry_assist_enabled(tenant.feature_flags):
        raise HTTPException(status_code=403, detail="Voucher entry assistant is turned off for this company")


def _draft_lines(body: AssistBody) -> list[svc.DraftLine]:
    return [
        svc.DraftLine(
            account_id=ln.account_id,
            entry_type=ln.entry_type,
            amount=max(svc.to_decimal(ln.amount), Decimal("0")),
            notes=ln.notes,
        )
        for ln in body.lines
    ]


@router.post("")
async def voucher_entry_assist(
    body: AssistBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    try:
        return await svc.build_entry_assist(
            db,
            tenant,
            voucher_type=body.voucher_type,
            voucher_date=body.voucher_date,
            reference=body.reference,
            lines=_draft_lines(body),
            exclude_voucher_id=body.exclude_voucher_id,
        )
    except Exception:
        logger.exception("voucher_entry_assist_failed tenant=%s", tenant.id)
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=503, detail="Entry assistant is temporarily unavailable") from None


@router.post("/narration")
async def voucher_entry_narration(
    body: AssistBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    try:
        return await svc.suggest_narration(
            db,
            tenant,
            user.id,
            voucher_type=body.voucher_type,
            voucher_date=body.voucher_date,
            reference=body.reference,
            lines=_draft_lines(body),
        )
    except Exception:
        logger.exception("voucher_entry_narration_failed tenant=%s", tenant.id)
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=503, detail="Narration suggestion is temporarily unavailable") from None
