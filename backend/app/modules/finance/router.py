from __future__ import annotations

import csv
from collections import defaultdict
from io import StringIO
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    AccountGroup,
    AccountingPeriod,
    BankAccount,
    BankReconciliation,
    BankStatementMatchLog,
    BankStatementLine,
    Budget,
    BudgetLine,
    ChartOfAccount,
    CashForecastLine,
    CashForecastScenario,
    CostCenter,
    CurrencyExchangeRate,
    FxReceipt,
    GoodsReceiving,
    GoodsReceivingItem,
    Order,
    OutstandingBill,
    PaymentRun,
    PaymentRunItem,
    PurchaseOrder,
    PurchaseOrderItem,
    Quotation,
    Role,
    Tenant,
    User,
    Voucher,
    VoucherLine,
    VoucherType,
)

router = APIRouter(prefix="/finance", tags=["finance"])

DEFAULT_VOUCHER_TYPES: list[tuple[str, str]] = [
    ("PAYMENT", "Payment"),
    ("RECEIPT", "Receipt"),
    ("JOURNAL", "Journal"),
    ("CONTRA", "Contra"),
    ("MJ", "Material Journal"),
    ("PJ", "Purchase Journal"),
    ("LCJ", "LC Journal"),
]

VOUCHER_WORKFLOW: dict[str, set[str]] = {
    "DRAFT": {"SUBMITTED", "CANCELLED"},
    "SUBMITTED": {"CHECKED", "REJECTED"},
    "CHECKED": {"RECOMMENDED", "REJECTED"},
    "RECOMMENDED": {"APPROVED", "REJECTED"},
    "APPROVED": {"POSTED", "REJECTED"},
    "POSTED": {"REVERSED"},
    "REJECTED": {"DRAFT"},
    "CANCELLED": set(),
    "REVERSED": set(),
}


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _to_float(value: str | None) -> float:
    try:
        return float(value or "0")
    except (TypeError, ValueError):
        return 0.0


async def _require_manager_or_admin(db: AsyncSession, user: User) -> None:
    role = await db.get(Role, user.role_id)
    role_name = (role.name if role else "").strip().lower()
    if role_name not in {"admin", "manager", "super_admin", "superadmin", "owner"}:
        raise HTTPException(status_code=403, detail="Only manager/admin can perform this action")


def _is_system_voucher_type(code: str) -> bool:
    return code.strip().upper() in {x[0] for x in DEFAULT_VOUCHER_TYPES}


def _next_code(prefix: str, last_id: int | None) -> str:
    return f"{prefix}{(last_id or 0) + 1:04d}"


class AccountGroupBody(BaseModel):
    name: str
    code: str | None = None
    parent_group_id: int | None = None
    nature: str
    affects_gross_profit: bool = False
    is_bank_group: bool = False
    sort_order: int = 0
    is_active: bool = True


class AccountGroupOut(AccountGroupBody):
    id: int
    tenant_id: int
    code: str

    class Config:
        from_attributes = True


class ChartAccountBody(BaseModel):
    account_number: str | None = None
    name: str
    group_id: int
    normal_balance: Literal["debit", "credit"] = "debit"
    opening_balance: str = "0"
    account_currency: str | None = None
    maintain_fc_balance: bool = False
    description: str | None = None
    is_active: bool = True
    is_bank_account: bool = False


class ChartAccountOut(ChartAccountBody):
    id: int
    tenant_id: int
    balance: str

    class Config:
        from_attributes = True


class VoucherTypeBody(BaseModel):
    code: str
    name: str
    is_active: bool = True


class VoucherTypeOut(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    is_active: bool
    is_system: bool

    class Config:
        from_attributes = True


class VoucherLineBody(BaseModel):
    account_id: int
    cost_center_id: int | None = None
    entry_type: Literal["DEBIT", "CREDIT"]
    amount: str
    notes: str | None = None


class VoucherBody(BaseModel):
    voucher_number: str | None = None
    voucher_type: str
    voucher_date: date
    description: str | None = None
    reference: str | None = None
    lines: list[VoucherLineBody]


class VoucherLineOut(VoucherLineBody):
    id: int
    voucher_id: int
    tenant_id: int

    class Config:
        from_attributes = True


class VoucherOut(BaseModel):
    id: int
    tenant_id: int
    voucher_number: str
    voucher_type: str
    voucher_date: date
    status: str
    description: str | None
    reference: str | None
    created_by: int | None
    lines: list[VoucherLineOut]


class CashScenarioBody(BaseModel):
    name: str
    start_date: date
    months: int = 6


class CashForecastLineOut(BaseModel):
    id: int
    scenario_id: int
    month_label: str
    inflow: str
    outflow: str
    net: str
    cumulative: str

    class Config:
        from_attributes = True


class CashScenarioOut(BaseModel):
    id: int
    tenant_id: int
    name: str
    start_date: date
    months: int
    status: str
    lines: list[CashForecastLineOut]


class FxReceiptBody(BaseModel):
    receipt_no: str | None = None
    receipt_date: date
    source_ref: str | None = None
    currency: str = "USD"
    fc_amount: str
    rate_to_base: str = "1"
    notes: str | None = None


class FxSettleBody(BaseModel):
    settle_amount: str


class FxReceiptOut(BaseModel):
    id: int
    tenant_id: int
    receipt_no: str
    receipt_date: date
    source_ref: str | None
    currency: str
    fc_amount: str
    rate_to_base: str
    base_amount: str
    settled_amount: str
    status: str
    notes: str | None

    class Config:
        from_attributes = True


class BillBody(BaseModel):
    bill_no: str | None = None
    party_name: str
    bill_type: Literal["PAYABLE", "RECEIVABLE"] = "PAYABLE"
    bill_date: date
    due_date: date
    amount: str
    paid_amount: str = "0"
    currency: str = "BDT"
    notes: str | None = None


class BillOut(BaseModel):
    id: int
    tenant_id: int
    bill_no: str
    party_name: str
    bill_type: str
    bill_date: date
    due_date: date
    amount: str
    paid_amount: str
    currency: str
    status: str
    notes: str | None

    class Config:
        from_attributes = True


class PurchasePayableFromPoBody(BaseModel):
    due_in_days: int = 30
    currency: str = "BDT"
    notes: str | None = None


class CostCenterBody(BaseModel):
    center_code: str | None = None
    name: str
    department: str | None = None
    is_active: bool = True


class CostCenterOut(BaseModel):
    id: int
    tenant_id: int
    center_code: str
    name: str
    department: str | None
    is_active: bool

    class Config:
        from_attributes = True


class BudgetLineBody(BaseModel):
    cost_center_id: int | None = None
    account_id: int | None = None
    period_month: str
    amount: str
    notes: str | None = None


class BudgetBody(BaseModel):
    budget_name: str
    fiscal_year: str
    status: Literal["DRAFT", "FINAL"] = "DRAFT"
    lines: list[BudgetLineBody] = []


class BudgetLineOut(BudgetLineBody):
    id: int
    budget_id: int
    tenant_id: int

    class Config:
        from_attributes = True


class BudgetOut(BaseModel):
    id: int
    tenant_id: int
    budget_name: str
    fiscal_year: str
    status: str
    created_by: int | None
    lines: list[BudgetLineOut]


class BankAccountBody(BaseModel):
    account_name: str
    bank_name: str
    account_number: str
    branch_name: str | None = None
    swift_code: str | None = None
    routing_number: str | None = None
    currency: str = "BDT"
    gl_account_id: int | None = None
    opening_balance: str = "0"
    current_balance: str = "0"
    is_active: bool = True


class BankAccountOut(BankAccountBody):
    id: int
    tenant_id: int

    class Config:
        from_attributes = True


class BankReconciliationBody(BaseModel):
    bank_account_id: int
    statement_date: date
    statement_balance: str
    notes: str | None = None


class BankReconciliationOut(BaseModel):
    id: int
    tenant_id: int
    bank_account_id: int
    statement_date: date
    statement_balance: str
    book_balance: str
    difference_amount: str
    status: str
    notes: str | None
    is_finalized: bool
    finalized_at: datetime | None
    finalized_by: int | None
    finalize_reason: str | None
    created_by: int | None

    class Config:
        from_attributes = True


class PaymentRunItemBody(BaseModel):
    bill_id: int | None = None
    party_name: str
    amount: str
    reference: str | None = None


class PaymentRunBody(BaseModel):
    run_code: str | None = None
    run_date: date
    bank_account_id: int | None = None
    remarks: str | None = None
    items: list[PaymentRunItemBody]


class PaymentRunItemOut(PaymentRunItemBody):
    id: int
    tenant_id: int
    payment_run_id: int
    status: str

    class Config:
        from_attributes = True


class PaymentRunOut(BaseModel):
    id: int
    tenant_id: int
    run_code: str
    run_date: date
    bank_account_id: int | None
    status: str
    total_amount: str
    executed_voucher_id: int | None
    remarks: str | None
    created_by: int | None
    items: list[PaymentRunItemOut]


class AccountingPeriodBody(BaseModel):
    period_name: str
    start_date: date
    end_date: date


class AccountingPeriodOut(BaseModel):
    id: int
    tenant_id: int
    period_name: str
    start_date: date
    end_date: date
    is_closed: bool
    closed_at: datetime | None
    closed_by: int | None

    class Config:
        from_attributes = True


class BankStatementLineBody(BaseModel):
    transaction_date: date
    description: str | None = None
    reference: str | None = None
    debit_amount: str = "0"
    credit_amount: str = "0"
    running_balance: str | None = None


class BankStatementLinesBody(BaseModel):
    lines: list[BankStatementLineBody]


class BankStatementCsvBody(BaseModel):
    csv_text: str


class ManualStatementMatchBody(BaseModel):
    payment_run_id: int


class BankStatementLineOut(BankStatementLineBody):
    id: int
    tenant_id: int
    reconciliation_id: int
    matched_payment_run_id: int | None
    matched_status: str

    class Config:
        from_attributes = True


class BankStatementMatchLogOut(BaseModel):
    id: int
    tenant_id: int
    reconciliation_id: int
    statement_line_id: int
    action: str
    payment_run_id: int | None
    note: str | None
    created_by: int | None
    created_at: datetime

    class Config:
        from_attributes = True


class BankReconciliationFinalizeBody(BaseModel):
    reason: str | None = None


async def _voucher_out(db: AsyncSession, voucher: Voucher) -> VoucherOut:
    lines_result = await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id).order_by(VoucherLine.id))
    lines = list(lines_result.scalars().all())
    return VoucherOut(
        id=voucher.id,
        tenant_id=voucher.tenant_id,
        voucher_number=voucher.voucher_number,
        voucher_type=voucher.voucher_type,
        voucher_date=voucher.voucher_date,
        status=voucher.status,
        description=voucher.description,
        reference=voucher.reference,
        created_by=voucher.created_by,
        lines=lines,
    )


async def _budget_out(db: AsyncSession, budget: Budget) -> BudgetOut:
    line_rows = list((await db.execute(select(BudgetLine).where(BudgetLine.budget_id == budget.id))).scalars().all())
    return BudgetOut(
        id=budget.id,
        tenant_id=budget.tenant_id,
        budget_name=budget.budget_name,
        fiscal_year=budget.fiscal_year,
        status=budget.status,
        created_by=budget.created_by,
        lines=line_rows,
    )


async def _payment_run_out(db: AsyncSession, run: PaymentRun) -> PaymentRunOut:
    items = list((await db.execute(select(PaymentRunItem).where(PaymentRunItem.payment_run_id == run.id))).scalars().all())
    return PaymentRunOut(
        id=run.id,
        tenant_id=run.tenant_id,
        run_code=run.run_code,
        run_date=run.run_date,
        bank_account_id=run.bank_account_id,
        status=run.status,
        total_amount=run.total_amount,
        executed_voucher_id=run.executed_voucher_id,
        remarks=run.remarks,
        created_by=run.created_by,
        items=items,
    )


async def _find_or_create_ap_clearing_account(db: AsyncSession, tenant_id: int) -> ChartOfAccount:
    existing = (
        await db.execute(
            select(ChartOfAccount).where(
                ChartOfAccount.tenant_id == tenant_id,
                ChartOfAccount.account_number == "APCLR-0001",
            )
        )
    ).scalars().first()
    if existing:
        return existing

    liability_group = (
        await db.execute(
            select(AccountGroup).where(
                AccountGroup.tenant_id == tenant_id,
                func.lower(AccountGroup.nature) == "liability",
            ).order_by(AccountGroup.id.asc())
        )
    ).scalars().first()
    if not liability_group:
        liability_group = AccountGroup(
            tenant_id=tenant_id,
            name="Current Liabilities",
            code="CL",
            parent_group_id=None,
            nature="Liability",
            affects_gross_profit=False,
            is_bank_group=False,
            sort_order=0,
            is_active=True,
        )
        db.add(liability_group)
        await db.flush()

    account = ChartOfAccount(
        tenant_id=tenant_id,
        account_number="APCLR-0001",
        name="AP Payment Clearing",
        group_id=liability_group.id,
        normal_balance="credit",
        opening_balance="0",
        balance="0",
        is_active=True,
        is_bank_account=False,
        account_currency="BDT",
        maintain_fc_balance=False,
    )
    db.add(account)
    await db.flush()
    return account


