"""Party ledger (bill-wise AR/AP) HTTP API — Sprint 1."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_PARTY_LEDGER_AGING,
    PERMISSION_PARTY_LEDGER_ALLOCATE,
    PERMISSION_PARTY_LEDGER_CREATE,
    PERMISSION_PARTY_LEDGER_DELETE,
    PERMISSION_PARTY_LEDGER_EDIT,
    PERMISSION_PARTY_LEDGER_INTEREST,
    PERMISSION_PARTY_LEDGER_STATEMENT,
    PERMISSION_PARTY_LEDGER_VIEW,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_party_ledger_enabled
from app.database import get_db
from app.models import Tenant, User
from app.models.finance import ChartOfAccount, Voucher
from app.models.party_ledger import PartyLedger, PartyLedgerBill, PartyLedgerBillAllocation
from app.modules.finance.party_ledger_bill_service import (
    allocate_to_bill,
    allocation_out,
    auto_allocate_payment,
    bill_out,
    calculate_bill_interest,
    mark_overdue_bills,
)
from app.modules.finance.party_ledger_hooks import daily_party_ledger_maintenance
from app.modules.finance.party_ledger_service import (
    _d,
    _money,
    get_bill_summaries,
    get_or_create_party_ledger,
    get_overdue_amounts,
    get_party_aging_report,
    get_party_ledger_statement,
    get_party_names,
    list_party_ledgers,
)

router = APIRouter(prefix="/finance/party-ledgers", tags=["finance-party-ledgers"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


def _require_party_ledger_flag(tenant: Tenant) -> None:
    if not is_party_ledger_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="Party ledger is disabled. Enable tenant feature flag party_ledger_enabled.",
        )


class PartyLedgerCreateBody(BaseModel):
    party_type: Literal["CUSTOMER", "VENDOR"]
    customer_id: int | None = None
    vendor_id: int | None = None
    ledger_account_id: int | None = None
    credit_limit: Decimal | None = None
    credit_days: int = 30
    interest_rate_monthly: Decimal | None = None
    opening_balance: Decimal = Decimal("0")
    opening_balance_type: Literal["DR", "CR"] = "DR"
    opening_balance_date: date | None = None
    bill_wise_tracking: bool = True


class PartyLedgerUpdateBody(BaseModel):
    credit_limit: Decimal | None = None
    credit_days: int | None = None
    interest_rate_monthly: Decimal | None = None
    is_active: bool | None = None
    bill_wise_tracking: bool | None = None


class AllocateBody(BaseModel):
    voucher_id: int
    allocated_amount: Decimal
    notes: str | None = None
    allocated_date: date | None = None


class AutoAllocateBody(BaseModel):
    party_ledger_id: int
    voucher_id: int
    method: Literal["FIFO", "LIFO", "MANUAL"] = "FIFO"
    bill_ids: list[int] = Field(default_factory=list)


class MarkOverdueBody(BaseModel):
    as_of_date: date | None = None


class CalculateInterestBody(BaseModel):
    as_of_date: date | None = None


async def _party_ledgers_out(db: AsyncSession, ledgers: Sequence[PartyLedger]) -> list[dict[str, Any]]:
    """Serialize party ledgers with a fixed number of queries, however many rows there are."""
    if not ledgers:
        return []
    ledger_ids = [pl.id for pl in ledgers]
    account_rows = await db.execute(
        select(ChartOfAccount.id, ChartOfAccount.name, ChartOfAccount.account_number).where(
            ChartOfAccount.id.in_({pl.ledger_account_id for pl in ledgers})
        )
    )
    accounts = {row.id: row for row in account_rows}
    party_names = await get_party_names(db, ledgers)
    overdue_amounts = await get_overdue_amounts(db, ledger_ids)
    bill_summaries = await get_bill_summaries(db, ledger_ids)
    return [
        _party_ledger_row(
            pl,
            account=accounts.get(pl.ledger_account_id),
            party_name=party_names[pl.id],
            overdue_amount=overdue_amounts.get(pl.id, Decimal("0")),
            bill_summary=bill_summaries[pl.id],
        )
        for pl in ledgers
    ]


async def _party_ledger_out(db: AsyncSession, pl: PartyLedger) -> dict[str, Any]:
    return (await _party_ledgers_out(db, [pl]))[0]


def _party_ledger_row(
    pl: PartyLedger,
    *,
    account: Any,
    party_name: str,
    overdue_amount: Decimal,
    bill_summary: dict[str, int],
) -> dict[str, Any]:
    overdue_total = _money(overdue_amount)
    credit_limit = _d(pl.credit_limit) if pl.credit_limit is not None else None
    bal = _d(pl.current_balance)
    available = None
    if credit_limit is not None:
        used = bal if (pl.current_balance_type or "DR") == "DR" else Decimal("0")
        available = _money(credit_limit - used)

    return {
        "id": pl.id,
        "party_type": pl.party_type,
        "customer_id": pl.customer_id,
        "vendor_id": pl.vendor_id,
        "party_name": party_name,
        "ledger_account_id": pl.ledger_account_id,
        "ledger_account_name": account.name if account else None,
        "ledger_account_number": account.account_number if account else None,
        "credit_limit": str(credit_limit) if credit_limit is not None else None,
        "credit_days": pl.credit_days,
        "interest_rate_monthly": str(pl.interest_rate_monthly)
        if pl.interest_rate_monthly is not None
        else None,
        "opening_balance": str(_money(_d(pl.opening_balance))),
        "opening_balance_type": pl.opening_balance_type,
        "opening_balance_date": pl.opening_balance_date.isoformat() if pl.opening_balance_date else None,
        "current_balance": str(_money(bal)),
        "current_balance_type": pl.current_balance_type,
        "total_dr_amount": str(_money(_d(pl.total_dr_amount))),
        "total_cr_amount": str(_money(_d(pl.total_cr_amount))),
        "available_credit": str(available) if available is not None else None,
        "overdue_amount": str(overdue_total),
        "bill_wise_tracking": pl.bill_wise_tracking,
        "tds_section_id": getattr(pl, "tds_section_id", None),
        "is_active": pl.is_active,
        "bill_summary": bill_summary,
        "created_at": pl.created_at.isoformat() if pl.created_at else None,
        "updated_at": pl.updated_at.isoformat() if pl.updated_at else None,
    }


@router.get("/aging-report")
async def party_aging_report(
    party_type: str | None = Query(default=None),
    as_of_date: date | None = Query(default=None),
    party_ledger_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_AGING
    )
    return await get_party_aging_report(
        db,
        tenant.id,
        party_ledger_id=party_ledger_id,
        as_of_date=as_of_date,
        party_type=party_type,
    )


@router.post("/auto-allocate")
async def party_auto_allocate(
    body: AutoAllocateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_ALLOCATE
    )
    pl = await db.get(PartyLedger, body.party_ledger_id)
    if not pl or pl.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    voucher = await db.get(Voucher, body.voucher_id)
    if not voucher or voucher.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")

    # Infer amount from voucher lines on this party account
    from app.models.finance import VoucherLine

    lines = (
        await db.execute(
            select(VoucherLine).where(
                VoucherLine.voucher_id == voucher.id,
                VoucherLine.account_id == pl.ledger_account_id,
            )
        )
    ).scalars().all()
    amount = sum((_d(ln.amount) for ln in lines), Decimal("0"))
    if amount <= 0:
        amount = sum(
            (_d(ln.amount) for ln in (
                await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))
            ).scalars().all()),
            Decimal("0"),
        ) / 2  # fallback: half of balanced voucher

    allocs = await auto_allocate_payment(
        db,
        tenant.id,
        pl.id,
        voucher,
        _money(amount),
        allocation_method=body.method,
        manual_bill_ids=body.bill_ids or None,
        created_by=user.id,
    )
    await db.commit()
    return [allocation_out(a) for a in allocs]


@router.post("/mark-overdue")
async def party_mark_overdue(
    body: MarkOverdueBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_EDIT
    )
    result = await daily_party_ledger_maintenance(
        db,
        tenant.id,
        feature_flags=tenant.feature_flags,
        as_of_date=body.as_of_date,
    )
    await db.commit()
    return result


@router.get("/by-party/{party_type}/{party_id}")
async def get_by_party(
    party_type: str,
    party_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lookup party ledger for Order/CI/VendorBill cards (does not auto-create)."""
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_VIEW
    )
    pt = party_type.strip().upper()
    filters = [PartyLedger.tenant_id == tenant.id, PartyLedger.party_type == pt]
    if pt == "CUSTOMER":
        filters.append(PartyLedger.customer_id == party_id)
    elif pt == "VENDOR":
        filters.append(PartyLedger.vendor_id == party_id)
    else:
        raise HTTPException(status_code=400, detail="party_type must be CUSTOMER or VENDOR")
    pl = (await db.execute(select(PartyLedger).where(*filters))).scalar_one_or_none()
    if not pl:
        return None
    return await _party_ledger_out(db, pl)


