"""Statements API + classification setup. Mounted inside the finance router (prefix /finance, finance.access).

Reports: GET /finance/statements/{trial-balance,balance-sheet,profit-loss}
  - tenant flag `finance_statements_v2` must be exactly true (otherwise 404);
  - soft permission `finance.mis_report.view` (explicit false -> 403), same as the MIS reports.
Setup: statement class of an account group, stock nature of a stock group (manager / admin only, audited).
"""

from __future__ import annotations

import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.business_date import today_local
from app.common.permissions import PERMISSION_MIS_REPORT_VIEW, assert_soft_permission_allowed, require_internal_permission
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_finance_statements_v2_enabled
from app.database import get_db
from app.models import Tenant, User
from app.models.finance import AccountGroup
from app.models.inventory import StockGroup
from app.modules.audit.service import log_action
from app.modules.finance.fiscal_year import fiscal_year_bounds, fy_start_month
from app.modules.finance.statements.balance_sheet_service import build_balance_sheet
from app.modules.finance.statements.classification_service import (
    count_ledgers_in_groups,
    descendants_inheriting_from,
    load_group_classification,
)
from app.modules.finance.statements.constants import MAX_GROUP_DEPTH, STATEMENT_CLASS_SET
from app.modules.finance.statements.profit_loss_service import build_profit_loss
from app.modules.finance.statements.schemas import (
    AffectedGroup,
    BalanceSheetResponse,
    ProfitLossResponse,
    StatementClassState,
    StatementClassUpdate,
    StockNatureState,
    StockNatureUpdate,
    TrialBalanceResponse,
)
from app.modules.finance.statements.trial_balance_service import build_trial_balance

router = APIRouter(tags=["finance-statements"])

_MANAGER_ROLES = {"admin", "manager", "super_admin", "superadmin", "owner"}
_MAX_PREVIEW_GROUPS = 200


# ---- shared gates --------------------------------------------------------------------------------------
async def _report_gate(db: AsyncSession, tenant: Tenant, user: User) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    if not is_finance_statements_v2_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Not found")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_MIS_REPORT_VIEW)


async def _setup_gate(db: AsyncSession, tenant: Tenant, user: User, *, write: bool) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    if write:
        # Same manager / admin gate the finance router uses for sensitive setup changes (never looser).
        role = await get_user_role_scoped_to_tenant(db, user, tenant.id)
        if (role.name if role else "").strip().lower() not in _MANAGER_ROLES:
            raise HTTPException(status_code=403, detail="Only manager/admin can perform this action")


def _fiscal_range(
    tenant: Tenant, from_date: date | None, to_date: date | None, fiscal_year: int | None
) -> tuple[date, date]:
    start_month = fy_start_month(tenant.feature_flags)
    if fiscal_year is not None:
        if from_date is not None or to_date is not None:
            raise HTTPException(status_code=422, detail="Use either fiscal_year or from_date/to_date, not both")
        return fiscal_year_bounds(date(fiscal_year, start_month, 1), start_month)
    today = today_local(tenant)
    if from_date is None and to_date is None:
        from_date, to_date = fiscal_year_bounds(today, start_month)[0], today
    elif to_date is None:
        to_date = today
    elif from_date is None:
        from_date = fiscal_year_bounds(to_date, start_month)[0]
    if from_date > to_date:
        raise HTTPException(status_code=422, detail="from_date must be on or before to_date")
    return from_date, to_date