def _supplier_account_number(party_name: str, tenant_id: int) -> str:
    compact = "".join(ch for ch in (party_name or "").upper() if ch.isalnum())
    suffix = compact[:8] if compact else f"T{tenant_id}"
    return f"APV-{suffix}"


async def _find_or_create_supplier_ap_account(db: AsyncSession, tenant_id: int, party_name: str) -> ChartOfAccount:
    code = _supplier_account_number(party_name, tenant_id)
    existing = (
        await db.execute(
            select(ChartOfAccount).where(
                ChartOfAccount.tenant_id == tenant_id,
                ChartOfAccount.account_number == code,
            )
        )
    ).scalars().first()
    if existing:
        return existing

    liability_group = (
        await db.execute(
            select(AccountGroup).where(
                AccountGroup.tenant_id == tenant_id,
                func.lower(AccountGroup.nature) == "liability",
            ).order_by(AccountGroup.id.asc())
        )
    ).scalars().first()
    if not liability_group:
        liability_group = AccountGroup(
            tenant_id=tenant_id,
            name="Current Liabilities",
            code="CL",
            parent_group_id=None,
            nature="Liability",
            affects_gross_profit=False,
            is_bank_group=False,
            sort_order=0,
            is_active=True,
        )
        db.add(liability_group)
        await db.flush()

    account = ChartOfAccount(
        tenant_id=tenant_id,
        account_number=code,
        name=f"{party_name} Payable",
        group_id=liability_group.id,
        normal_balance="credit",
        opening_balance="0",
        balance="0",
        is_active=True,
        is_bank_account=False,
        account_currency="BDT",
        maintain_fc_balance=False,
    )
    db.add(account)
    await db.flush()
    return account


def _apply_voucher_impact(account: ChartOfAccount, entry_type: str, amount: float) -> None:
    current_balance = _to_float(account.balance)
    if account.normal_balance == "debit":
        current_balance += amount if entry_type == "DEBIT" else -amount
    else:
        current_balance += amount if entry_type == "CREDIT" else -amount
    account.balance = str(round(current_balance, 4))


