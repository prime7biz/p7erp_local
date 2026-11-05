"""Exception reports API (roadmap item 4, docs/erp-benchmark/P7_GAP_AND_ROADMAP.md).

GET /api/v1/finance/exceptions/summary              counts for every check
GET /api/v1/finance/exceptions/grn-not-billed        paginated
GET /api/v1/finance/exceptions/challan-not-invoiced  paginated
GET /api/v1/finance/exceptions/negative-cash-bank
GET /api/v1/finance/exceptions/negative-stock
GET /api/v1/finance/exceptions/overdue-bills
"""

from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.modules.finance import exception_reports_service as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance/exceptions", tags=["finance-exceptions"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


@router.get("/summary")
async def exceptions_summary(
    as_of_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Counts per check. A failing check reports `null` instead of breaking the whole summary."""
    _ensure_tenant(user, tenant)
    as_of = as_of_date or date.today()
    counts: dict[str, int | None] = {}

    async def run(key: str, coro):
        try:
            counts[key] = await coro
        except Exception:
            logger.exception("exception_report_failed check=%s tenant=%s", key, tenant.id)
            await safe_async_session_rollback(db)
            counts[key] = None

    async def _count_paged(fn):
        _rows, total = await fn(db, tenant.id, limit=1, offset=0)
        return total

    await run("grn_not_billed", _count_paged(svc.grn_not_billed))
    await run("challan_not_invoiced", _count_paged(svc.challan_not_invoiced))

    async def _neg_cash():
        return len(await svc.negative_cash_bank(db, tenant.id, as_of=as_of))

    async def _neg_stock():
        return len(await svc.negative_stock(db, tenant.id, limit=MAX_PAGE_SIZE))

    async def _overdue():
        return len(await svc.overdue_bills(db, tenant.id, as_of=as_of, limit=MAX_PAGE_SIZE))

    await run("negative_cash_bank", _neg_cash())
    await run("negative_stock", _neg_stock())
    await run("overdue_bills", _overdue())
    return {"as_of_date": as_of.isoformat(), "counts": counts}


@router.get("/grn-not-billed")
async def grn_not_billed(
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows, total = await svc.grn_not_billed(db, tenant.id, limit=limit, offset=offset)
    return {"rows": rows, "total": total}


@router.get("/challan-not-invoiced")
async def challan_not_invoiced(
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows, total = await svc.challan_not_invoiced(db, tenant.id, limit=limit, offset=offset)
    return {"rows": rows, "total": total}


@router.get("/negative-cash-bank")
async def negative_cash_bank(
    as_of_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    as_of = as_of_date or date.today()
    rows = await svc.negative_cash_bank(db, tenant.id, as_of=as_of)
    return {"as_of_date": as_of.isoformat(), "rows": rows, "total": len(rows)}


@router.get("/negative-stock")
async def negative_stock(
    limit: int = Query(default=200, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = await svc.negative_stock(db, tenant.id, limit=limit)
    return {"rows": rows, "total": len(rows)}


@router.get("/overdue-bills")
async def overdue_bills(
    as_of_date: date | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    as_of = as_of_date or date.today()
    rows = await svc.overdue_bills(db, tenant.id, as_of=as_of, limit=limit)
    return {"as_of_date": as_of.isoformat(), "rows": rows, "total": len(rows)}
