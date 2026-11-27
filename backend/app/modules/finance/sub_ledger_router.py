"""Sub-accounts: people and sources under one control ledger."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authority.policy import is_class1_for_module
from app.common.ownership import ensure_owned
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_finance_sub_ledger_tracking_v1_enabled,
    is_user_authority_classes_v1_enabled,
)
from app.database import get_db
from app.models import Tenant, User
from app.models.finance import BillReference, FinanceSubAccount, Voucher, VoucherLine
from app.modules.audit.service import log_action
from app.modules.finance.sub_ledger_service import posted_or_manual_bill_clause, quantize_amount

router = APIRouter(prefix="/sub-accounts", tags=["finance-sub-accounts"])

CATEGORIES = {"EMPLOYEE_ADVANCE", "HAND_LOAN_LENDER", "LOAN_BORROWER", "PARTY", "OTHER"}


class SubAccountBody(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=255)
    category: str
    employee_id: int | None = None
    customer_id: int | None = None
    vendor_id: int | None = None
    phone: str | None = None
    notes: str | None = None
    is_active: bool = True


class SubAccountOut(SubAccountBody):
    id: int
    tenant_id: int

    class Config:
        from_attributes = True


def _require_flag(tenant: Tenant) -> None:
    if not is_finance_sub_ledger_tracking_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=403, detail="Sub-account tracking is switched off for this company.")


async def _require_writer(db: AsyncSession, user: User, tenant: Tenant) -> None:
    _require_flag(tenant)
    if is_user_authority_classes_v1_enabled(tenant.feature_flags):
        allowed = await is_class1_for_module(db, user, "finance", feature_flags=tenant.feature_flags)
        if not allowed:
            raise HTTPException(status_code=403, detail="Only Class 1 or Super Admin can change sub-accounts.")


@router.get("", response_model=list[SubAccountOut])
async def list_sub_accounts(
    search: str | None = None,
    category: str | None = None,
    limit: int = Query(default=100, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_flag(tenant)
    stmt = select(FinanceSubAccount).where(FinanceSubAccount.tenant_id == tenant.id).order_by(FinanceSubAccount.name)
    if category:
        stmt = stmt.where(FinanceSubAccount.category == category.strip().upper())
    if search:
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(func.lower(FinanceSubAccount.name).like(q) | func.lower(FinanceSubAccount.code).like(q))
    rows = (await db.execute(stmt.offset(offset).limit(limit))).scalars().all()
    return list(rows)


@router.post("", response_model=SubAccountOut)
async def create_sub_account(
    body: SubAccountBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_writer(db, user, tenant)
    category = body.category.strip().upper()
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Unknown sub-account category.")
    from app.models.customer import Customer
    from app.models.hr import Employee
    from app.models.inventory import Vendor

    await ensure_owned(db, Employee, body.employee_id, tenant.id, "Employee")
    await ensure_owned(db, Customer, body.customer_id, tenant.id, "Customer")
    await ensure_owned(db, Vendor, body.vendor_id, tenant.id, "Vendor")
    row = FinanceSubAccount(
        tenant_id=tenant.id,
        code=body.code.strip()[:32],
        name=body.name.strip()[:255],
        category=category,
        employee_id=body.employee_id,
        customer_id=body.customer_id,
        vendor_id=body.vendor_id,
        phone=body.phone,
        notes=body.notes,
        is_active=body.is_active,
        created_by=user.id,
    )
    db.add(row)
    await db.flush()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="sub_account.create", resource="finance_sub_account", details=str(row.id))
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/{sub_account_id}", response_model=SubAccountOut)
async def update_sub_account(
    sub_account_id: int,
    body: SubAccountBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_writer(db, user, tenant)
    row = await ensure_owned(db, FinanceSubAccount, sub_account_id, tenant.id, "Sub-account")
    category = body.category.strip().upper()
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Unknown sub-account category.")
    from app.models.customer import Customer
    from app.models.hr import Employee
    from app.models.inventory import Vendor

    await ensure_owned(db, Employee, body.employee_id, tenant.id, "Employee")
    await ensure_owned(db, Customer, body.customer_id, tenant.id, "Customer")
    await ensure_owned(db, Vendor, body.vendor_id, tenant.id, "Vendor")
    row.code = body.code.strip()[:32]
    row.name = body.name.strip()[:255]
    row.category = category
    row.employee_id = body.employee_id
    row.customer_id = body.customer_id
    row.vendor_id = body.vendor_id
    row.phone = body.phone
    row.notes = body.notes
    row.is_active = body.is_active
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="sub_account.update", resource="finance_sub_account", details=str(row.id))
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/register")
async def sub_account_register(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_flag(tenant)
    people = (
        await db.execute(select(FinanceSubAccount).where(FinanceSubAccount.tenant_id == tenant.id, FinanceSubAccount.is_active.is_(True)))
    ).scalars().all()
    out = []
    for person in people:
        debits, credits = await _posted_totals(db, tenant.id, person.id)
        out.append(
            {
                "id": person.id,
                "code": person.code,
                "name": person.name,
                "category": person.category,
                "debit_total": str(debits),
                "credit_total": str(credits),
                "net": str(debits - credits),
            }
        )
    return out


@router.get("/open-bill-references")
async def open_bill_references(
    account_id: int,
    sub_account_id: int | None = None,
    entry_side: str | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_flag(tenant)
    stmt = select(BillReference).where(
        BillReference.tenant_id == tenant.id,
        BillReference.account_id == account_id,
        BillReference.status.in_(["OPEN", "PARTIALLY_SETTLED"]),
        posted_or_manual_bill_clause(),
    )
    if sub_account_id is not None:
        stmt = stmt.where(BillReference.sub_account_id == sub_account_id)
    if entry_side:
        stmt = stmt.where(BillReference.entry_side == entry_side.strip().upper())
    rows = (await db.execute(stmt.order_by(BillReference.bill_date).limit(MAX_PAGE_SIZE))).scalars().all()
    return [
        {
            "id": row.id,
            "bill_number": row.bill_number,
            "bill_date": row.bill_date.isoformat(),
            "pending_amount": str(quantize_amount(row.pending_amount or 0)),
            "bill_type": row.bill_type,
            "entry_side": row.entry_side,
            "sub_account_id": row.sub_account_id,
        }
        for row in rows
    ]


@router.get("/{sub_account_id}/statement")
async def sub_account_statement(
    sub_account_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_flag(tenant)
    person = await ensure_owned(db, FinanceSubAccount, sub_account_id, tenant.id, "Sub-account")
    lines = (
        await db.execute(
            select(VoucherLine, Voucher)
            .join(Voucher, Voucher.id == VoucherLine.voucher_id)
            .where(
                VoucherLine.tenant_id == tenant.id,
                VoucherLine.sub_account_id == person.id,
                Voucher.status == "POSTED",
            )
            .order_by(Voucher.voucher_date, Voucher.id)
        )
    ).all()
    entries = []
    for line, voucher in lines:
        entries.append(
            {
                "voucher_id": voucher.id,
                "voucher_number": voucher.voucher_number,
                "voucher_date": voucher.voucher_date.isoformat(),
                "entry_type": line.entry_type,
                "amount": str(quantize_amount(line.base_amount or 0)),
                "narration": voucher.description,
            }
        )
    debits, credits = await _posted_totals(db, tenant.id, person.id)
    return {"id": person.id, "name": person.name, "debit_total": str(debits), "credit_total": str(credits), "entries": entries}


async def _posted_totals(db: AsyncSession, tenant_id: int, sub_account_id: int):
    rows = (
        await db.execute(
            select(VoucherLine.entry_type, func.coalesce(func.sum(VoucherLine.base_amount), 0))
            .join(Voucher, Voucher.id == VoucherLine.voucher_id)
            .where(
                VoucherLine.tenant_id == tenant_id,
                VoucherLine.sub_account_id == sub_account_id,
                Voucher.status == "POSTED",
            )
            .group_by(VoucherLine.entry_type)
        )
    ).all()
    debits = credits = quantize_amount(0)
    for side, total in rows:
        if side == "DEBIT":
            debits = quantize_amount(total)
        else:
            credits = quantize_amount(total)
    return debits, credits