async def _active_voucher_type_codes(db: AsyncSession, tenant_id: int) -> set[str]:
    persisted = list(
        (
            await db.execute(
                select(VoucherType).where(
                    VoucherType.tenant_id == tenant_id,
                    VoucherType.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    codes = {row.code.strip().upper() for row in persisted}
    if not codes:
        codes = {code for code, _ in DEFAULT_VOUCHER_TYPES}
    return codes


def _assert_voucher_transition(current_status: str, next_status: str) -> None:
    allowed = VOUCHER_WORKFLOW.get(current_status, set())
    if next_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid workflow transition from {current_status} to {next_status}",
        )


@router.get("/account-groups", response_model=list[AccountGroupOut])
async def list_account_groups(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(select(AccountGroup).where(AccountGroup.tenant_id == tenant.id).order_by(AccountGroup.sort_order))
    return list(result.scalars().all())


@router.post("/account-groups", response_model=AccountGroupOut)
async def create_account_group(
    body: AccountGroupBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = AccountGroup(
        tenant_id=tenant.id,
        code=await next_tenant_code(
            db,
            model=AccountGroup,
            tenant_id=tenant.id,
            prefix="GRP-",
            width=4,
        ),
        **body.model_dump(exclude={"code"}),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/account-groups/{group_id}", response_model=AccountGroupOut)
async def update_account_group(
    group_id: int,
    body: AccountGroupBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(AccountGroup, group_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Account group not found")
    for key, value in body.model_dump().items():
        if key == "code":
            continue
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/account-groups/{group_id}")
async def delete_account_group(
    group_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(AccountGroup, group_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Account group not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/chart-of-accounts", response_model=list[ChartAccountOut])
async def list_chart_of_accounts(
    active_only: bool = Query(default=True),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ChartOfAccount).where(ChartOfAccount.tenant_id == tenant.id).order_by(ChartOfAccount.account_number)
    if active_only:
        stmt = stmt.where(ChartOfAccount.is_active.is_(True))
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/chart-of-accounts", response_model=ChartAccountOut)
async def create_chart_account(
    body: ChartAccountBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    group = await db.get(AccountGroup, body.group_id)
    if not group or group.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Account group not found")
    account_number = await next_tenant_code(
        db,
        model=ChartOfAccount,
        tenant_id=tenant.id,
        prefix="AC-",
        width=4,
    )
    row = ChartOfAccount(
        tenant_id=tenant.id,
        account_number=account_number,
        balance=body.opening_balance,
        **body.model_dump(exclude={"account_number"}),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/chart-of-accounts/{account_id}", response_model=ChartAccountOut)
async def update_chart_account(
    account_id: int,
    body: ChartAccountBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ChartOfAccount, account_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Ledger account not found")
    for key, value in body.model_dump(exclude={"account_number"}).items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/chart-of-accounts/{account_id}")
async def delete_chart_account(
    account_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ChartOfAccount, account_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Ledger account not found")
    use_count = (
        await db.execute(
            select(func.count()).select_from(VoucherLine).where(
                VoucherLine.tenant_id == tenant.id,
                VoucherLine.account_id == account_id,
            )
        )
    ).scalar()
    if use_count and use_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete ledger with voucher entries")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/vouchers/types", response_model=list[VoucherTypeOut])
async def list_voucher_types(
    active_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = list(
        (
            await db.execute(
                select(VoucherType)
                .where(VoucherType.tenant_id == tenant.id)
                .order_by(VoucherType.code.asc())
            )
        ).scalars().all()
    )
    if active_only:
        rows = [row for row in rows if row.is_active]
    if rows:
        return rows
    # Expose fallback defaults so UI works even before custom setup.
    return [
        VoucherTypeOut(
            id=0,
            tenant_id=tenant.id,
            code=code,
            name=name,
            is_active=True,
            is_system=True,
        )
        for code, name in DEFAULT_VOUCHER_TYPES
    ]


@router.post("/vouchers/types", response_model=VoucherTypeOut)
async def upsert_voucher_type(
    body: VoucherTypeBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    code = body.code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Voucher type code is required")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Voucher type name is required")
    existing = (
        await db.execute(
            select(VoucherType).where(
                VoucherType.tenant_id == tenant.id,
                VoucherType.code == code,
            )
        )
    ).scalars().first()
    if existing:
        existing.name = name
        existing.is_active = body.is_active
        existing.is_system = _is_system_voucher_type(code)
        await db.commit()
        await db.refresh(existing)
        return existing
    row = VoucherType(
        tenant_id=tenant.id,
        code=code,
        name=name,
        is_active=body.is_active,
        is_system=_is_system_voucher_type(code),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/vouchers", response_model=list[VoucherOut])
async def list_vouchers(
    status_filter: str | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(Voucher).where(Voucher.tenant_id == tenant.id).order_by(Voucher.id.desc())
    if status_filter:
        stmt = stmt.where(Voucher.status == status_filter.strip().upper())
    if from_date:
        stmt = stmt.where(Voucher.voucher_date >= from_date)
    if to_date:
        stmt = stmt.where(Voucher.voucher_date <= to_date)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    return [await _voucher_out(db, row) for row in rows]


@router.post("/vouchers", response_model=VoucherOut)
async def create_voucher(
    body: VoucherBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    voucher_type_code = body.voucher_type.strip().upper()
    if voucher_type_code not in await _active_voucher_type_codes(db, tenant.id):
        raise HTTPException(status_code=400, detail="Voucher type is inactive or not configured")
    if not body.lines:
        raise HTTPException(status_code=400, detail="Voucher must have at least one line")
    debit_total = sum(_to_float(line.amount) for line in body.lines if line.entry_type == "DEBIT")
    credit_total = sum(_to_float(line.amount) for line in body.lines if line.entry_type == "CREDIT")
    if round(debit_total, 4) != round(credit_total, 4):
        raise HTTPException(status_code=400, detail="Voucher is not balanced")
    voucher_number = await next_tenant_code(
        db,
        model=Voucher,
        tenant_id=tenant.id,
        prefix="VCH-",
        width=4,
    )
    row = Voucher(
        tenant_id=tenant.id,
        voucher_number=voucher_number,
        voucher_type=voucher_type_code,
        voucher_date=body.voucher_date,
        status="DRAFT",
        description=body.description,
        reference=body.reference,
        created_by=user.id,
    )
    db.add(row)
    await db.flush()
    for line in body.lines:
        acct = await db.get(ChartOfAccount, line.account_id)
        if not acct or acct.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail=f"Account not found: {line.account_id}")
        db.add(
            VoucherLine(
                tenant_id=tenant.id,
                voucher_id=row.id,
                account_id=line.account_id,
                cost_center_id=line.cost_center_id,
                entry_type=line.entry_type,
                amount=line.amount,
                notes=line.notes,
            )
        )
    await db.commit()
    await db.refresh(row)
    return await _voucher_out(db, row)


@router.post("/vouchers/{voucher_id}/status", response_model=VoucherOut)
async def update_voucher_status(
    voucher_id: int,
    body: dict[str, str],
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Voucher, voucher_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    next_status = (body.get("status") or "").strip().upper()
    allowed = set(VOUCHER_WORKFLOW.keys())
    if next_status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid voucher status")
    if next_status != row.status:
        _assert_voucher_transition(row.status, next_status)
    # Approval + posting transitions are restricted.
    if next_status in {"CHECKED", "RECOMMENDED", "APPROVED", "POSTED", "REVERSED"} and next_status != row.status:
        await _require_manager_or_admin(db, user)
    if next_status == "POSTED" and row.status != "POSTED":
        open_period = (
            await db.execute(
                select(AccountingPeriod).where(
                    AccountingPeriod.tenant_id == tenant.id,
                    AccountingPeriod.is_closed.is_(False),
                    AccountingPeriod.start_date <= row.voucher_date,
                    AccountingPeriod.end_date >= row.voucher_date,
                )
            )
        ).scalars().first()
        if not open_period:
            raise HTTPException(status_code=400, detail="No open accounting period for this voucher date")
        lines_result = await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == row.id))
        for line in lines_result.scalars().all():
            account = await db.get(ChartOfAccount, line.account_id)
            if not account or account.tenant_id != tenant.id:
                continue
            current_balance = _to_float(account.balance)
            amount = _to_float(line.amount)
            if account.normal_balance == "debit":
                current_balance += amount if line.entry_type == "DEBIT" else -amount
            else:
                current_balance += amount if line.entry_type == "CREDIT" else -amount
            account.balance = str(round(current_balance, 4))
    row.status = next_status
    await db.commit()
    await db.refresh(row)
    return await _voucher_out(db, row)


@router.get("/reports/day-book")
async def day_book_report(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    voucher_type: str | None = Query(default=None),
    account_id: int | None = Query(default=None),
    group_id: int | None = Query(default=None),
    party_name: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if from_date is None:
        from_date = date.today().replace(day=1)
    if to_date is None:
        to_date = date.today()
    stmt = (
        select(Voucher)
        .where(
            Voucher.tenant_id == tenant.id,
            Voucher.voucher_date >= from_date,
            Voucher.voucher_date <= to_date,
        )
        .order_by(Voucher.voucher_date, Voucher.id)
    )
    if voucher_type:
        stmt = stmt.where(Voucher.voucher_type == voucher_type.upper())
    if party_name:
        q = f"%{party_name.strip().lower()}%"
        stmt = stmt.where(
            func.lower(func.coalesce(Voucher.reference, "")).like(q)
            | func.lower(func.coalesce(Voucher.description, "")).like(q)
        )
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    account_group_map = {
        account.id: account.group_id
        for account in (
            await db.execute(select(ChartOfAccount).where(ChartOfAccount.tenant_id == tenant.id))
        ).scalars().all()
    }
    total_amount = 0.0
    out = []
    for row in rows:
        lines_result = await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == row.id))
        lines = list(lines_result.scalars().all())
        if account_id is not None and not any(line.account_id == account_id for line in lines):
            continue
        if group_id is not None and not any(account_group_map.get(line.account_id) == group_id for line in lines):
            continue
        amt = sum(_to_float(line.amount) for line in lines if line.entry_type == "DEBIT")
        total_amount += amt
        out.append(
            {
                "id": row.id,
                "voucher_number": row.voucher_number,
                "voucher_type": row.voucher_type,
                "voucher_date": row.voucher_date,
                "status": row.status,
                "description": row.description,
                "amount": round(amt, 2),
            }
        )
    return {"rows": out, "total_amount": round(total_amount, 2)}


@router.get("/reports/trial-balance")
async def trial_balance_report(
    as_of_date: date | None = Query(default=None),
    account_id: int | None = Query(default=None),
    group_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if as_of_date is None:
        as_of_date = date.today()
    accounts_stmt = (
        select(ChartOfAccount, AccountGroup)
        .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
        .where(ChartOfAccount.tenant_id == tenant.id)
    )
    if account_id is not None:
        accounts_stmt = accounts_stmt.where(ChartOfAccount.id == account_id)
    if group_id is not None:
        accounts_stmt = accounts_stmt.where(ChartOfAccount.group_id == group_id)
    accounts_result = await db.execute(accounts_stmt)
    posted_lines = (
        await db.execute(
            select(VoucherLine, Voucher)
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .where(
                VoucherLine.tenant_id == tenant.id,
                Voucher.tenant_id == tenant.id,
                Voucher.status == "POSTED",
                Voucher.voucher_date <= as_of_date,
            )
        )
    ).all()
    movement: dict[int, dict[str, float]] = defaultdict(lambda: {"DEBIT": 0.0, "CREDIT": 0.0})
    for line, _voucher in posted_lines:
        movement[line.account_id][line.entry_type] += _to_float(line.amount)

    rows = []
    debit_total = 0.0
    credit_total = 0.0
    for account, group in accounts_result.all():
        opening = _to_float(account.opening_balance)
        debit_mov = movement[account.id]["DEBIT"]
        credit_mov = movement[account.id]["CREDIT"]
        if account.normal_balance == "debit":
            bal = opening + debit_mov - credit_mov
            if bal >= 0:
                debit = bal
                credit = 0.0
            else:
                debit = 0.0
                credit = abs(bal)
        else:
            bal = opening + credit_mov - debit_mov
            if bal >= 0:
                credit = bal
                debit = 0.0
            else:
                credit = 0.0
                debit = abs(bal)
        debit_total += debit
        credit_total += credit
        rows.append(
            {
                "account_id": account.id,
                "account_number": account.account_number,
                "account_name": account.name,
                "group_name": group.name,
                "nature": group.nature,
                "debit": round(debit, 2),
                "credit": round(credit, 2),
            }
        )
    return {
        "as_of_date": as_of_date,
        "rows": rows,
        "total_debit": round(debit_total, 2),
        "total_credit": round(credit_total, 2),
    }


@router.get("/reports/financial-statements")
async def financial_statements(
    as_of_date: date | None = Query(default=None),
    group_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if as_of_date is None:
        as_of_date = date.today()
    accounts_stmt = (
        select(ChartOfAccount, AccountGroup)
        .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
        .where(ChartOfAccount.tenant_id == tenant.id)
    )
    if group_id is not None:
        accounts_stmt = accounts_stmt.where(ChartOfAccount.group_id == group_id)
    accounts_result = await db.execute(accounts_stmt)
    posted_lines = (
        await db.execute(
            select(VoucherLine, Voucher)
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .where(
                VoucherLine.tenant_id == tenant.id,
                Voucher.tenant_id == tenant.id,
                Voucher.status == "POSTED",
                Voucher.voucher_date <= as_of_date,
            )
        )
    ).all()
    movement: dict[int, dict[str, float]] = defaultdict(lambda: {"DEBIT": 0.0, "CREDIT": 0.0})
    for line, _voucher in posted_lines:
        movement[line.account_id][line.entry_type] += _to_float(line.amount)
    summary = {"Asset": 0.0, "Liability": 0.0, "Equity": 0.0, "Income": 0.0, "Expense": 0.0}
    for account, group in accounts_result.all():
        opening = _to_float(account.opening_balance)
        debit_mov = movement[account.id]["DEBIT"]
        credit_mov = movement[account.id]["CREDIT"]
        if account.normal_balance == "debit":
            bal = opening + debit_mov - credit_mov
        else:
            bal = opening + credit_mov - debit_mov
        summary[group.nature] = summary.get(group.nature, 0.0) + bal
    profit = summary.get("Income", 0.0) - summary.get("Expense", 0.0)
    return {
        "as_of_date": as_of_date,
        "group_id": group_id,
        "profit_and_loss": {
            "income": round(summary.get("Income", 0.0), 2),
            "expense": round(summary.get("Expense", 0.0), 2),
            "net_profit": round(profit, 2),
        },
        "balance_sheet": {
            "assets": round(summary.get("Asset", 0.0), 2),
            "liabilities": round(summary.get("Liability", 0.0), 2),
            "equity": round(summary.get("Equity", 0.0), 2),
        },
    }


@router.get("/reports/cash-flow-statement")
async def cash_flow_statement(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if from_date is None:
        from_date = date.today().replace(day=1)
    if to_date is None:
        to_date = date.today()

    vouchers = list(
        (
            await db.execute(
                select(Voucher)
                .where(
                    Voucher.tenant_id == tenant.id,
                    Voucher.status == "POSTED",
                    Voucher.voucher_date >= from_date,
                    Voucher.voucher_date <= to_date,
                )
                .order_by(Voucher.voucher_date.asc(), Voucher.id.asc())
            )
        ).scalars().all()
    )
    if not vouchers:
        return {
            "from_date": from_date,
            "to_date": to_date,
            "opening_cash_balance": 0.0,
            "closing_cash_balance": 0.0,
            "sections": {
                "operating": {"inflow": 0.0, "outflow": 0.0, "net": 0.0, "rows": []},
                "investing": {"inflow": 0.0, "outflow": 0.0, "net": 0.0, "rows": []},
                "financing": {"inflow": 0.0, "outflow": 0.0, "net": 0.0, "rows": []},
            },
            "totals": {"inflow": 0.0, "outflow": 0.0, "net_cash_flow": 0.0},
        }

    voucher_ids = [row.id for row in vouchers]
    lines = list(
        (
            await db.execute(
                select(VoucherLine)
                .where(
                    VoucherLine.tenant_id == tenant.id,
                    VoucherLine.voucher_id.in_(voucher_ids),
                )
                .order_by(VoucherLine.voucher_id.asc(), VoucherLine.id.asc())
            )
        ).scalars().all()
    )
    account_ids = sorted({line.account_id for line in lines})
    account_map: dict[int, tuple[ChartOfAccount, AccountGroup]] = {}
    if account_ids:
        account_rows = (
            await db.execute(
                select(ChartOfAccount, AccountGroup)
                .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
                .where(
                    ChartOfAccount.tenant_id == tenant.id,
                    ChartOfAccount.id.in_(account_ids),
                )
            )
        ).all()
        for account, group in account_rows:
            account_map[account.id] = (account, group)

    def _line_signed_amount(account: ChartOfAccount, line: VoucherLine) -> float:
        amount = _to_float(line.amount)
        if account.normal_balance == "debit":
            return amount if line.entry_type == "DEBIT" else -amount
        return amount if line.entry_type == "CREDIT" else -amount

    def _is_cash_account(account: ChartOfAccount, group: AccountGroup) -> bool:
        name = (account.name or "").lower()
        code = (group.code or "").lower()
        return (
            bool(account.is_bank_account)
            or bool(group.is_bank_group)
            or "cash" in name
            or "bank" in name
            or "cash" in code
            or "bank" in code
        )

    lines_by_voucher: dict[int, list[VoucherLine]] = defaultdict(list)
    for line in lines:
        lines_by_voucher[line.voucher_id].append(line)

    sections: dict[str, dict[str, float | list[dict[str, object]]]] = {
        "operating": {"inflow": 0.0, "outflow": 0.0, "rows": []},
        "investing": {"inflow": 0.0, "outflow": 0.0, "rows": []},
        "financing": {"inflow": 0.0, "outflow": 0.0, "rows": []},
    }

    opening_cash_balance = 0.0
    for account, group in account_map.values():
        if _is_cash_account(account, group):
            opening_cash_balance += _to_float(account.opening_balance)

    for voucher in vouchers:
        voucher_lines = lines_by_voucher.get(voucher.id, [])
        if not voucher_lines:
            continue
        cash_delta = 0.0
        non_cash_natures: set[str] = set()

        for line in voucher_lines:
            account_info = account_map.get(line.account_id)
            if not account_info:
                continue
            account, group = account_info
            signed = _line_signed_amount(account, line)
            if _is_cash_account(account, group):
                cash_delta += signed
            else:
                non_cash_natures.add((group.nature or "").lower())

        if abs(cash_delta) < 0.00001:
            continue

        section_key = "operating"
        if "asset" in non_cash_natures:
            section_key = "investing"
        elif "liability" in non_cash_natures or "equity" in non_cash_natures:
            section_key = "financing"

        inflow = max(cash_delta, 0.0)
        outflow = max(-cash_delta, 0.0)
        section = sections[section_key]
        section["inflow"] = float(section["inflow"]) + inflow
        section["outflow"] = float(section["outflow"]) + outflow
        cast_rows = section["rows"]
        assert isinstance(cast_rows, list)
        cast_rows.append(
            {
                "voucher_id": voucher.id,
                "voucher_number": voucher.voucher_number,
                "voucher_date": voucher.voucher_date,
                "description": voucher.description,
                "inflow": round(inflow, 2),
                "outflow": round(outflow, 2),
                "net": round(cash_delta, 2),
            }
        )

    total_inflow = 0.0
    total_outflow = 0.0
    for section_name in ("operating", "investing", "financing"):
        section = sections[section_name]
        section["inflow"] = round(float(section["inflow"]), 2)
        section["outflow"] = round(float(section["outflow"]), 2)
        section["net"] = round(float(section["inflow"]) - float(section["outflow"]), 2)
        total_inflow += float(section["inflow"])
        total_outflow += float(section["outflow"])

    net_cash_flow = round(total_inflow - total_outflow, 2)
    closing_cash_balance = round(opening_cash_balance + net_cash_flow, 2)
    return {
        "from_date": from_date,
        "to_date": to_date,
        "opening_cash_balance": round(opening_cash_balance, 2),
        "closing_cash_balance": closing_cash_balance,
        "sections": sections,
        "totals": {
            "inflow": round(total_inflow, 2),
            "outflow": round(total_outflow, 2),
            "net_cash_flow": net_cash_flow,
        },
    }


@router.get("/cash-forecast/scenarios", response_model=list[CashScenarioOut])
async def list_cash_forecast_scenarios(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    scenarios = list(
        (
            await db.execute(
                select(CashForecastScenario).where(CashForecastScenario.tenant_id == tenant.id).order_by(CashForecastScenario.id.desc())
            )
        ).scalars().all()
    )
    out: list[CashScenarioOut] = []
    for row in scenarios:
        lines_result = await db.execute(
            select(CashForecastLine).where(CashForecastLine.scenario_id == row.id).order_by(CashForecastLine.id)
        )
        out.append(
            CashScenarioOut(
                id=row.id,
                tenant_id=row.tenant_id,
                name=row.name,
                start_date=row.start_date,
                months=row.months,
                status=row.status,
                lines=list(lines_result.scalars().all()),
            )
        )
    return out


@router.post("/cash-forecast/scenarios", response_model=CashScenarioOut)
async def create_cash_forecast_scenario(
    body: CashScenarioBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = CashForecastScenario(
        tenant_id=tenant.id,
        name=body.name,
        start_date=body.start_date,
        months=max(1, min(body.months, 24)),
        status="DRAFT",
        created_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return CashScenarioOut(
        id=row.id,
        tenant_id=row.tenant_id,
        name=row.name,
        start_date=row.start_date,
        months=row.months,
        status=row.status,
        lines=[],
    )


@router.post("/cash-forecast/scenarios/{scenario_id}/generate", response_model=CashScenarioOut)
async def generate_cash_forecast(
    scenario_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    scenario = await db.get(CashForecastScenario, scenario_id)
    if not scenario or scenario.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Scenario not found")

    # clear old lines
    old_lines = list(
        (await db.execute(select(CashForecastLine).where(CashForecastLine.scenario_id == scenario.id))).scalars().all()
    )
    for line in old_lines:
        await db.delete(line)
    await db.flush()

    posted_vouchers = list(
        (
            await db.execute(
                select(Voucher).where(Voucher.tenant_id == tenant.id, Voucher.status == "POSTED")
            )
        ).scalars().all()
    )
    posted_amount = 0.0
    for voucher in posted_vouchers[-60:]:
        lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())
        posted_amount += sum(_to_float(line.amount) for line in lines if line.entry_type == "DEBIT")

    avg_monthly = posted_amount / 6.0 if posted_amount > 0 else 100000.0
    fx_open_total = (
        await db.execute(
            select(func.sum(FxReceipt.base_amount)).where(FxReceipt.tenant_id == tenant.id, FxReceipt.status == "OPEN")
        )
    ).scalar()
    fx_buffer = _to_float(fx_open_total)
    running = 0.0
    start = scenario.start_date
    for idx in range(scenario.months):
        month_date = start + timedelta(days=idx * 30)
        inflow = round(avg_monthly * (0.95 + (idx % 3) * 0.05), 2)
        outflow = round(avg_monthly * (0.85 + ((idx + 1) % 4) * 0.07), 2)
        if idx == 0 and fx_buffer > 0:
            inflow = round(inflow + fx_buffer, 2)
        net = round(inflow - outflow, 2)
        running = round(running + net, 2)
        db.add(
            CashForecastLine(
                tenant_id=tenant.id,
                scenario_id=scenario.id,
                month_label=month_date.strftime("%b-%Y"),
                inflow=str(inflow),
                outflow=str(outflow),
                net=str(net),
                cumulative=str(running),
            )
        )
    scenario.status = "GENERATED"
    await db.commit()
    await db.refresh(scenario)
    lines_result = await db.execute(
        select(CashForecastLine).where(CashForecastLine.scenario_id == scenario.id).order_by(CashForecastLine.id)
    )
    return CashScenarioOut(
        id=scenario.id,
        tenant_id=scenario.tenant_id,
        name=scenario.name,
        start_date=scenario.start_date,
        months=scenario.months,
        status=scenario.status,
        lines=list(lines_result.scalars().all()),
    )


@router.get("/cash-forecast/summary")
async def cash_forecast_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(CashForecastLine).join(CashForecastScenario, CashForecastLine.scenario_id == CashForecastScenario.id).where(
            CashForecastScenario.tenant_id == tenant.id
        )
    )
    lines = list(result.scalars().all())
    expected_in = sum(_to_float(line.inflow) for line in lines)
    expected_out = sum(_to_float(line.outflow) for line in lines)
    return {
        "expected_inflows": round(expected_in, 2),
        "expected_outflows": round(expected_out, 2),
        "net_cash_flow": round(expected_in - expected_out, 2),
        "scenarios_count": len(
            list((await db.execute(select(CashForecastScenario.id).where(CashForecastScenario.tenant_id == tenant.id))).all())
        ),
    }


@router.get("/fx-receipts", response_model=list[FxReceiptOut])
async def list_fx_receipts(
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(FxReceipt).where(FxReceipt.tenant_id == tenant.id).order_by(FxReceipt.id.desc())
    if status_filter:
        stmt = stmt.where(FxReceipt.status == status_filter.strip().upper())
    return list((await db.execute(stmt)).scalars().all())


@router.post("/fx-receipts", response_model=FxReceiptOut)
async def create_fx_receipt(
    body: FxReceiptBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    code = await next_tenant_code(
        db,
        model=FxReceipt,
        tenant_id=tenant.id,
        prefix="FXR-",
        width=4,
    )
    fc_amount = _to_float(body.fc_amount)
    rate = _to_float(body.rate_to_base) or 1.0
    base_amount = round(fc_amount * rate, 2)
    row = FxReceipt(
        tenant_id=tenant.id,
        receipt_no=code,
        receipt_date=body.receipt_date,
        source_ref=body.source_ref,
        currency=body.currency.upper(),
        fc_amount=str(fc_amount),
        rate_to_base=str(rate),
        base_amount=str(base_amount),
        settled_amount="0",
        status="OPEN",
        notes=body.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/fx-receipts/{receipt_id}/settle", response_model=FxReceiptOut)
async def settle_fx_receipt(
    receipt_id: int,
    body: FxSettleBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(FxReceipt, receipt_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="FX receipt not found")
    settle = _to_float(body.settle_amount)
    if settle <= 0:
        raise HTTPException(status_code=400, detail="Settlement amount must be greater than 0")
    current = _to_float(row.settled_amount)
    total = _to_float(row.base_amount)
    if current + settle > total:
        raise HTTPException(status_code=400, detail="Settlement exceeds outstanding amount")
    row.settled_amount = str(round(current + settle, 2))
    row.status = "SETTLED" if round(current + settle, 2) >= round(total, 2) else "PARTIAL"
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/fx-receipts/unsettled-summary")
async def unsettled_fx_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = list((await db.execute(select(FxReceipt).where(FxReceipt.tenant_id == tenant.id))).scalars().all())
    total_base = sum(_to_float(r.base_amount) for r in rows)
    total_settled = sum(_to_float(r.settled_amount) for r in rows)
    return {
        "total_base_amount": round(total_base, 2),
        "total_settled_amount": round(total_settled, 2),
        "total_unsettled_amount": round(total_base - total_settled, 2),
    }


@router.get("/multi-currency/revaluation-summary")
async def multi_currency_revaluation_summary(
    base_currency: str = Query(default="BDT"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    base_currency = base_currency.upper()
    receipts = list(
        (
            await db.execute(select(FxReceipt).where(FxReceipt.tenant_id == tenant.id, FxReceipt.status.in_(["OPEN", "PARTIAL"])))
        ).scalars().all()
    )
    rows = []
    total_old = 0.0
    total_new = 0.0
    for r in receipts:
        if r.currency.upper() == base_currency:
            latest_rate = 1.0
        else:
            latest = (
                await db.execute(
                    select(CurrencyExchangeRate)
                    .where(
                        CurrencyExchangeRate.tenant_id == tenant.id,
                        CurrencyExchangeRate.from_currency == r.currency.upper(),
                        CurrencyExchangeRate.to_currency == base_currency,
                        CurrencyExchangeRate.is_active.is_(True),
                    )
                    .order_by(CurrencyExchangeRate.effective_date.desc(), CurrencyExchangeRate.id.desc())
                    .limit(1)
                )
            ).scalars().first()
            latest_rate = _to_float(latest.exchange_rate if latest else r.rate_to_base)
        old_base = _to_float(r.base_amount)
        new_base = round(_to_float(r.fc_amount) * latest_rate, 2)
        total_old += old_base
        total_new += new_base
        rows.append(
            {
                "receipt_id": r.id,
                "receipt_no": r.receipt_no,
                "currency": r.currency,
                "fc_amount": round(_to_float(r.fc_amount), 2),
                "old_rate": round(_to_float(r.rate_to_base), 6),
                "latest_rate": round(latest_rate, 6),
                "old_base_amount": round(old_base, 2),
                "new_base_amount": round(new_base, 2),
                "gain_loss": round(new_base - old_base, 2),
            }
        )
    return {
        "rows": rows,
        "total_old_base_amount": round(total_old, 2),
        "total_new_base_amount": round(total_new, 2),
        "total_gain_loss": round(total_new - total_old, 2),
    }


@router.get("/bills", response_model=list[BillOut])
async def list_bills(
    bill_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(OutstandingBill).where(OutstandingBill.tenant_id == tenant.id).order_by(OutstandingBill.id.desc())
    if bill_type:
        stmt = stmt.where(OutstandingBill.bill_type == bill_type.strip().upper())
    if status_filter:
        stmt = stmt.where(OutstandingBill.status == status_filter.strip().upper())
    return list((await db.execute(stmt)).scalars().all())


@router.post("/bills", response_model=BillOut)
async def create_bill(
    body: BillBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    prefix = "AP-" if body.bill_type == "PAYABLE" else "AR-"
    code = await next_tenant_code(
        db,
        model=OutstandingBill,
        tenant_id=tenant.id,
        prefix=prefix,
        width=4,
    )
    amount = _to_float(body.amount)
    paid = _to_float(body.paid_amount)
    status_value = "PAID" if paid >= amount and amount > 0 else "OPEN"
    row = OutstandingBill(
        tenant_id=tenant.id,
        bill_no=code,
        party_name=body.party_name,
        bill_type=body.bill_type,
        bill_date=body.bill_date,
        due_date=body.due_date,
        amount=str(amount),
        paid_amount=str(paid),
        currency=body.currency.upper(),
        status=status_value,
        notes=body.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/purchase-workflow/create-payable-from-po/{po_id}", response_model=BillOut)
async def create_payable_from_purchase_order(
    po_id: int,
    body: PurchasePayableFromPoBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    po = await db.get(PurchaseOrder, po_id)
    if not po or po.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if po.status not in {"APPROVED", "PARTIALLY_RECEIVED", "CLOSED"}:
        raise HTTPException(status_code=400, detail="Purchase order must be approved or received before AP bill creation")

    existing = (
        await db.execute(
            select(OutstandingBill).where(
                OutstandingBill.tenant_id == tenant.id,
                OutstandingBill.bill_type == "PAYABLE",
                OutstandingBill.notes.is_not(None),
            )
        )
    ).scalars().all()
    marker = f"PO:{po.po_code}"
    for bill in existing:
        if bill.notes and marker in bill.notes:
            raise HTTPException(status_code=400, detail="Payable already created for this purchase order")

    po_items = list(
        (await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id))).scalars().all()
    )
    if not po_items:
        raise HTTPException(status_code=400, detail="Purchase order has no items")

    total_amount = 0.0
    for item in po_items:
        total_amount += _to_float(item.quantity) * _to_float(item.unit_price)
    total_amount = round(total_amount, 2)
    if total_amount <= 0:
        raise HTTPException(status_code=400, detail="Purchase order total is zero")

    # If there is no GRN linked yet, bill can still be created but users get a clear marker in notes.
    grn_count = (
        await db.execute(
            select(func.count(GoodsReceiving.id)).where(
                GoodsReceiving.tenant_id == tenant.id,
                GoodsReceiving.purchase_order_id == po.id,
            )
        )
    ).scalar() or 0

    code = await next_tenant_code(
        db,
        model=OutstandingBill,
        tenant_id=tenant.id,
        prefix="AP-",
        width=4,
    )
    due = date.today() + timedelta(days=max(body.due_in_days, 0))
    combined_notes = f"{body.notes or ''} | PO:{po.po_code} | GRN_COUNT:{grn_count}".strip(" |")

    row = OutstandingBill(
        tenant_id=tenant.id,
        bill_no=code,
        party_name=po.supplier_name,
        bill_type="PAYABLE",
        bill_date=date.today(),
        due_date=due,
        amount=str(total_amount),
        paid_amount="0",
        currency=body.currency.upper(),
        status="OPEN",
        notes=combined_notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/purchase-workflow/create-payable-from-grn/{grn_id}", response_model=BillOut)
async def create_payable_from_goods_receiving(
    grn_id: int,
    body: PurchasePayableFromPoBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    grn = await db.get(GoodsReceiving, grn_id)
    if not grn or grn.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="GRN not found")
    if grn.status != "RECEIVED":
        raise HTTPException(status_code=400, detail="GRN must be received before AP bill creation")
    if not grn.purchase_order_id:
        raise HTTPException(status_code=400, detail="GRN is not linked to a purchase order")

    po = await db.get(PurchaseOrder, grn.purchase_order_id)
    if not po or po.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Linked purchase order not found")

    existing = (
        await db.execute(
            select(OutstandingBill).where(
                OutstandingBill.tenant_id == tenant.id,
                OutstandingBill.bill_type == "PAYABLE",
                OutstandingBill.notes.is_not(None),
            )
        )
    ).scalars().all()
    marker = f"GRN:{grn.grn_code}"
    for bill in existing:
        if bill.notes and marker in bill.notes:
            raise HTTPException(status_code=400, detail="Payable already created for this GRN")

    po_items = list(
        (await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id))).scalars().all()
    )
    if not po_items:
        raise HTTPException(status_code=400, detail="Linked purchase order has no items")
    po_price_map = {line.item_id: _to_float(line.unit_price) for line in po_items}

    grn_items = list(
        (await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == grn.id))).scalars().all()
    )
    if not grn_items:
        raise HTTPException(status_code=400, detail="GRN has no items")

    total_amount = 0.0
    for line in grn_items:
        unit_price = po_price_map.get(line.item_id, 0.0)
        total_amount += _to_float(line.quantity) * unit_price
    total_amount = round(total_amount, 2)
    if total_amount <= 0:
        raise HTTPException(status_code=400, detail="GRN payable amount is zero")

    code = await next_tenant_code(
        db,
        model=OutstandingBill,
        tenant_id=tenant.id,
        prefix="AP-",
        width=4,
    )
    due = date.today() + timedelta(days=max(body.due_in_days, 0))
    combined_notes = f"{body.notes or ''} | PO:{po.po_code} | GRN:{grn.grn_code}".strip(" |")

    row = OutstandingBill(
        tenant_id=tenant.id,
        bill_no=code,
        party_name=po.supplier_name,
        bill_type="PAYABLE",
        bill_date=date.today(),
        due_date=due,
        amount=str(total_amount),
        paid_amount="0",
        currency=body.currency.upper(),
        status="OPEN",
        notes=combined_notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/bills/{bill_id}/settle", response_model=BillOut)
async def settle_bill(
    bill_id: int,
    body: dict[str, str],
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(OutstandingBill, bill_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Bill not found")
    settle = _to_float(body.get("settle_amount"))
    if settle <= 0:
        raise HTTPException(status_code=400, detail="Settlement amount must be greater than 0")
    current_paid = _to_float(row.paid_amount)
    total = _to_float(row.amount)
    if current_paid + settle > total:
        raise HTTPException(status_code=400, detail="Settlement exceeds bill amount")
    row.paid_amount = str(round(current_paid + settle, 2))
    row.status = "PAID" if round(current_paid + settle, 2) >= round(total, 2) else "PARTIAL"
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/bills/aging")
async def bills_aging(
    bill_type: str = Query(default="RECEIVABLE"),
    as_of_date: date | None = Query(default=None),
    party_name: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    as_of = as_of_date or date.today()
    stmt = select(OutstandingBill).where(
        OutstandingBill.tenant_id == tenant.id,
        OutstandingBill.bill_type == bill_type.strip().upper(),
    )
    if party_name:
        stmt = stmt.where(func.lower(func.coalesce(OutstandingBill.party_name, "")).like(f"%{party_name.strip().lower()}%"))
    rows = list(((await db.execute(stmt)).scalars().all()))
    buckets = {"current": 0.0, "1_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    lines = []
    for row in rows:
        outstanding = max(_to_float(row.amount) - _to_float(row.paid_amount), 0.0)
        overdue_days = (as_of - row.due_date).days
        if outstanding <= 0:
            bucket = "current"
        elif overdue_days <= 0:
            bucket = "current"
        elif overdue_days <= 30:
            bucket = "1_30"
        elif overdue_days <= 60:
            bucket = "31_60"
        elif overdue_days <= 90:
            bucket = "61_90"
        else:
            bucket = "90_plus"
        buckets[bucket] += outstanding
        lines.append(
            {
                "bill_id": row.id,
                "bill_no": row.bill_no,
                "party_name": row.party_name,
                "due_date": row.due_date,
                "outstanding_amount": round(outstanding, 2),
                "overdue_days": max(overdue_days, 0),
                "bucket": bucket,
            }
        )
    return {"as_of_date": as_of, "bill_type": bill_type.upper(), "buckets": {k: round(v, 2) for k, v in buckets.items()}, "rows": lines}


@router.get("/cost-centers", response_model=list[CostCenterOut])
async def list_cost_centers(
    active_only: bool = Query(default=True),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(CostCenter).where(CostCenter.tenant_id == tenant.id).order_by(CostCenter.center_code)
    if active_only:
        stmt = stmt.where(CostCenter.is_active.is_(True))
    return list((await db.execute(stmt)).scalars().all())


@router.post("/cost-centers", response_model=CostCenterOut)
async def create_cost_center(
    body: CostCenterBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    code = await next_tenant_code(
        db,
        model=CostCenter,
        tenant_id=tenant.id,
        prefix="CC-",
        width=4,
    )
    row = CostCenter(
        tenant_id=tenant.id,
        center_code=code,
        name=body.name,
        department=body.department,
        is_active=body.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/cost-centers/{center_id}", response_model=CostCenterOut)
async def update_cost_center(
    center_id: int,
    body: CostCenterBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(CostCenter, center_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Cost center not found")
    for key, value in body.model_dump().items():
        if key == "center_code" and value is None:
            continue
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/cost-centers/dashboard")
async def cost_center_dashboard(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    centers = list((await db.execute(select(CostCenter).where(CostCenter.tenant_id == tenant.id))).scalars().all())
    out = []
    for c in centers:
        lines = list((await db.execute(select(VoucherLine).where(VoucherLine.cost_center_id == c.id))).scalars().all())
        debit = sum(_to_float(l.amount) for l in lines if l.entry_type == "DEBIT")
        credit = sum(_to_float(l.amount) for l in lines if l.entry_type == "CREDIT")
        out.append(
            {
                "cost_center_id": c.id,
                "center_code": c.center_code,
                "name": c.name,
                "department": c.department,
                "debit_total": round(debit, 2),
                "credit_total": round(credit, 2),
                "net": round(debit - credit, 2),
            }
        )
    return out


@router.get("/budgets", response_model=list[BudgetOut])
async def list_budgets(
    fiscal_year: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(Budget).where(Budget.tenant_id == tenant.id).order_by(Budget.id.desc())
    if fiscal_year:
        stmt = stmt.where(Budget.fiscal_year == fiscal_year)
    rows = list((await db.execute(stmt)).scalars().all())
    return [await _budget_out(db, row) for row in rows]


@router.post("/budgets", response_model=BudgetOut)
async def create_budget(
    body: BudgetBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = Budget(
        tenant_id=tenant.id,
        budget_name=body.budget_name,
        fiscal_year=body.fiscal_year,
        status=body.status,
        created_by=user.id,
    )
    db.add(row)
    await db.flush()
    for line in body.lines:
        db.add(
            BudgetLine(
                tenant_id=tenant.id,
                budget_id=row.id,
                cost_center_id=line.cost_center_id,
                account_id=line.account_id,
                period_month=line.period_month,
                amount=line.amount,
                notes=line.notes,
            )
        )
    await db.commit()
    await db.refresh(row)
    return await _budget_out(db, row)


@router.get("/budgets/{budget_id}/vs-actual")
async def budget_vs_actual(
    budget_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    budget = await db.get(Budget, budget_id)
    if not budget or budget.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Budget not found")
    lines = list((await db.execute(select(BudgetLine).where(BudgetLine.budget_id == budget.id))).scalars().all())
    rows = []
    total_budget = 0.0
    total_actual = 0.0
    for line in lines:
        budget_amount = _to_float(line.amount)
        posted_lines_query = (
            select(VoucherLine, Voucher)
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .where(VoucherLine.tenant_id == tenant.id, Voucher.status == "POSTED")
        )
        posted_rows = list((await db.execute(posted_lines_query)).all())
        actual_amount = 0.0
        for voucher_line, _voucher in posted_rows:
            if line.account_id is not None and voucher_line.account_id != line.account_id:
                continue
            if line.cost_center_id is not None and voucher_line.cost_center_id != line.cost_center_id:
                continue
            actual_amount += _to_float(voucher_line.amount)
        total_budget += budget_amount
        total_actual += actual_amount
        rows.append(
            {
                "line_id": line.id,
                "period_month": line.period_month,
                "account_id": line.account_id,
                "cost_center_id": line.cost_center_id,
                "budget_amount": round(budget_amount, 2),
                "actual_amount": round(actual_amount, 2),
                "variance": round(actual_amount - budget_amount, 2),
                "variance_pct": round(((actual_amount - budget_amount) / budget_amount * 100) if budget_amount > 0 else 0, 2),
            }
        )
    return {
        "budget_id": budget.id,
        "budget_name": budget.budget_name,
        "fiscal_year": budget.fiscal_year,
        "rows": rows,
        "total_budget": round(total_budget, 2),
        "total_actual": round(total_actual, 2),
        "total_variance": round(total_actual - total_budget, 2),
    }


@router.get("/banking/accounts", response_model=list[BankAccountOut])
async def list_bank_accounts(
    active_only: bool = Query(default=True),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(BankAccount).where(BankAccount.tenant_id == tenant.id).order_by(BankAccount.id.desc())
    if active_only:
        stmt = stmt.where(BankAccount.is_active.is_(True))
    return list((await db.execute(stmt)).scalars().all())


@router.post("/banking/accounts", response_model=BankAccountOut)
async def create_bank_account(
    body: BankAccountBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = BankAccount(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/banking/accounts/{account_id}", response_model=BankAccountOut)
async def update_bank_account(
    account_id: int,
    body: BankAccountBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(BankAccount, account_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Bank account not found")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/banking/reconciliation", response_model=list[BankReconciliationOut])
async def list_bank_reconciliations(
    bank_account_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(BankReconciliation).where(BankReconciliation.tenant_id == tenant.id).order_by(BankReconciliation.id.desc())
    if bank_account_id is not None:
        stmt = stmt.where(BankReconciliation.bank_account_id == bank_account_id)
    return list((await db.execute(stmt)).scalars().all())


@router.post("/banking/reconciliation", response_model=BankReconciliationOut)
async def create_bank_reconciliation(
    body: BankReconciliationBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bank = await db.get(BankAccount, body.bank_account_id)
    if not bank or bank.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Bank account not found")
    book_balance = _to_float(bank.current_balance)
    statement_balance = _to_float(body.statement_balance)
    diff = round(statement_balance - book_balance, 2)
    row = BankReconciliation(
        tenant_id=tenant.id,
        bank_account_id=body.bank_account_id,
        statement_date=body.statement_date,
        statement_balance=str(statement_balance),
        book_balance=str(book_balance),
        difference_amount=str(diff),
        status="MATCHED" if abs(diff) < 0.0001 else "OPEN",
        notes=body.notes,
        created_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/banking/reconciliation/{recon_id}/resolve", response_model=BankReconciliationOut)
async def resolve_bank_reconciliation(
    recon_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(BankReconciliation, recon_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    if row.is_finalized:
        raise HTTPException(status_code=400, detail="Reconciliation is finalized and cannot be changed")
    row.status = "MATCHED"
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/banking/reconciliation/{recon_id}/finalize", response_model=BankReconciliationOut)
async def finalize_bank_reconciliation(
    recon_id: int,
    body: BankReconciliationFinalizeBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    recon = await db.get(BankReconciliation, recon_id)
    if not recon or recon.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    if recon.is_finalized:
        return recon
    recon.is_finalized = True
    recon.finalized_at = datetime.utcnow()
    recon.finalized_by = user.id
    recon.finalize_reason = body.reason
    await db.commit()
    await db.refresh(recon)
    return recon


@router.get("/banking/reconciliation/{recon_id}/match-logs", response_model=list[BankStatementMatchLogOut])
async def list_bank_statement_match_logs(
    recon_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    recon = await db.get(BankReconciliation, recon_id)
    if not recon or recon.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    return list(
        (
            await db.execute(
                select(BankStatementMatchLog)
                .where(BankStatementMatchLog.reconciliation_id == recon_id)
                .order_by(BankStatementMatchLog.id.desc())
            )
        ).scalars().all()
    )


@router.get("/banking/reconciliation/{recon_id}/match-logs/export-csv")
async def export_bank_statement_match_logs_csv(
    recon_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    recon = await db.get(BankReconciliation, recon_id)
    if not recon or recon.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    logs = list(
        (
            await db.execute(
                select(BankStatementMatchLog)
                .where(BankStatementMatchLog.reconciliation_id == recon_id)
                .order_by(BankStatementMatchLog.id.asc())
            )
        ).scalars().all()
    )
    sio = StringIO()
    writer = csv.writer(sio)
    writer.writerow(["id", "statement_line_id", "action", "payment_run_id", "created_by", "created_at", "note"])
    for row in logs:
        writer.writerow(
            [
                row.id,
                row.statement_line_id,
                row.action,
                row.payment_run_id or "",
                row.created_by or "",
                row.created_at.isoformat(),
                row.note or "",
            ]
        )
    csv_data = sio.getvalue()
    filename = f"reconciliation_{recon_id}_match_logs.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/banking/reconciliation/{recon_id}/statement-lines", response_model=list[BankStatementLineOut])
async def list_statement_lines(
    recon_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    recon = await db.get(BankReconciliation, recon_id)
    if not recon or recon.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    return list(
        (
            await db.execute(
                select(BankStatementLine)
                .where(BankStatementLine.reconciliation_id == recon_id)
                .order_by(BankStatementLine.transaction_date, BankStatementLine.id)
            )
        ).scalars().all()
    )


@router.get("/banking/reconciliation/{recon_id}/summary")
async def reconciliation_summary(
    recon_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    recon = await db.get(BankReconciliation, recon_id)
    if not recon or recon.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    lines = list(
        (
            await db.execute(
                select(BankStatementLine).where(BankStatementLine.reconciliation_id == recon_id)
            )
        ).scalars().all()
    )
    matched_lines = [line for line in lines if line.matched_status == "MATCHED"]
    unmatched_lines = [line for line in lines if line.matched_status != "MATCHED"]

    def line_amount(row: BankStatementLine) -> float:
        return max(_to_float(row.debit_amount), _to_float(row.credit_amount))

    matched_amount = sum(line_amount(line) for line in matched_lines)
    unmatched_amount = sum(line_amount(line) for line in unmatched_lines)
    return {
        "reconciliation_id": recon_id,
        "line_count": len(lines),
        "matched_count": len(matched_lines),
        "unmatched_count": len(unmatched_lines),
        "matched_amount": round(matched_amount, 2),
        "unmatched_amount": round(unmatched_amount, 2),
        "statement_balance": round(_to_float(recon.statement_balance), 2),
        "book_balance": round(_to_float(recon.book_balance), 2),
        "difference_amount": round(_to_float(recon.difference_amount), 2),
    }


@router.post("/banking/reconciliation/{recon_id}/statement-lines", response_model=list[BankStatementLineOut])
async def import_statement_lines(
    recon_id: int,
    body: BankStatementLinesBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    recon = await db.get(BankReconciliation, recon_id)
    if not recon or recon.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    if recon.is_finalized:
        raise HTTPException(status_code=400, detail="Reconciliation is finalized and cannot be changed")
    if not body.lines:
        raise HTTPException(status_code=400, detail="At least one statement line is required")
    inserted: list[BankStatementLine] = []
    for line in body.lines:
        row = BankStatementLine(
            tenant_id=tenant.id,
            reconciliation_id=recon_id,
            transaction_date=line.transaction_date,
            description=line.description,
            reference=line.reference,
            debit_amount=str(_to_float(line.debit_amount)),
            credit_amount=str(_to_float(line.credit_amount)),
            running_balance=line.running_balance,
            matched_status="UNMATCHED",
        )
        db.add(row)
        inserted.append(row)
    await db.commit()
    for row in inserted:
        await db.refresh(row)
    return inserted


@router.post("/banking/reconciliation/{recon_id}/statement-lines/import-csv", response_model=list[BankStatementLineOut])
async def import_statement_lines_csv(
    recon_id: int,
    body: BankStatementCsvBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    recon = await db.get(BankReconciliation, recon_id)
    if not recon or recon.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    if recon.is_finalized:
        raise HTTPException(status_code=400, detail="Reconciliation is finalized and cannot be changed")
    text = (body.csv_text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="CSV text is required")
    reader = csv.DictReader(StringIO(text))
    required = {"transaction_date", "debit_amount", "credit_amount"}
    if not required.issubset(set(reader.fieldnames or [])):
        raise HTTPException(
            status_code=400,
            detail="CSV headers required: transaction_date,debit_amount,credit_amount (+ optional description,reference,running_balance)",
        )
    inserted: list[BankStatementLine] = []
    for row in reader:
        tx_raw = (row.get("transaction_date") or "").strip()
        try:
            tx_date = date.fromisoformat(tx_raw)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid transaction_date: {tx_raw}") from exc
        entity = BankStatementLine(
            tenant_id=tenant.id,
            reconciliation_id=recon_id,
            transaction_date=tx_date,
            description=(row.get("description") or "").strip() or None,
            reference=(row.get("reference") or "").strip() or None,
            debit_amount=str(_to_float(row.get("debit_amount"))),
            credit_amount=str(_to_float(row.get("credit_amount"))),
            running_balance=(row.get("running_balance") or "").strip() or None,
            matched_status="UNMATCHED",
        )
        db.add(entity)
        inserted.append(entity)
    await db.commit()
    for entity in inserted:
        await db.refresh(entity)
    return inserted


@router.post("/banking/reconciliation/{recon_id}/statement-lines/{line_id}/match", response_model=BankStatementLineOut)
async def manual_match_statement_line(
    recon_id: int,
    line_id: int,
    body: ManualStatementMatchBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    recon = await db.get(BankReconciliation, recon_id)
    if not recon or recon.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    if recon.is_finalized:
        raise HTTPException(status_code=400, detail="Reconciliation is finalized and cannot be changed")
    line = await db.get(BankStatementLine, line_id)
    if not line or line.tenant_id != tenant.id or line.reconciliation_id != recon_id:
        raise HTTPException(status_code=404, detail="Statement line not found")
    run = await db.get(PaymentRun, body.payment_run_id)
    if not run or run.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payment run not found")
    if run.status != "EXECUTED":
        raise HTTPException(status_code=400, detail="Only executed payment runs can be matched")
    if run.bank_account_id != recon.bank_account_id:
        raise HTTPException(status_code=400, detail="Payment run is for a different bank account")
    run_already_matched = (
        await db.execute(
            select(BankStatementLine).where(
                BankStatementLine.reconciliation_id == recon_id,
                BankStatementLine.matched_payment_run_id == run.id,
                BankStatementLine.id != line.id,
                BankStatementLine.matched_status == "MATCHED",
            )
        )
    ).scalars().first()
    if run_already_matched:
        raise HTTPException(status_code=400, detail="This payment run is already matched with another statement line")
    line.matched_payment_run_id = run.id
    line.matched_status = "MATCHED"
    db.add(
        BankStatementMatchLog(
            tenant_id=tenant.id,
            reconciliation_id=recon_id,
            statement_line_id=line.id,
            action="MATCH",
            payment_run_id=run.id,
            note="Manual match",
            created_by=user.id,
        )
    )
    await db.commit()
    await db.refresh(line)
    return line


@router.post("/banking/reconciliation/{recon_id}/statement-lines/{line_id}/unmatch", response_model=BankStatementLineOut)
async def manual_unmatch_statement_line(
    recon_id: int,
    line_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    line = await db.get(BankStatementLine, line_id)
    if not line or line.tenant_id != tenant.id or line.reconciliation_id != recon_id:
        raise HTTPException(status_code=404, detail="Statement line not found")
    recon = await db.get(BankReconciliation, recon_id)
    if not recon or recon.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    if recon.is_finalized:
        raise HTTPException(status_code=400, detail="Reconciliation is finalized and cannot be changed")
    old_payment_run_id = line.matched_payment_run_id
    line.matched_payment_run_id = None
    line.matched_status = "UNMATCHED"
    db.add(
        BankStatementMatchLog(
            tenant_id=tenant.id,
            reconciliation_id=recon_id,
            statement_line_id=line.id,
            action="UNMATCH",
            payment_run_id=old_payment_run_id,
            note="Manual unmatch",
            created_by=user.id,
        )
    )
    await db.commit()
    await db.refresh(line)
    return line


@router.post("/banking/reconciliation/{recon_id}/auto-match")
async def auto_match_statement_lines(
    recon_id: int,
    tolerance: float = Query(default=1.0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    recon = await db.get(BankReconciliation, recon_id)
    if not recon or recon.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    if recon.is_finalized:
        raise HTTPException(status_code=400, detail="Reconciliation is finalized and cannot be changed")
    lines = list(
        (
            await db.execute(
                select(BankStatementLine).where(
                    BankStatementLine.reconciliation_id == recon_id,
                    BankStatementLine.matched_status != "MATCHED",
                )
            )
        ).scalars().all()
    )
    runs = list(
        (
            await db.execute(
                select(PaymentRun).where(
                    PaymentRun.tenant_id == tenant.id,
                    PaymentRun.bank_account_id == recon.bank_account_id,
                    PaymentRun.status == "EXECUTED",
                )
            )
        ).scalars().all()
    )
    used_run_ids = {
        rid
        for rid in (
            await db.execute(
                select(BankStatementLine.matched_payment_run_id).where(
                    BankStatementLine.reconciliation_id == recon_id,
                    BankStatementLine.matched_payment_run_id.is_not(None),
                )
            )
        ).scalars().all()
        if rid is not None
    }
    matched = 0
    for line in lines:
        line_amount = round(max(_to_float(line.debit_amount), _to_float(line.credit_amount)), 2)
        if line_amount <= 0:
            continue
        candidate = None
        for run in runs:
            if run.id in used_run_ids:
                continue
            run_amount = round(_to_float(run.total_amount), 2)
            day_gap = abs((line.transaction_date - run.run_date).days)
            if abs(run_amount - line_amount) <= tolerance and day_gap <= 7:
                candidate = run
                break
        if candidate:
            line.matched_payment_run_id = candidate.id
            line.matched_status = "MATCHED"
            db.add(
                BankStatementMatchLog(
                    tenant_id=tenant.id,
                    reconciliation_id=recon_id,
                    statement_line_id=line.id,
                    action="AUTO_MATCH",
                    payment_run_id=candidate.id,
                    note="Auto match by amount/date tolerance",
                    created_by=user.id,
                )
            )
            used_run_ids.add(candidate.id)
            matched += 1
    await db.commit()
    if matched > 0 and abs(_to_float(recon.difference_amount)) < 0.0001:
        recon.status = "MATCHED"
        await db.commit()
    return {"matched_count": matched, "remaining_unmatched": len(lines) - matched}


@router.get("/banking/payment-runs", response_model=list[PaymentRunOut])
async def list_payment_runs(
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(PaymentRun).where(PaymentRun.tenant_id == tenant.id).order_by(PaymentRun.id.desc())
    if status_filter:
        stmt = stmt.where(PaymentRun.status == status_filter.strip().upper())
    runs = list((await db.execute(stmt)).scalars().all())
    return [await _payment_run_out(db, run) for run in runs]


@router.post("/banking/payment-runs", response_model=PaymentRunOut)
async def create_payment_run(
    body: PaymentRunBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one payment item is required")
    if body.bank_account_id is not None:
        bank = await db.get(BankAccount, body.bank_account_id)
        if not bank or bank.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Bank account not found")
    code = await next_tenant_code(
        db,
        model=PaymentRun,
        tenant_id=tenant.id,
        prefix="PR-",
        width=4,
    )
    total = sum(_to_float(item.amount) for item in body.items)
    run = PaymentRun(
        tenant_id=tenant.id,
        run_code=code,
        run_date=body.run_date,
        bank_account_id=body.bank_account_id,
        status="DRAFT",
        total_amount=str(round(total, 2)),
        remarks=body.remarks,
        created_by=user.id,
    )
    db.add(run)
    await db.flush()
    for item in body.items:
        amount_value = round(_to_float(item.amount), 2)
        if amount_value <= 0:
            raise HTTPException(status_code=400, detail="Payment run item amount must be greater than zero")
        if item.bill_id is not None:
            bill = await db.get(OutstandingBill, item.bill_id)
            if not bill or bill.tenant_id != tenant.id:
                raise HTTPException(status_code=404, detail=f"Bill not found: {item.bill_id}")
            outstanding = round(_to_float(bill.amount) - _to_float(bill.paid_amount), 2)
            if outstanding <= 0:
                raise HTTPException(status_code=400, detail=f"Bill has no outstanding balance: {bill.bill_no}")
            if amount_value > outstanding:
                raise HTTPException(
                    status_code=400,
                    detail=f"Payment amount exceeds outstanding balance for bill: {bill.bill_no}",
                )
        db.add(
            PaymentRunItem(
                tenant_id=tenant.id,
                payment_run_id=run.id,
                bill_id=item.bill_id,
                party_name=item.party_name,
                amount=str(amount_value),
                status="PENDING",
                reference=item.reference,
            )
        )
    await db.commit()
    await db.refresh(run)
    return await _payment_run_out(db, run)


@router.post("/banking/payment-runs/{run_id}/execute", response_model=PaymentRunOut)
async def execute_payment_run(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    run = await db.get(PaymentRun, run_id)
    if not run or run.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payment run not found")
    if run.status == "EXECUTED":
        return await _payment_run_out(db, run)
    if run.status != "PROCESSED":
        raise HTTPException(status_code=400, detail="Only processed payment runs can be executed")
    items = list((await db.execute(select(PaymentRunItem).where(PaymentRunItem.payment_run_id == run.id))).scalars().all())
    if not items:
        raise HTTPException(status_code=400, detail="Payment run has no items")
    bank: BankAccount | None = None
    if run.bank_account_id:
        bank = await db.get(BankAccount, run.bank_account_id)
        if not bank or bank.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Linked bank account not found")

    # Auto-voucher posting for payment run (debit AP clearing, credit bank GL).
    if bank and bank.gl_account_id and run.executed_voucher_id is None:
        open_period = (
            await db.execute(
                select(AccountingPeriod).where(
                    AccountingPeriod.tenant_id == tenant.id,
                    AccountingPeriod.is_closed.is_(False),
                    AccountingPeriod.start_date <= run.run_date,
                    AccountingPeriod.end_date >= run.run_date,
                )
            )
        ).scalars().first()
        if not open_period:
            raise HTTPException(status_code=400, detail="No open accounting period for this payment run date")

        bank_gl = await db.get(ChartOfAccount, bank.gl_account_id)
        if not bank_gl or bank_gl.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Bank GL account is missing or invalid")
        party_totals: dict[str, float] = defaultdict(float)
        for item in items:
            party = (item.party_name or "").strip() or "Unknown Supplier"
            party_totals[party] += _to_float(item.amount)

        voucher = Voucher(
            tenant_id=tenant.id,
            voucher_number=await next_tenant_code(
                db,
                model=Voucher,
                tenant_id=tenant.id,
                prefix="VCH-",
                width=4,
            ),
            voucher_type="PAYMENT",
            voucher_date=run.run_date,
            status="POSTED",
            description=f"Auto payment voucher for {run.run_code}",
            reference=run.run_code,
            created_by=user.id,
        )
        db.add(voucher)
        await db.flush()

        total_amount = round(_to_float(run.total_amount), 2)
        for party_name, amount in party_totals.items():
            rounded_amount = round(amount, 2)
            if rounded_amount <= 0:
                continue
            supplier_ap = await _find_or_create_supplier_ap_account(db, tenant.id, party_name)
            db.add(
                VoucherLine(
                    tenant_id=tenant.id,
                    voucher_id=voucher.id,
                    account_id=supplier_ap.id,
                    cost_center_id=None,
                    entry_type="DEBIT",
                    amount=str(rounded_amount),
                    notes=f"Payment run {run.run_code} - {party_name}",
                )
            )
            _apply_voucher_impact(supplier_ap, "DEBIT", rounded_amount)

        credit_line = VoucherLine(
            tenant_id=tenant.id,
            voucher_id=voucher.id,
            account_id=bank_gl.id,
            cost_center_id=None,
            entry_type="CREDIT",
            amount=str(total_amount),
            notes=f"Payment run {run.run_code}",
        )
        db.add(credit_line)
        _apply_voucher_impact(bank_gl, "CREDIT", total_amount)
        run.executed_voucher_id = voucher.id
    for item in items:
        item.status = "PAID"
        if item.bill_id:
            bill = await db.get(OutstandingBill, item.bill_id)
            if bill and bill.tenant_id == tenant.id:
                paid = _to_float(bill.paid_amount) + _to_float(item.amount)
                total = _to_float(bill.amount)
                bill.paid_amount = str(round(min(paid, total), 2))
                bill.status = "PAID" if paid >= total else "PARTIAL"
    if bank and bank.tenant_id == tenant.id:
        bank.current_balance = str(round(_to_float(bank.current_balance) - _to_float(run.total_amount), 2))
    run.status = "EXECUTED"
    await db.commit()
    await db.refresh(run)
    return await _payment_run_out(db, run)


@router.get("/banking/payment-runs/{run_id}/advice")
async def payment_run_advice(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    run = await db.get(PaymentRun, run_id)
    if not run or run.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payment run not found")
    bank_name = None
    account_name = None
    if run.bank_account_id:
        bank = await db.get(BankAccount, run.bank_account_id)
        if bank and bank.tenant_id == tenant.id:
            bank_name = bank.bank_name
            account_name = bank.account_name
    items = list((await db.execute(select(PaymentRunItem).where(PaymentRunItem.payment_run_id == run.id))).scalars().all())
    output = []
    for item in items:
        output.append(
            {
                "item_id": item.id,
                "party_name": item.party_name,
                "reference": item.reference,
                "amount": round(_to_float(item.amount), 2),
                "status": item.status,
            }
        )
    return {
        "header": {
            "run_id": run.id,
            "run_code": run.run_code,
            "run_date": run.run_date,
            "status": run.status,
            "bank_name": bank_name,
            "bank_account_name": account_name,
            "executed_voucher_id": run.executed_voucher_id,
        },
        "items": output,
        "totals": {
            "item_count": len(output),
            "total_amount": round(_to_float(run.total_amount), 2),
        },
    }


@router.get("/purchase-workflow/ap-overview")
async def purchase_ap_overview(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    payables = list(
        (await db.execute(select(OutstandingBill).where(OutstandingBill.tenant_id == tenant.id, OutstandingBill.bill_type == "PAYABLE"))).scalars().all()
    )
    open_payables = [p for p in payables if p.status in {"OPEN", "PARTIAL"}]
    total_open = sum(max(_to_float(p.amount) - _to_float(p.paid_amount), 0) for p in open_payables)
    due_next_7_days = sum(
        max(_to_float(p.amount) - _to_float(p.paid_amount), 0)
        for p in open_payables
        if 0 <= (p.due_date - date.today()).days <= 7
    )
    return {
        "payable_bills_count": len(payables),
        "open_payable_count": len(open_payables),
        "open_payable_amount": round(total_open, 2),
        "due_next_7_days_amount": round(due_next_7_days, 2),
    }


@router.get("/profitability/style/{style_id}")
async def style_profitability(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    q_result = await db.execute(
        select(Quotation).where(Quotation.tenant_id == tenant.id, Quotation.style_id == style_id).order_by(Quotation.id.desc())
    )
    quotation = q_result.scalars().first()
    if not quotation:
        raise HTTPException(status_code=404, detail="No quotation found for style")
    quoted = _to_float(quotation.total_amount)
    cost = _to_float(quotation.total_cost or quotation.material_cost or "0")
    profit = quoted - cost
    margin = (profit / quoted * 100.0) if quoted > 0 else 0.0
    return {
        "style_id": style_id,
        "quoted_amount": round(quoted, 2),
        "estimated_cost": round(cost, 2),
        "estimated_profit": round(profit, 2),
        "profit_margin_pct": round(margin, 2),
    }


@router.get("/profitability/lc/{order_id}")
async def lc_profitability(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    quotation = await db.get(Quotation, order.quotation_id) if order.quotation_id else None
    order_qty = float(order.quantity or 0)
    quoted_rate = _to_float(quotation.quoted_price if quotation else "0")
    order_value = round(order_qty * quoted_rate, 2)
    est_cost = _to_float(quotation.total_cost if quotation else "0")
    gross_profit = round(order_value - est_cost, 2)
    return {
        "order_id": order.id,
        "order_code": order.order_code,
        "order_value": order_value,
        "estimated_cost": round(est_cost, 2),
        "gross_profit": gross_profit,
        "gross_margin_pct": round((gross_profit / order_value * 100) if order_value > 0 else 0, 2),
    }


@router.get("/profitability/variance/{order_id}")
async def costing_variance(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    quotation = await db.get(Quotation, order.quotation_id) if order.quotation_id else None
    planned = _to_float(quotation.total_cost if quotation else "0")
    # P7 currently has no actual-cost ledger bridge; use posted voucher amount as actual baseline.
    posted = list(
        (
            await db.execute(
                select(Voucher).where(
                    Voucher.tenant_id == tenant.id,
                    Voucher.status == "POSTED",
                    Voucher.reference == order.order_code,
                )
            )
        ).scalars().all()
    )
    actual = 0.0
    for v in posted:
        lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == v.id))).scalars().all())
        actual += sum(_to_float(line.amount) for line in lines if line.entry_type == "DEBIT")
    return {
        "order_id": order.id,
        "order_code": order.order_code,
        "planned_cost": round(planned, 2),
        "actual_cost": round(actual, 2),
        "variance": round(actual - planned, 2),
        "variance_pct": round(((actual - planned) / planned * 100) if planned > 0 else 0, 2),
    }


@router.get("/vouchers/{voucher_id}/print")
async def voucher_print(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    voucher = await db.get(Voucher, voucher_id)
    if not voucher or voucher.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())
    output_lines = []
    total_debit = 0.0
    total_credit = 0.0
    for line in lines:
        account = await db.get(ChartOfAccount, line.account_id)
        account_name = account.name if account and account.tenant_id == tenant.id else f"Account#{line.account_id}"
        amount = _to_float(line.amount)
        if line.entry_type == "DEBIT":
            total_debit += amount
        else:
            total_credit += amount
        output_lines.append(
            {
                "line_id": line.id,
                "account_id": line.account_id,
                "account_name": account_name,
                "entry_type": line.entry_type,
                "amount": round(amount, 2),
                "notes": line.notes,
            }
        )
    return {
        "voucher": {
            "id": voucher.id,
            "voucher_number": voucher.voucher_number,
            "voucher_type": voucher.voucher_type,
            "voucher_date": voucher.voucher_date,
            "status": voucher.status,
            "description": voucher.description,
            "reference": voucher.reference,
        },
        "lines": output_lines,
        "totals": {
            "debit_total": round(total_debit, 2),
            "credit_total": round(total_credit, 2),
            "is_balanced": round(total_debit, 2) == round(total_credit, 2),
        },
    }


@router.get("/accounting-periods", response_model=list[AccountingPeriodOut])
async def list_accounting_periods(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return list(
        (
            await db.execute(
                select(AccountingPeriod).where(AccountingPeriod.tenant_id == tenant.id).order_by(AccountingPeriod.start_date.desc())
            )
        ).scalars().all()
    )


@router.post("/accounting-periods", response_model=AccountingPeriodOut)
async def create_accounting_period(
    body: AccountingPeriodBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="End date must be greater than or equal to start date")
    overlap = (
        await db.execute(
            select(AccountingPeriod).where(
                AccountingPeriod.tenant_id == tenant.id,
                AccountingPeriod.start_date <= body.end_date,
                AccountingPeriod.end_date >= body.start_date,
            )
        )
    ).scalars().first()
    if overlap:
        raise HTTPException(status_code=400, detail="Accounting period overlaps with existing period")
    row = AccountingPeriod(
        tenant_id=tenant.id,
        period_name=body.period_name,
        start_date=body.start_date,
        end_date=body.end_date,
        is_closed=False,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/accounting-periods/{period_id}/close", response_model=AccountingPeriodOut)
async def close_accounting_period(
    period_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await db.get(AccountingPeriod, period_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Accounting period not found")
    row.is_closed = True
    row.closed_at = datetime.utcnow()
    row.closed_by = user.id
    await db.commit()
    await db.refresh(row)
    return row


class BillAllocationBody(BaseModel):
    voucher_id: int
    amount: str


class BillAutoCreateBody(BaseModel):
    party_name: str
    bill_type: Literal["PAYABLE", "RECEIVABLE"] = "RECEIVABLE"
    due_in_days: int = 30
    currency: str = "BDT"
    notes: str | None = None


@router.get("/vouchers/meta/types")
async def voucher_types_meta(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    configured = list(
        (
            await db.execute(
                select(VoucherType).where(
                    VoucherType.tenant_id == tenant.id,
                    VoucherType.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    if configured:
        return [row.code for row in configured]
    return [code for code, _ in DEFAULT_VOUCHER_TYPES]


@router.get("/vouchers/meta/statuses")
async def voucher_statuses_meta():
    return list(VOUCHER_WORKFLOW.keys())


@router.get("/vouchers/meta/workflow")
async def voucher_workflow_meta():
    return {k: sorted(v) for k, v in VOUCHER_WORKFLOW.items()}


@router.get("/vouchers/meta/approval-rules")
async def voucher_approval_rules_meta():
    return {
        "min_levels": 3,
        "max_levels": 4,
        "rules": [
            {"level": 1, "required_role": "manager"},
            {"level": 2, "required_role": "manager"},
            {"level": 3, "required_role": "admin"},
        ],
        "notes": "Current P7 default rule set for legacy parity mapping.",
    }


@router.get("/vouchers/{voucher_id}/available-actions")
async def voucher_available_actions(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    role = await db.get(Role, user.role_id)
    role_name = (role.name if role else "").strip().lower()
    is_privileged = role_name in {"admin", "manager", "super_admin", "superadmin", "owner"}
    voucher = await db.get(Voucher, voucher_id)
    if not voucher or voucher.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    status_to_actions = {
        "DRAFT": ["submit", "cancel"],
        "SUBMITTED": ["check", "reject"],
        "CHECKED": ["recommend", "reject"],
        "RECOMMENDED": ["approve", "reject"],
        "APPROVED": ["post", "reject"],
        "POSTED": ["reverse", "cancel_posting"],
        "REJECTED": ["set_draft"],
        "CANCELLED": [],
        "REVERSED": [],
    }
    actions = status_to_actions.get(voucher.status, [])
    privileged_actions = {"check", "recommend", "approve", "post", "reject", "reverse", "cancel_posting"}
    if not is_privileged:
        actions = [a for a in actions if a not in privileged_actions]
    return {"voucher_id": voucher_id, "status": voucher.status, "actions": actions}


@router.post("/vouchers/{voucher_id}/post", response_model=VoucherOut)
async def post_voucher(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_voucher_status(
        voucher_id=voucher_id,
        body={"status": "POSTED"},
        tenant=tenant,
        user=user,
        db=db,
    )


@router.post("/vouchers/{voucher_id}/cancel-posting", response_model=VoucherOut)
async def cancel_posted_voucher(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    voucher = await db.get(Voucher, voucher_id)
    if not voucher or voucher.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    if voucher.status != "POSTED":
        raise HTTPException(status_code=400, detail="Only posted vouchers can cancel posting")
    lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())
    for line in lines:
        account = await db.get(ChartOfAccount, line.account_id)
        if not account or account.tenant_id != tenant.id:
            continue
        # Reverse the previously posted effect.
        reverse_entry = "CREDIT" if line.entry_type == "DEBIT" else "DEBIT"
        _apply_voucher_impact(account, reverse_entry, _to_float(line.amount))
    voucher.status = "APPROVED"
    await db.commit()
    await db.refresh(voucher)
    return await _voucher_out(db, voucher)


@router.post("/vouchers/{voucher_id}/reverse", response_model=VoucherOut)
async def reverse_voucher(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    src = await db.get(Voucher, voucher_id)
    if not src or src.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    if src.status != "POSTED":
        raise HTTPException(status_code=400, detail="Only posted vouchers can be reversed")
    await _require_manager_or_admin(db, user)

    source_lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == src.id))).scalars().all())
    if not source_lines:
        raise HTTPException(status_code=400, detail="Voucher has no lines")
    rev = Voucher(
        tenant_id=tenant.id,
        voucher_number=await next_tenant_code(
            db,
            model=Voucher,
            tenant_id=tenant.id,
            prefix="VCH-",
            width=4,
        ),
        voucher_type=src.voucher_type,
        voucher_date=date.today(),
        status="POSTED",
        description=f"Reversal of {src.voucher_number}",
        reference=src.voucher_number,
        created_by=user.id,
    )
    db.add(rev)
    await db.flush()
    for line in source_lines:
        flipped = "CREDIT" if line.entry_type == "DEBIT" else "DEBIT"
        db.add(
            VoucherLine(
                tenant_id=tenant.id,
                voucher_id=rev.id,
                account_id=line.account_id,
                cost_center_id=line.cost_center_id,
                entry_type=flipped,
                amount=line.amount,
                notes=f"Reversal line of voucher {src.voucher_number}",
            )
        )
        account = await db.get(ChartOfAccount, line.account_id)
        if account and account.tenant_id == tenant.id:
            _apply_voucher_impact(account, flipped, _to_float(line.amount))
    src.status = "REVERSED"
    await db.commit()
    await db.refresh(rev)
    return await _voucher_out(db, rev)


@router.post("/bills/{bill_id}/allocate", response_model=BillOut)
async def allocate_bill_against_voucher(
    bill_id: int,
    body: BillAllocationBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bill = await db.get(OutstandingBill, bill_id)
    if not bill or bill.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Bill not found")
    voucher = await db.get(Voucher, body.voucher_id)
    if not voucher or voucher.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    if voucher.status != "POSTED":
        raise HTTPException(status_code=400, detail="Only posted vouchers can be used for bill allocation")
    amount = _to_float(body.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Allocation amount must be greater than zero")
    outstanding = max(_to_float(bill.amount) - _to_float(bill.paid_amount), 0.0)
    if amount > outstanding:
        raise HTTPException(status_code=400, detail="Allocation amount exceeds outstanding bill amount")
    new_paid = round(_to_float(bill.paid_amount) + amount, 2)
    bill.paid_amount = str(new_paid)
    bill.status = "PAID" if new_paid >= round(_to_float(bill.amount), 2) else "PARTIAL"
    notes = (bill.notes or "").strip()
    alloc_note = f"Allocated {amount:.2f} via voucher {voucher.voucher_number}"
    bill.notes = f"{notes} | {alloc_note}".strip(" |")
    await db.commit()
    await db.refresh(bill)
    return bill


@router.post("/bills/auto-create-from-voucher/{voucher_id}", response_model=BillOut)
async def auto_create_bill_from_voucher(
    voucher_id: int,
    body: BillAutoCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    voucher = await db.get(Voucher, voucher_id)
    if not voucher or voucher.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    if voucher.status != "POSTED":
        raise HTTPException(status_code=400, detail="Voucher must be posted for bill auto creation")
    lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())
    if not lines:
        raise HTTPException(status_code=400, detail="Voucher has no lines")
    total = sum(_to_float(line.amount) for line in lines if line.entry_type in {"DEBIT", "CREDIT"})
    if total <= 0:
        raise HTTPException(status_code=400, detail="Voucher amount is zero")
    prefix = "AP-" if body.bill_type == "PAYABLE" else "AR-"
    code = await next_tenant_code(
        db,
        model=OutstandingBill,
        tenant_id=tenant.id,
        prefix=prefix,
        width=4,
    )
    due = date.today() + timedelta(days=max(body.due_in_days, 0))
    row = OutstandingBill(
        tenant_id=tenant.id,
        bill_no=code,
        party_name=body.party_name,
        bill_type=body.bill_type,
        bill_date=date.today(),
        due_date=due,
        amount=str(round(total, 2)),
        paid_amount="0",
        currency=body.currency.upper(),
        status="OPEN",
        notes=f"{body.notes or ''} | Auto from voucher:{voucher.voucher_number}".strip(" |"),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/banking/payment-runs/{run_id}/approve", response_model=PaymentRunOut)
async def approve_payment_run(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    run = await db.get(PaymentRun, run_id)
    if not run or run.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payment run not found")
    if run.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only draft payment runs can be approved")
    run.status = "APPROVED"
    await db.commit()
    await db.refresh(run)
    return await _payment_run_out(db, run)


@router.post("/banking/payment-runs/{run_id}/process", response_model=PaymentRunOut)
async def process_payment_run(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    run = await db.get(PaymentRun, run_id)
    if not run or run.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payment run not found")
    if run.status != "APPROVED":
        raise HTTPException(status_code=400, detail="Only approved payment runs can be processed")
    run.status = "PROCESSED"
    await db.commit()
    await db.refresh(run)
    return await _payment_run_out(db, run)


@router.post("/accounting-periods/{period_id}/reopen", response_model=AccountingPeriodOut)
async def reopen_accounting_period(
    period_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await db.get(AccountingPeriod, period_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Accounting period not found")
    row.is_closed = False
    row.closed_at = None
    row.closed_by = None
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/accounting-periods/check-lock")
async def check_period_lock(
    voucher_date: date = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    period = (
        await db.execute(
            select(AccountingPeriod).where(
                AccountingPeriod.tenant_id == tenant.id,
                AccountingPeriod.start_date <= voucher_date,
                AccountingPeriod.end_date >= voucher_date,
            )
        )
    ).scalars().first()
    if not period:
        return {"locked": True, "reason": "No accounting period found for date"}
    if period.is_closed:
        return {"locked": True, "reason": f"Period '{period.period_name}' is closed", "period_id": period.id}
    return {"locked": False, "period_id": period.id, "period_name": period.period_name}


@router.delete("/accounting-periods/{period_id}")
async def delete_accounting_period(
    period_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await db.get(AccountingPeriod, period_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Accounting period not found")
    posted_exists = (
        await db.execute(
            select(Voucher.id).where(
                Voucher.tenant_id == tenant.id,
                Voucher.status == "POSTED",
                Voucher.voucher_date >= row.start_date,
                Voucher.voucher_date <= row.end_date,
            ).limit(1)
        )
    ).scalar()
    if posted_exists:
        raise HTTPException(status_code=400, detail="Cannot delete period with posted vouchers")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/voucher-reports/summary")
async def voucher_report_summary(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    voucher_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(Voucher).where(Voucher.tenant_id == tenant.id)
    if from_date is not None:
        stmt = stmt.where(Voucher.voucher_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Voucher.voucher_date <= to_date)
    if voucher_type:
        stmt = stmt.where(Voucher.voucher_type == voucher_type.strip().upper())
    if status_filter:
        stmt = stmt.where(Voucher.status == status_filter.strip().upper())
    rows = list((await db.execute(stmt)).scalars().all())
    status_counts: dict[str, int] = {}
    for row in rows:
        status_counts[row.status] = status_counts.get(row.status, 0) + 1
    return {
        "total_vouchers": len(rows),
        "status_counts": status_counts,
    }


@router.get("/reports/ledger-activity")
async def ledger_activity_report(
    account_id: int,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    account = await db.get(ChartOfAccount, account_id)
    if not account or account.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Account not found")
    if from_date is None:
        from_date = date.today().replace(day=1)
    if to_date is None:
        to_date = date.today()

    q = (
        select(VoucherLine, Voucher)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(
            VoucherLine.tenant_id == tenant.id,
            VoucherLine.account_id == account_id,
            Voucher.voucher_date >= from_date,
            Voucher.voucher_date <= to_date,
            Voucher.status == "POSTED",
        )
        .order_by(Voucher.voucher_date.asc(), Voucher.id.asc(), VoucherLine.id.asc())
    )
    rows = list((await db.execute(q)).all())
    opening_balance = _to_float(account.opening_balance)
    running_balance = opening_balance
    out_rows = []
    for line, voucher in rows:
        amt = _to_float(line.amount)
        if account.normal_balance == "debit":
            running_balance += amt if line.entry_type == "DEBIT" else -amt
        else:
            running_balance += amt if line.entry_type == "CREDIT" else -amt
        out_rows.append(
            {
                "voucher_id": voucher.id,
                "voucher_number": voucher.voucher_number,
                "voucher_date": voucher.voucher_date,
                "entry_type": line.entry_type,
                "amount": round(amt, 2),
                "reference": voucher.reference,
                "description": voucher.description,
                "running_balance": round(running_balance, 2),
            }
        )
    return {
        "account_id": account.id,
        "account_number": account.account_number,
        "account_name": account.name,
        "from_date": from_date,
        "to_date": to_date,
        "opening_balance": round(opening_balance, 2),
        "closing_balance": round(running_balance, 2),
        "rows": out_rows,
    }


@router.get("/voucher-reports/monthly")
async def voucher_report_monthly(
    months_back: int = Query(default=12),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    voucher_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(Voucher).where(Voucher.tenant_id == tenant.id)
    if from_date is not None:
        stmt = stmt.where(Voucher.voucher_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Voucher.voucher_date <= to_date)
    if voucher_type:
        stmt = stmt.where(Voucher.voucher_type == voucher_type.strip().upper())
    if status_filter:
        stmt = stmt.where(Voucher.status == status_filter.strip().upper())
    rows = list((await db.execute(stmt)).scalars().all())
    summary: dict[str, dict[str, float | int]] = {}
    for row in rows:
        if not row.voucher_date:
            continue
        key = row.voucher_date.strftime("%Y-%m")
        if key not in summary:
            summary[key] = {"count": 0, "posted_count": 0}
        summary[key]["count"] = int(summary[key]["count"]) + 1
        if row.status == "POSTED":
            summary[key]["posted_count"] = int(summary[key]["posted_count"]) + 1
    keys = sorted(summary.keys())[-max(months_back, 1):]
    return {"months": [{"month": key, **summary[key]} for key in keys]}


@router.get("/voucher-reports/top-preparers")
async def voucher_report_top_preparers(
    limit: int = Query(default=10),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    voucher_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(Voucher).where(Voucher.tenant_id == tenant.id)
    if from_date is not None:
        stmt = stmt.where(Voucher.voucher_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Voucher.voucher_date <= to_date)
    if voucher_type:
        stmt = stmt.where(Voucher.voucher_type == voucher_type.strip().upper())
    if status_filter:
        stmt = stmt.where(Voucher.status == status_filter.strip().upper())
    rows = list((await db.execute(stmt)).scalars().all())
    counts: dict[int, int] = {}
    for row in rows:
        if row.created_by is not None:
            counts[row.created_by] = counts.get(row.created_by, 0) + 1
    ranking = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[: max(limit, 1)]
    users = {
        u.id: u
        for u in (
            await db.execute(select(User).where(User.tenant_id == tenant.id, User.id.in_([uid for uid, _ in ranking] or [0])))
        ).scalars().all()
    }
    return {
        "rows": [
            {
                "user_id": uid,
                "username": users[uid].username if uid in users else f"User#{uid}",
                "count": cnt,
            }
            for uid, cnt in ranking
        ]
    }
