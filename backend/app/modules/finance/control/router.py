"""Control Tower + GL profitability API. Mounted inside the finance router (prefix /finance, finance.access).

  GET /finance/control-tower?as_of_date=&severity=all|high|medium|low
  GET /finance/control-tower/exceptions/{code}?as_of_date=&limit=&offset=
  GET /finance/profitability/orders?from_date=&to_date=&limit=&offset=&sort=
  GET /finance/profitability/orders/{order_id}|styles/{style_id}|master-contracts/{id}|buyers/{buyer_id}?from_date=&to_date=

All read-only. Tenant flag `finance_control_tower_v2` must be exactly true (otherwise 404); soft permission
`finance.mis_report.view` (explicit false -> 403). Another tenant's record looks like "not found" (404).
The older quotation-only `/finance/profitability/{style,lc,variance}` routes are untouched.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.common.permissions import PERMISSION_MIS_REPORT_VIEW, assert_soft_permission_allowed
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_finance_control_tower_v2_enabled
from app.database import get_db
from app.models import Tenant, User
from app.modules.finance.control.constants import SORT_FIELDS
from app.modules.finance.control.control_tower_service import build_control_tower, build_exception_list
from app.modules.finance.control.profitability_service import build_entity_profit, list_order_profit
from app.modules.finance.control.schemas import (
    ControlTowerResponse,
    ExceptionListResponse,
    OrderProfitListResponse,
    ProfitabilityResponse,
)

router = APIRouter(tags=["finance-control-tower"])

_SORT_PATTERN = r"^-?(" + "|".join(SORT_FIELDS) + r")$"


async def _gate(db: AsyncSession, tenant: Tenant, user: User) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    if not is_finance_control_tower_v2_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Not found")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_MIS_REPORT_VIEW)


def _period(from_date: date | None, to_date: date | None) -> None:
    if from_date is not None and to_date is not None and from_date > to_date:
        raise HTTPException(status_code=422, detail="from_date must be on or before to_date")


# ---- control tower -------------------------------------------------------------------------------------------
@router.get("/control-tower", response_model=ControlTowerResponse)
async def control_tower(
    as_of_date: date | None = Query(default=None),
    severity: Literal["all", "high", "medium", "low"] = Query(default="all"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _gate(db, tenant, user)
    try:
        return await build_control_tower(db, tenant, as_of=as_of_date or today_local(tenant), severity=severity)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


@router.get("/control-tower/exceptions/{code}", response_model=ExceptionListResponse)
async def control_tower_exceptions(
    code: str,
    as_of_date: date | None = Query(default=None),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _gate(db, tenant, user)
    try:
        return await build_exception_list(
            db, tenant, code=code.upper(), as_of=as_of_date or today_local(tenant), limit=limit, offset=offset
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown exception code") from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


# ---- profitability -----------------------------------------------------------------------------------------------
@router.get("/profitability/orders", response_model=OrderProfitListResponse)
async def profitability_order_list(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    sort: str = Query(default="order_code", pattern=_SORT_PATTERN),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _gate(db, tenant, user)
    _period(from_date, to_date)
    return await list_order_profit(
        db, tenant, from_date=from_date, to_date=to_date, limit=limit, offset=offset, sort=sort
    )


async def _entity(
    kind: str, entity_id: int, from_date: date | None, to_date: date | None, tenant: Tenant, user: User, db: AsyncSession
) -> ProfitabilityResponse:
    await _gate(db, tenant, user)
    _period(from_date, to_date)
    try:
        return await build_entity_profit(
            db, tenant, kind=kind, entity_id=entity_id, from_date=from_date, to_date=to_date
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None


@router.get("/profitability/orders/{order_id}", response_model=ProfitabilityResponse)
async def profitability_order(
    order_id: int,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _entity("order", order_id, from_date, to_date, tenant, user, db)


@router.get("/profitability/styles/{style_id}", response_model=ProfitabilityResponse)
async def profitability_style(
    style_id: int,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _entity("style", style_id, from_date, to_date, tenant, user, db)


@router.get("/profitability/master-contracts/{contract_id}", response_model=ProfitabilityResponse)
async def profitability_master_contract(
    contract_id: int,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _entity("master_contract", contract_id, from_date, to_date, tenant, user, db)


@router.get("/profitability/buyers/{buyer_id}", response_model=ProfitabilityResponse)
async def profitability_buyer(
    buyer_id: int,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _entity("buyer", buyer_id, from_date, to_date, tenant, user, db)