# ---- reports -------------------------------------------------------------------------------------------
@router.get("/statements/trial-balance", response_model=TrialBalanceResponse)
async def trial_balance(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    fiscal_year: int | None = Query(default=None, ge=1900, le=9990),
    include_zero: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _report_gate(db, tenant, user)
    start, end = _fiscal_range(tenant, from_date, to_date, fiscal_year)
    return await build_trial_balance(db, tenant, from_date=start, to_date=end, include_zero=include_zero)


@router.get("/statements/balance-sheet", response_model=BalanceSheetResponse)
async def balance_sheet(
    as_of_date: date | None = Query(default=None),
    fiscal_year: int | None = Query(default=None, ge=1900, le=9990),
    include_zero: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _report_gate(db, tenant, user)
    if fiscal_year is not None and as_of_date is not None:
        raise HTTPException(status_code=422, detail="Use either fiscal_year or as_of_date, not both")
    if fiscal_year is not None:
        as_of_date = fiscal_year_bounds(date(fiscal_year, fy_start_month(tenant.feature_flags), 1), fy_start_month(tenant.feature_flags))[1]
    return await build_balance_sheet(db, tenant, as_of_date=as_of_date or today_local(tenant), include_zero=include_zero)


@router.get("/statements/profit-loss", response_model=ProfitLossResponse)
async def profit_loss(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    fiscal_year: int | None = Query(default=None, ge=1900, le=9990),
    include_zero: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _report_gate(db, tenant, user)
    start, end = _fiscal_range(tenant, from_date, to_date, fiscal_year)
    return await build_profit_loss(db, tenant, from_date=start, to_date=end, include_zero=include_zero)


# ---- setup: account group statement class --------------------------------------------------------------
async def _statement_class_state(
    db: AsyncSession, tenant_id: int, group_id: int, proposed: str | None
) -> StatementClassState:
    groups = await load_group_classification(db, tenant_id)
    info = groups.get(group_id)
    if info is None:
        raise HTTPException(status_code=404, detail="Account group not found")
    state = StatementClassState(
        group_id=info.id,
        name=info.name,
        parent_group_id=info.parent_id,
        statement_class=info.explicit_class,
        effective_class=info.effective_class,
        inherited_from_group_id=info.source_group_id if info.explicit_class is None else None,
        proposed_class=proposed,
    )
    # Preview: this group and the descendants that inherit from it (cycle-safe walk).
    affected_ids = descendants_inheriting_from(groups, group_id)
    state.affected_group_count = len(affected_ids)
    state.affected_ledger_count = await count_ledgers_in_groups(db, tenant_id, affected_ids)
    state.affected_groups = [
        AffectedGroup(id=gid, name=groups[gid].name, current_effective_class=groups[gid].effective_class)
        for gid in affected_ids[:_MAX_PREVIEW_GROUPS]
    ]
    return state


@router.get("/account-groups/{group_id}/statement-class", response_model=StatementClassState)
async def get_account_group_statement_class(
    group_id: int,
    proposed: str | None = Query(default=None, description="Preview the effect of setting this class"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _setup_gate(db, tenant, user, write=False)
    if proposed is not None and proposed not in STATEMENT_CLASS_SET:
        raise HTTPException(status_code=422, detail="proposed is not an allowed statement class")
    return await _statement_class_state(db, tenant.id, group_id, proposed)


@router.put("/account-groups/{group_id}/statement-class", response_model=StatementClassState)
async def set_account_group_statement_class(
    group_id: int,
    body: StatementClassUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _setup_gate(db, tenant, user, write=True)
    row = (
        await db.execute(
            select(AccountGroup).where(AccountGroup.id == group_id, AccountGroup.tenant_id == tenant.id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Account group not found")
    previous = row.statement_class
    if previous != body.statement_class:
        row.statement_class = body.statement_class
        await log_action(
            db,
            tenant.id,
            "finance.account_group.statement_class.update",
            user_id=user.id,
            resource=f"account_group:{row.id}",
            details=json.dumps({"from": previous, "to": body.statement_class, "group": row.name}),
        )
        await db.commit()
    return await _statement_class_state(db, tenant.id, group_id, None)


# ---- setup: stock group nature -------------------------------------------------------------------------
async def _stock_nature_state(db: AsyncSession, tenant_id: int, group_id: int) -> StockNatureState:
    rows = (
        await db.execute(
            select(StockGroup.id, StockGroup.name, StockGroup.parent_id, StockGroup.stock_nature).where(
                StockGroup.tenant_id == tenant_id
            )
        )
    ).all()
    by_id = {r[0]: r for r in rows}
    if group_id not in by_id:
        raise HTTPException(status_code=404, detail="Stock group not found")
    _id, name, parent_id, nature = by_id[group_id]
    effective, source = nature, (group_id if nature else None)
    seen = {group_id}
    cur = parent_id
    while effective is None and cur is not None and cur not in seen and len(seen) <= MAX_GROUP_DEPTH:
        seen.add(cur)
        row = by_id.get(cur)
        if row is None:
            break
        if row[3]:
            effective, source = row[3], cur
        cur = row[2]
    return StockNatureState(
        group_id=group_id,
        name=name,
        parent_id=parent_id,
        stock_nature=nature,
        effective_nature=effective,
        inherited_from_group_id=source if nature is None else None,
    )


@router.get(
    "/stock-groups/{group_id}/stock-nature",
    response_model=StockNatureState,
    dependencies=[Depends(require_internal_permission("inventory.access"))],
)
async def get_stock_group_nature(
    group_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _setup_gate(db, tenant, user, write=False)
    return await _stock_nature_state(db, tenant.id, group_id)


@router.put(
    "/stock-groups/{group_id}/stock-nature",
    response_model=StockNatureState,
    dependencies=[Depends(require_internal_permission("inventory.access"))],
)
async def set_stock_group_nature(
    group_id: int,
    body: StockNatureUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _setup_gate(db, tenant, user, write=True)
    row = (
        await db.execute(select(StockGroup).where(StockGroup.id == group_id, StockGroup.tenant_id == tenant.id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Stock group not found")
    previous = row.stock_nature
    if previous != body.stock_nature:
        row.stock_nature = body.stock_nature
        await log_action(
            db,
            tenant.id,
            "inventory.stock_group.stock_nature.update",
            user_id=user.id,
            resource=f"stock_group:{row.id}",
            details=json.dumps({"from": previous, "to": body.stock_nature, "group": row.name}),
        )
        await db.commit()
    return await _stock_nature_state(db, tenant.id, group_id)