@router.get("")
async def list_ledgers(
    party_type: str | None = Query(default=None),
    search: str | None = Query(default=None),
    is_active: bool | None = Query(default=True),
    balance_type: str | None = Query(default=None),
    overdue_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_VIEW
    )
    rows, total = await list_party_ledgers(
        db,
        tenant.id,
        party_type=party_type,
        search=search,
        is_active=is_active,
        balance_type=balance_type,
        overdue_only=overdue_only,
        page=page,
        page_size=page_size,
    )
    items = await _party_ledgers_out(db, rows)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("")
async def create_ledger(
    body: PartyLedgerCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_CREATE
    )
    party_id = body.customer_id if body.party_type == "CUSTOMER" else body.vendor_id
    if not party_id:
        raise HTTPException(status_code=400, detail="customer_id or vendor_id is required")
    if body.party_type == "CUSTOMER" and body.vendor_id:
        raise HTTPException(status_code=400, detail="Provide only customer_id for CUSTOMER")
    if body.party_type == "VENDOR" and body.customer_id:
        raise HTTPException(status_code=400, detail="Provide only vendor_id for VENDOR")

    pl = await get_or_create_party_ledger(
        db,
        tenant.id,
        body.party_type,
        party_id,
        credit_limit=body.credit_limit,
        credit_days=body.credit_days,
        interest_rate_monthly=body.interest_rate_monthly,
        ledger_account_id=body.ledger_account_id,
        opening_balance=body.opening_balance,
        opening_balance_type=body.opening_balance_type,
        opening_balance_date=body.opening_balance_date,
        bill_wise_tracking=body.bill_wise_tracking,
        created_by=user.id,
    )
    await db.commit()
    await db.refresh(pl)
    return await _party_ledger_out(db, pl)


