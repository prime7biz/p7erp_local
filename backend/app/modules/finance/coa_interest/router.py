"""HTTP API for COA ledger interest preview / run / list."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.ownership import ensure_owned
from app.common.permissions import PERMISSION_COA_INTEREST_RUN, assert_soft_permission_allowed
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_coa_ledger_interest_v1_enabled
from app.database import get_db
from app.models import Tenant, User
from app.models.finance import ChartOfAccount
from app.modules.audit.service import log_action
from app.modules.finance.coa_interest.schemas import (
    CoaInterestAccrualOut,
    CoaInterestPreviewBody,
    CoaInterestRunBody,
    CoaInterestRunOut,
)
from app.modules.finance.coa_interest.service import (
    list_accruals,
    list_interest_enabled_accounts,
    preview_account_periods,
    run_coa_interest,
)

router = APIRouter(prefix="/coa-interest", tags=["finance-coa-interest"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


def _require_flag(tenant: Tenant) -> None:
    if not is_coa_ledger_interest_v1_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="Chart-of-accounts interest is disabled. Enable tenant feature flag coa_ledger_interest_v1.",
        )


def _accrual_out(row) -> CoaInterestAccrualOut:
    return CoaInterestAccrualOut(
        id=row.id,
        tenant_id=row.tenant_id,
        account_id=row.account_id,
        period_key=row.period_key,
        accrual_date=row.accrual_date,
        base_balance=str(row.base_balance),
        proration_factor=str(row.proration_factor),
        interest_amount=str(row.interest_amount),
        journal_voucher_id=row.journal_voucher_id,
        status=row.status,
    )


@router.post("/preview")
async def preview_interest(
    body: CoaInterestPreviewBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_COA_INTEREST_RUN)
    pairs = await list_interest_enabled_accounts(db, tenant.id)
    if body.account_id is not None:
        await ensure_owned(db, ChartOfAccount, body.account_id, tenant.id, "Ledger")
        pairs = [(a, g) for a, g in pairs if a.id == body.account_id]
        if not pairs:
            raise HTTPException(status_code=404, detail="Interest is not enabled on this ledger")
    rows: list[dict] = []
    for account, group in pairs:
        rows.extend(
            await preview_account_periods(
                db, tenant_id=tenant.id, account=account, group=group, as_of=body.as_of
            )
        )
    return {"as_of": (body.as_of.isoformat() if body.as_of else None), "periods": rows}


@router.post("/run", response_model=CoaInterestRunOut)
async def run_interest(
    body: CoaInterestRunBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_COA_INTEREST_RUN)
    if body.account_id is not None:
        await ensure_owned(db, ChartOfAccount, body.account_id, tenant.id, "Ledger")
    result = await run_coa_interest(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        as_of=body.as_of,
        account_id=body.account_id,
    )
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="COA_INTEREST_RUN",
        resource="coa_interest",
        details=f"created={result['created']} skipped={result['skipped']} as_of={result['as_of']}",
    )
    await db.commit()
    return result


@router.get("/accruals", response_model=list[CoaInterestAccrualOut])
async def get_accruals(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    account_id: int | None = Query(default=None),
    period_key: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    _ensure_tenant(user, tenant)
    _require_flag(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_COA_INTEREST_RUN)
    rows = await list_accruals(
        db,
        tenant_id=tenant.id,
        account_id=account_id,
        period_key=period_key,
        limit=limit,
        offset=offset,
    )
    return [_accrual_out(r) for r in rows]