@router.get("/{ledger_id}")
async def get_ledger(
    ledger_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_VIEW
    )
    pl = await db.get(PartyLedger, ledger_id)
    if not pl or pl.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    return await _party_ledger_out(db, pl)


@router.patch("/{ledger_id}")
async def update_ledger(
    ledger_id: int,
    body: PartyLedgerUpdateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_EDIT
    )
    pl = await db.get(PartyLedger, ledger_id)
    if not pl or pl.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    if body.credit_limit is not None:
        pl.credit_limit = body.credit_limit
    if body.credit_days is not None:
        pl.credit_days = body.credit_days
    if body.interest_rate_monthly is not None:
        pl.interest_rate_monthly = body.interest_rate_monthly
    if body.is_active is not None:
        pl.is_active = body.is_active
    if body.bill_wise_tracking is not None:
        pl.bill_wise_tracking = body.bill_wise_tracking
    await db.commit()
    await db.refresh(pl)
    return await _party_ledger_out(db, pl)


@router.delete("/{ledger_id}")
async def delete_ledger(
    ledger_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_DELETE
    )
    pl = await db.get(PartyLedger, ledger_id)
    if not pl or pl.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    bill_count = (
        await db.execute(
            select(PartyLedgerBill.id).where(PartyLedgerBill.party_ledger_id == pl.id).limit(1)
        )
    ).scalar_one_or_none()
    if bill_count is not None:
        # Soft delete when bills exist
        pl.is_active = False
        await db.commit()
        return {"id": pl.id, "is_active": False, "soft_deleted": True}
    await db.delete(pl)
    await db.commit()
    return {"id": ledger_id, "deleted": True}


@router.get("/{ledger_id}/bills")
async def list_bills(
    ledger_id: int,
    status: str | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    bill_type: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_VIEW
    )
    pl = await db.get(PartyLedger, ledger_id)
    if not pl or pl.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Party ledger not found")

    q = select(PartyLedgerBill).where(
        PartyLedgerBill.party_ledger_id == ledger_id,
        PartyLedgerBill.tenant_id == tenant.id,
    )
    if status:
        q = q.where(PartyLedgerBill.status == status.strip().upper())
    if bill_type:
        q = q.where(PartyLedgerBill.bill_type == bill_type.strip().upper())
    if from_date:
        q = q.where(PartyLedgerBill.bill_date >= from_date)
    if to_date:
        q = q.where(PartyLedgerBill.bill_date <= to_date)
    rows = list(
        (
            await db.execute(
                q.order_by(PartyLedgerBill.bill_date.desc(), PartyLedgerBill.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).scalars().all()
    )
    return {"items": [bill_out(b) for b in rows], "page": page, "page_size": page_size}


@router.get("/{ledger_id}/bills/pending")
async def list_pending_bills(
    ledger_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_VIEW
    )
    pl = await db.get(PartyLedger, ledger_id)
    if not pl or pl.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    rows = (
        await db.execute(
            select(PartyLedgerBill)
            .where(
                PartyLedgerBill.party_ledger_id == ledger_id,
                PartyLedgerBill.status.in_(("PENDING", "PARTIAL", "OVERDUE")),
                PartyLedgerBill.pending_amount > 0,
            )
            .order_by(PartyLedgerBill.bill_date.asc())
        )
    ).scalars().all()
    return [bill_out(b) for b in rows]


@router.get("/{ledger_id}/bills/overdue")
async def list_overdue_bills(
    ledger_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_VIEW
    )
    pl = await db.get(PartyLedger, ledger_id)
    if not pl or pl.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    rows = (
        await db.execute(
            select(PartyLedgerBill)
            .where(
                PartyLedgerBill.party_ledger_id == ledger_id,
                PartyLedgerBill.status == "OVERDUE",
            )
            .order_by(PartyLedgerBill.due_date.asc())
        )
    ).scalars().all()
    return [bill_out(b) for b in rows]


@router.get("/{ledger_id}/bills/{bill_id}")
async def get_bill(
    ledger_id: int,
    bill_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_VIEW
    )
    bill = await db.get(PartyLedgerBill, bill_id)
    if not bill or bill.tenant_id != tenant.id or bill.party_ledger_id != ledger_id:
        raise HTTPException(status_code=404, detail="Bill not found")
    allocs = (
        await db.execute(
            select(PartyLedgerBillAllocation)
            .where(PartyLedgerBillAllocation.bill_id == bill.id)
            .order_by(PartyLedgerBillAllocation.allocated_date.asc())
        )
    ).scalars().all()
    out = bill_out(bill)
    out["allocations"] = [allocation_out(a) for a in allocs]
    return out


@router.post("/{ledger_id}/bills/{bill_id}/allocate")
async def allocate_bill(
    ledger_id: int,
    bill_id: int,
    body: AllocateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_ALLOCATE
    )
    bill = await db.get(PartyLedgerBill, bill_id)
    if not bill or bill.tenant_id != tenant.id or bill.party_ledger_id != ledger_id:
        raise HTTPException(status_code=404, detail="Bill not found")
    alloc = await allocate_to_bill(
        db,
        tenant.id,
        bill_id=bill_id,
        voucher_id=body.voucher_id,
        allocated_amount=body.allocated_amount,
        allocated_date=body.allocated_date,
        notes=body.notes,
        created_by=user.id,
    )
    await db.commit()
    return allocation_out(alloc)


@router.get("/{ledger_id}/statement")
async def party_statement(
    ledger_id: int,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_STATEMENT
    )
    return await get_party_ledger_statement(
        db, tenant.id, ledger_id, from_date=from_date, to_date=to_date
    )


@router.get("/{ledger_id}/allocations")
async def list_allocations(
    ledger_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_VIEW
    )
    pl = await db.get(PartyLedger, ledger_id)
    if not pl or pl.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    bill_ids = (
        await db.execute(
            select(PartyLedgerBill.id).where(PartyLedgerBill.party_ledger_id == ledger_id)
        )
    ).scalars().all()
    if not bill_ids:
        return []
    allocs = (
        await db.execute(
            select(PartyLedgerBillAllocation)
            .where(PartyLedgerBillAllocation.bill_id.in_(list(bill_ids)))
            .order_by(PartyLedgerBillAllocation.allocated_date.desc())
        )
    ).scalars().all()
    out = []
    for a in allocs:
        row = allocation_out(a)
        bill = await db.get(PartyLedgerBill, a.bill_id)
        row["bill_number"] = bill.bill_number if bill else None
        voucher = await db.get(Voucher, a.voucher_id)
        row["voucher_number"] = voucher.voucher_number if voucher else None
        out.append(row)
    return out


@router.post("/{ledger_id}/calculate-interest")
async def calculate_interest(
    ledger_id: int,
    body: CalculateInterestBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_party_ledger_flag(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_PARTY_LEDGER_INTEREST
    )
    pl = await db.get(PartyLedger, ledger_id)
    if not pl or pl.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    as_of = body.as_of_date or date.today()
    await mark_overdue_bills(db, tenant.id, as_of)
    bills = (
        await db.execute(
            select(PartyLedgerBill).where(
                PartyLedgerBill.party_ledger_id == ledger_id,
                PartyLedgerBill.status == "OVERDUE",
                PartyLedgerBill.pending_amount > 0,
            )
        )
    ).scalars().all()
    details = []
    total = Decimal("0")
    for bill in bills:
        interest = await calculate_bill_interest(db, bill.id, as_of)
        days = (as_of - bill.due_date).days if bill.due_date else 0
        details.append(
            {
                "bill_number": bill.bill_number,
                "pending_amount": str(_money(_d(bill.pending_amount))),
                "days_overdue": days,
                "interest_accrued": str(_money(interest)),
            }
        )
        total += interest
    await db.commit()
    return {
        "bills_calculated": len(details),
        "total_interest_accrued": str(_money(total)),
        "bills": details,
    }
