from __future__ import annotations

import csv
import calendar
import hashlib
import json
import logging
from collections import defaultdict
from io import StringIO
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Iterable, Literal

# Rollup bucket for contract / CM reporting (chart_of_accounts.cost_nature, voucher_lines.cost_nature_override).
COST_NATURE_CODES = frozenset({"MATERIAL", "CM", "OTHER", "NON_OPERATING"})
CostNatureLiteral = Literal["MATERIAL", "CM", "OTHER", "NON_OPERATING"]
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import Response as BytesResponse
from pydantic import BaseModel, Field, field_serializer, field_validator

from app.common.money import safe_decimal
from app.common.money_schema import MoneyLineStr, MoneyStrNonNeg, MoneyStrNonNegOpt, RateStrNonNeg, RateStrNonNegOpt
from app.common.orm_numeric import (
    decimal_money_passthrough,
    decimal_rate_passthrough,
    decimal_to_money_response,
    decimal_to_rate_response,
)
from sqlalchemy import case, cast, func, Numeric, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.cache import (
    ACCOUNT_GROUP_HIERARCHY_CACHE_TTL_SECONDS,
    account_group_hierarchy_cache_key,
    cache_delete,
    cache_get_json,
    cache_set_json,
)
from app.common.permissions import (
    PERMISSION_FINANCE_AP_POSTING_APPROVE,
    PERMISSION_FINANCE_BUDGET_OVERRIDE,
    assert_delegate_manager_or_permission,
    require_internal_permission,
)
from app.common.authz import get_user_role_scoped_to_tenant
from app.modules.finance.advanced_voucher_service import voucher_book_impact_applied, voucher_in_books_clause
from app.modules.finance.budget_enforcement_service import evaluate_voucher_budget
from app.modules.finance.posting_core import (
    apply_amount_to_account,
    apply_voucher_to_books,
    assert_lines_balanced,
    line_base_amount,
    line_base_amount_sql,
    mark_balance_basis,
    to_decimal,
    voucher_balance_basis,
)
from app.modules.finance.voucher_history import (
    diff_voucher,
    header_snapshot,
    lines_snapshot,
    list_voucher_events,
    record_voucher_event,
    voucher_stage_signers,
)
from app.common.signatories import SignatoryEntry, build_signatories
from app.common.codegen import next_tenant_code
from app.modules.finance.voucher_controls import (
    allocate_series_voucher_number,
    compute_duplicate_risk_hash,
    finalize_posted_voucher_metadata,
    find_conflicting_posted_vouchers,
    collect_bank_cash_control_warnings,
    fiscal_year_calendar,
)
from app.common.pagination import HR_LIST_DEFAULT_LIMIT, HR_LIST_MAX_LIMIT, MAX_PAGE_SIZE
from app.common.control_tower_flags import require_control_tower_enabled
from app.common.ownership import ensure_all_owned, ensure_owned
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db, safe_async_session_rollback
from app.modules.finance.auto_posting_service import AutoPostingLine, create_system_voucher
from app.modules.finance.voucher_signature import apply_voucher_signature, voucher_signature_payload
from app.modules.finance.exposure_service import build_maturity_ladder, compute_master_lc_exposure
from app.models import (
    AccountGroup,
    CoAConfig,
    AccountingPeriod,
    BankAccount,
    BankReconciliation,
    BankStatementMatchLog,
    BankStatementLine,
    BillReference,
    BillAllocation,
    Budget,
    BudgetLine,
    BtbLc,
    ChartOfAccount,
    FacilityUtilization,
    RepaymentScheduleLine,
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
    SettlementAuditPreset,
    PurchaseOrder,
    PurchaseOrderItem,
    Quotation,
    Tenant,
    TradeCase,
    User,
    VendorBill,
    VendorBillLine,
    Voucher,
    VoucherLine,
    VoucherType,
    Vendor,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/finance",
    tags=["finance"],
    dependencies=[Depends(require_internal_permission("finance.access"))],
)

DEFAULT_VOUCHER_TYPES: list[tuple[str, str]] = [
    ("PAYMENT", "Payment"),
    ("RECEIPT", "Receipt"),
    ("JOURNAL", "Journal"),
    ("CONTRA", "Contra"),
    ("MJ", "Material Journal"),
    ("PJ", "Purchase Journal"),
    ("LCJ", "LC Journal"),
    ("CREDIT_NOTE", "Credit Note"),
    ("DEBIT_NOTE", "Debit Note"),
    ("STOCK_TRANSFER", "Stock Transfer"),
    ("MEMORANDUM", "Memorandum"),
    ("OPTIONAL", "Optional"),
]

VOUCHER_WORKFLOW: dict[str, set[str]] = {
    "DRAFT": {"SUBMITTED", "CANCELLED"},
    "SUBMITTED": {"CHECKED", "REJECTED"},
    "CHECKED": {"RECOMMENDED", "REJECTED"},
    "RECOMMENDED": {"APPROVED", "REJECTED"},
    "APPROVED": {"POSTED", "REJECTED"},
    # POSTED leaves only via POST /vouchers/{id}/reverse or /cancel-posting, which
    # undo the book impact; a bare status flip would leave balances applied.
    "POSTED": set(),
    "REJECTED": {"DRAFT"},
    "CANCELLED": set(),
    "REVERSED": set(),
}


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _require_manual_voucher_edit(row: Voucher) -> None:
    if getattr(row, "allow_manual_edit", True) is False:
        raise HTTPException(
            status_code=400,
            detail="This voucher was generated by another module and cannot be edited or deleted manually.",
        )


def _posted_snapshot_dict(voucher: Voucher) -> dict | None:
    if not getattr(voucher, "posted_snapshot_json", None):
        return None
    try:
        return json.loads(voucher.posted_snapshot_json)  # type: ignore[arg-type]
    except (json.JSONDecodeError, TypeError):
        return None


def _to_float(value: str | Decimal | None) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value or "0")
    except (TypeError, ValueError):
        return 0.0


def _normalize_currency(code: str | None, *, default: str = "BDT") -> str:
    normalized = (code or default).strip().upper()
    return normalized or default


async def _lookup_exchange_rate(
    db: AsyncSession,
    tenant_id: int,
    from_currency: str,
    to_currency: str,
) -> tuple[float, str, datetime | None]:
    from_code = _normalize_currency(from_currency)
    to_code = _normalize_currency(to_currency)
    if from_code == to_code:
        return 1.0, "same-currency", datetime.utcnow()

    latest = (
        await db.execute(
            select(CurrencyExchangeRate)
            .where(
                CurrencyExchangeRate.tenant_id == tenant_id,
                CurrencyExchangeRate.from_currency == from_code,
                CurrencyExchangeRate.to_currency == to_code,
                CurrencyExchangeRate.is_active.is_(True),
            )
            .order_by(CurrencyExchangeRate.effective_date.desc())
        )
    ).scalars().first()
    if latest:
        return max(_to_float(latest.exchange_rate), 0.000001), "manual-rate-table", datetime.utcnow()

    from app.common.fx_rate_cache import get_live_rate

    live_rate = await get_live_rate(from_code, to_code)
    if live_rate:
        return live_rate, "open.er-api.com", datetime.utcnow()

    # A silent 1.0 would book e.g. USD 10,000 as BDT 10,000; make the user supply a rate.
    raise HTTPException(
        status_code=400,
        detail=(
            f"No exchange rate available for {from_code} to {to_code}. "
            "Enter the rate on the voucher or add it under Finance → Currency rates."
        ),
    )


_voucher_signature_payload = voucher_signature_payload
_apply_internal_signature = apply_voucher_signature


def _add_months(base_date: date, months: int) -> date:
    month_index = (base_date.month - 1) + months
    year = base_date.year + month_index // 12
    month = (month_index % 12) + 1
    day = min(base_date.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


async def _require_manager_or_admin(db: AsyncSession, user: User, tenant_id: int) -> None:
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    role_name = (role.name if role else "").strip().lower()
    if role_name not in {"admin", "manager", "super_admin", "superadmin", "owner"}:
        raise HTTPException(status_code=403, detail="Only manager/admin can perform this action")


async def _account_group_parent_would_cycle(
    db: AsyncSession, tenant_id: int, group_id: int, new_parent_id: int | None
) -> bool:
    """Return True if setting parent_group_id to new_parent_id would create a cycle (new_parent is descendant of group_id)."""
    if not new_parent_id or new_parent_id == group_id:
        return True
    current_id: int | None = new_parent_id
    seen: set[int] = set()
    while current_id and current_id not in seen:
        seen.add(current_id)
        if current_id == group_id:
            return True
        row = await db.get(AccountGroup, current_id)
        if not row or row.tenant_id != tenant_id:
            break
        current_id = row.parent_group_id
    return False


async def _get_coa_config(db: AsyncSession, tenant_id: int) -> dict:
    """Return CoA config for tenant or defaults. Keys: account_number_prefix, account_number_width, group_code_prefix, group_code_width, allow_manual_account_number, validate_normal_balance."""
    r = await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant_id))
    cfg = r.scalars().first()
    if cfg:
        return {
            "account_number_prefix": cfg.account_number_prefix,
            "account_number_width": cfg.account_number_width,
            "group_code_prefix": cfg.group_code_prefix,
            "group_code_width": cfg.group_code_width,
            "allow_manual_account_number": cfg.allow_manual_account_number,
            "validate_normal_balance": cfg.validate_normal_balance,
        }
    return {
        "account_number_prefix": "AC-",
        "account_number_width": 4,
        "group_code_prefix": "GRP-",
        "group_code_width": 4,
        "allow_manual_account_number": False,
        "validate_normal_balance": True,
    }


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
    # Advanced fields (COA redesign)
    description: str | None = None
    reporting_code: str | None = None
    default_normal_balance: Literal["debit", "credit"] = "debit"
    allow_posting: bool = True
    is_summary_group: bool = False
    last_reviewed_at: date | None = None


class AccountGroupOut(AccountGroupBody):
    id: int
    tenant_id: int
    code: str
    system_code: str | None = None
    is_system: bool = False
    is_protected: bool = False

    class Config:
        from_attributes = True


class AccountGroupHierarchyNode(BaseModel):
    id: int
    code: str
    name: str
    nature: str
    parent_group_id: int | None
    sort_order: int
    is_active: bool
    children: list["AccountGroupHierarchyNode"] = []
    account_count: int = 0
    # Advanced fields for tree UX and reporting
    description: str | None = None
    reporting_code: str | None = None
    default_normal_balance: str = "debit"
    allow_posting: bool = True
    is_summary_group: bool = False
    last_reviewed_at: date | None = None
    depth: int = 0

    class Config:
        from_attributes = True


AccountGroupHierarchyNode.model_rebuild()


class CoAConfigBody(BaseModel):
    account_number_prefix: str = "AC-"
    account_number_width: int = 4
    group_code_prefix: str = "GRP-"
    group_code_width: int = 4
    allow_manual_account_number: bool = False
    max_group_depth: int | None = None
    max_account_depth: int | None = None
    validate_normal_balance: bool = True
    inventory_stock_account_id: int | None = None
    inventory_clearing_account_id: int | None = None


class CoAConfigOut(CoAConfigBody):
    id: int
    tenant_id: int

    class Config:
        from_attributes = True


class ChartAccountBody(BaseModel):
    account_number: str | None = None
    name: str
    group_id: int
    normal_balance: Literal["debit", "credit"] = "debit"
    opening_balance: MoneyStrNonNeg = "0"
    account_currency: str | None = None
    maintain_fc_balance: bool = False
    description: str | None = None
    is_active: bool = True
    is_bank_account: bool = False
    # Advanced CoA fields
    account_type: Literal["posting", "statistical", "header"] = "posting"
    reporting_code: str | None = None
    display_order: int = 0
    statistical_unit: str | None = None
    statistical_formula: str | None = None
    parent_account_id: int | None = None
    last_reviewed_at: date | None = None
    enable_bill_wise: bool = False
    cost_nature: CostNatureLiteral | None = None

    @field_validator("cost_nature", mode="before")
    @classmethod
    def _coerce_cost_nature(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, str):
            u = v.strip().upper()
            return u if u in COST_NATURE_CODES else v
        return v


class ChartAccountOut(ChartAccountBody):
    id: int
    tenant_id: int
    balance: MoneyLineStr
    enable_bill_wise: bool
    version: int
    system_code: str | None = None
    is_system: bool = False
    is_protected: bool = False
    usage_purpose: str | None = None
    linked_module: str | None = None

    @field_serializer("opening_balance", "balance")
    def _serialize_money(self, value: object) -> str:
        return decimal_to_money_response(value)

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
    currency: str | None = None
    exchange_rate: RateStrNonNegOpt = None
    base_amount: MoneyStrNonNegOpt = None
    is_rate_overridden: bool = False
    rate_source: str | None = None
    entry_type: Literal["DEBIT", "CREDIT"]
    amount: MoneyStrNonNeg
    notes: str | None = None
    cost_nature_override: CostNatureLiteral | None = None

    @field_validator("cost_nature_override", mode="before")
    @classmethod
    def _coerce_cost_nature_override(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, str):
            u = v.strip().upper()
            return u if u in COST_NATURE_CODES else v
        return v


def _normalize_voucher_type_value(v: object) -> str:
    if not isinstance(v, str) or not v.strip():
        raise ValueError("voucher_type is required")
    normalized = v.strip().upper()
    if not all(ch.isalnum() or ch == "_" for ch in normalized):
        raise ValueError("voucher_type must be alphanumeric (underscores allowed)")
    return normalized


class VoucherBody(BaseModel):
    voucher_number: str | None = None
    voucher_type: str = Field(..., min_length=1, max_length=16)

    @field_validator("voucher_type", mode="before")
    @classmethod
    def _normalize_voucher_type(cls, v: object) -> str:
        return _normalize_voucher_type_value(v)
    voucher_date: date
    description: str | None = None
    reference: str | None = None
    branch_code: str | None = Field(default=None, description="Branch / site code for numbering series (default MAIN).")
    instrument_reference: str | None = Field(default=None, description="Cheque no., UTR, or bank instrument ref.")
    bank_reconciliation_id: int | None = None
    currency: str = "BDT"
    base_currency: str = "BDT"
    exchange_rate: RateStrNonNegOpt = None
    exchange_rate_source: str | None = None
    exchange_rate_fetched_at: datetime | None = None
    trade_case_id: int | None = None
    btb_lc_id: int | None = None
    facility_utilization_id: int | None = None
    lines: list[VoucherLineBody]


class VoucherUpdateBody(BaseModel):
    voucher_type: str = Field(..., min_length=1, max_length=16)

    @field_validator("voucher_type", mode="before")
    @classmethod
    def _normalize_voucher_type(cls, v: object) -> str:
        return _normalize_voucher_type_value(v)
    voucher_date: date
    description: str | None = None
    reference: str | None = None
    branch_code: str | None = None
    instrument_reference: str | None = None
    bank_reconciliation_id: int | None = None
    currency: str = "BDT"
    base_currency: str = "BDT"
    exchange_rate: RateStrNonNegOpt = None
    facility_utilization_id: int | None = None
    lines: list[VoucherLineBody]


class VoucherReverseBody(BaseModel):
    reason: str = Field(..., min_length=1, max_length=4000)


class DuplicateRiskCheckBody(BaseModel):
    voucher_date: date
    reference: str | None = None
    voucher_type: str | None = None
    lines: list[VoucherLineBody]


class VoucherLineOut(VoucherLineBody):
    id: int
    voucher_id: int
    tenant_id: int

    @field_serializer("amount", "base_amount")
    def _serialize_line_money(self, value: object) -> str | None:
        if value is None:
            return None
        return decimal_to_money_response(value)

    @field_serializer("exchange_rate")
    def _serialize_line_rate(self, value: object) -> str | None:
        if value is None:
            return None
        return decimal_to_rate_response(value)

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
    branch_code: str | None = None
    fiscal_year: int | None = None
    series_sequence: int | None = None
    number_series_key: str | None = None
    source_module: str | None = None
    source_module_ref: str | None = None
    allow_manual_edit: bool = True
    reverses_voucher_id: int | None = None
    reversed_by_voucher_id: int | None = None
    reversal_reason: str | None = None
    reversal_recorded_at: datetime | None = None
    reversal_recorded_by_user_id: int | None = None
    posted_snapshot: dict | None = None
    instrument_reference: str | None = None
    duplicate_risk_hash: str | None = None
    bank_reconciliation_id: int | None = None
    currency: str
    base_currency: str
    exchange_rate: str
    exchange_rate_source: str
    exchange_rate_fetched_at: datetime | None
    verification_id: str | None
    signature_hash: str | None
    signed_at: datetime | None
    signed_by_system: bool
    trade_case_id: int | None
    btb_lc_id: int | None
    facility_utilization_id: int | None = None
    created_by: int | None
    created_at: datetime
    updated_at: datetime
    lines: list[VoucherLineOut]
    control_warnings: list[str] | None = None


class CashScenarioBody(BaseModel):
    name: str
    start_date: date
    months: int = 6


class CashScenarioUpdateBody(BaseModel):
    name: str | None = None
    start_date: date | None = None
    months: int | None = None
    status: str | None = None


class CashForecastLineOut(BaseModel):
    id: int
    scenario_id: int
    month_label: str
    inflow: str
    outflow: str
    net: str
    cumulative: str

    _forecast_money = field_validator("inflow", "outflow", "net", "cumulative", mode="before")(
        decimal_money_passthrough
    )

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

    _fx_money = field_validator("fc_amount", "base_amount", "settled_amount", mode="before")(
        decimal_money_passthrough
    )
    _fx_rate = field_validator("rate_to_base", mode="before")(decimal_rate_passthrough)

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

    @field_validator("amount", "paid_amount", mode="before")
    @classmethod
    def _coerce_bill_money(cls, value: object) -> str:
        return decimal_to_money_response(value)

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

    _bank_money = field_validator("opening_balance", "current_balance", mode="before")(decimal_money_passthrough)

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

    @field_validator("statement_balance", "book_balance", "difference_amount", mode="before")
    @classmethod
    def _coerce_money_fields(cls, value: object) -> str:
        if value is None:
            return "0.0000"
        if isinstance(value, str):
            return value
        return decimal_to_money_response(value)

    class Config:
        from_attributes = True


class PaymentRunItemBody(BaseModel):
    bill_id: int | None = None
    party_name: str
    amount: str
    source_currency: str | None = None
    fx_rate_to_base: str | None = None
    base_amount: str | None = None
    reference: str | None = None


class PaymentRunBody(BaseModel):
    run_code: str | None = None
    run_date: date
    bank_account_id: int | None = None
    base_currency: str | None = "BDT"
    remarks: str | None = None
    trade_case_id: int | None = None
    items: list[PaymentRunItemBody]


class PaymentRunItemOut(PaymentRunItemBody):
    id: int
    tenant_id: int
    payment_run_id: int
    status: str

    @field_validator("amount", "base_amount", mode="before")
    @classmethod
    def _coerce_money_fields(cls, value: object) -> str:
        if value is None:
            return "0.0000"
        if isinstance(value, str):
            return value
        return decimal_to_money_response(value)

    @field_validator("fx_rate_to_base", mode="before")
    @classmethod
    def _coerce_rate_field(cls, value: object) -> str:
        if value is None:
            return "1.000000"
        if isinstance(value, str):
            return value
        return decimal_to_rate_response(value)

    class Config:
        from_attributes = True


class PaymentRunOut(BaseModel):
    id: int
    tenant_id: int
    run_code: str
    run_date: date
    bank_account_id: int | None
    base_currency: str
    status: str
    total_amount: str
    executed_voucher_id: int | None
    trade_case_id: int | None
    remarks: str | None
    created_by: int | None
    items: list[PaymentRunItemOut]

    @field_validator("total_amount", mode="before")
    @classmethod
    def _coerce_total_amount(cls, value: object) -> str:
        if value is None:
            return "0.0000"
        if isinstance(value, str):
            return value
        return decimal_to_money_response(value)


class SettlementAuditRow(BaseModel):
    item_id: int
    run_id: int
    run_code: str
    run_date: date
    run_status: str
    party_name: str
    bill_no: str | None
    source_currency: str
    source_amount: float
    fx_rate_to_base: float
    base_amount: float
    base_currency: str


class SettlementAuditTotals(BaseModel):
    row_count: int
    source_total: float
    base_total: float


class SettlementAuditOut(BaseModel):
    rows: list[SettlementAuditRow]
    totals: SettlementAuditTotals


class SettlementAuditPresetBody(BaseModel):
    name: str
    from_date: date | None = None
    to_date: date | None = None
    status_filter: str | None = None
    source_currency: str | None = None
    party_query: str | None = None


class SettlementAuditPresetOut(SettlementAuditPresetBody):
    id: int
    tenant_id: int
    created_by: int | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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

    _stmt_money = field_validator("debit_amount", "credit_amount", "running_balance", mode="before")(
        decimal_money_passthrough
    )

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


def _voucher_to_out(
    voucher: Voucher,
    lines: list[VoucherLine],
    *,
    control_warnings: list[str] | None = None,
) -> VoucherOut:
    """Build VoucherOut from preloaded lines (avoids N+1 when listing many vouchers)."""
    sorted_lines = sorted(lines, key=lambda x: x.id)
    return VoucherOut(
        id=voucher.id,
        tenant_id=voucher.tenant_id,
        voucher_number=voucher.voucher_number,
        voucher_type=voucher.voucher_type,
        voucher_date=voucher.voucher_date,
        status=voucher.status,
        description=voucher.description,
        reference=voucher.reference,
        branch_code=getattr(voucher, "branch_code", None),
        fiscal_year=getattr(voucher, "fiscal_year", None),
        series_sequence=getattr(voucher, "series_sequence", None),
        number_series_key=getattr(voucher, "number_series_key", None),
        source_module=getattr(voucher, "source_module", None),
        source_module_ref=getattr(voucher, "source_module_ref", None),
        allow_manual_edit=bool(getattr(voucher, "allow_manual_edit", True)),
        reverses_voucher_id=getattr(voucher, "reverses_voucher_id", None),
        reversed_by_voucher_id=getattr(voucher, "reversed_by_voucher_id", None),
        reversal_reason=getattr(voucher, "reversal_reason", None),
        reversal_recorded_at=getattr(voucher, "reversal_recorded_at", None),
        reversal_recorded_by_user_id=getattr(voucher, "reversal_recorded_by_user_id", None),
        posted_snapshot=_posted_snapshot_dict(voucher),
        instrument_reference=getattr(voucher, "instrument_reference", None),
        duplicate_risk_hash=getattr(voucher, "duplicate_risk_hash", None),
        bank_reconciliation_id=getattr(voucher, "bank_reconciliation_id", None),
        currency=voucher.currency,
        base_currency=voucher.base_currency,
        exchange_rate=decimal_to_rate_response(voucher.exchange_rate),
        exchange_rate_source=voucher.exchange_rate_source,
        exchange_rate_fetched_at=voucher.exchange_rate_fetched_at,
        verification_id=voucher.verification_id,
        signature_hash=voucher.signature_hash,
        signed_at=voucher.signed_at,
        signed_by_system=voucher.signed_by_system,
        trade_case_id=voucher.trade_case_id,
        btb_lc_id=voucher.btb_lc_id,
        facility_utilization_id=getattr(voucher, "facility_utilization_id", None),
        created_by=voucher.created_by,
        created_at=voucher.created_at,
        updated_at=voucher.updated_at,
        lines=sorted_lines,
        control_warnings=control_warnings,
    )


async def _voucher_out(
    db: AsyncSession,
    voucher: Voucher,
    *,
    control_warnings: list[str] | None = None,
) -> VoucherOut:
    lines_result = await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id).order_by(VoucherLine.id))
    lines = list(lines_result.scalars().all())
    return _voucher_to_out(voucher, lines, control_warnings=control_warnings)


def _budget_to_out(budget: Budget, line_rows: list[BudgetLine]) -> BudgetOut:
    return BudgetOut(
        id=budget.id,
        tenant_id=budget.tenant_id,
        budget_name=budget.budget_name,
        fiscal_year=budget.fiscal_year,
        status=budget.status,
        created_by=budget.created_by,
        lines=sorted(line_rows, key=lambda x: x.id),
    )


async def _budget_out(db: AsyncSession, budget: Budget) -> BudgetOut:
    line_rows = list((await db.execute(select(BudgetLine).where(BudgetLine.budget_id == budget.id))).scalars().all())
    return _budget_to_out(budget, line_rows)


def _bank_reconciliation_to_out(row: BankReconciliation) -> BankReconciliationOut:
    return BankReconciliationOut(
        id=row.id,
        tenant_id=row.tenant_id,
        bank_account_id=row.bank_account_id,
        statement_date=row.statement_date,
        statement_balance=decimal_to_money_response(row.statement_balance),
        book_balance=decimal_to_money_response(row.book_balance),
        difference_amount=decimal_to_money_response(row.difference_amount),
        status=row.status,
        notes=row.notes,
        is_finalized=row.is_finalized,
        finalized_at=row.finalized_at,
        finalized_by=row.finalized_by,
        finalize_reason=row.finalize_reason,
        created_by=row.created_by,
    )


def _payment_run_item_to_out(item: PaymentRunItem) -> PaymentRunItemOut:
    return PaymentRunItemOut(
        id=item.id,
        tenant_id=item.tenant_id,
        payment_run_id=item.payment_run_id,
        bill_id=item.bill_id,
        party_name=item.party_name,
        amount=decimal_to_money_response(item.amount),
        source_currency=item.source_currency,
        fx_rate_to_base=decimal_to_rate_response(item.fx_rate_to_base),
        base_amount=decimal_to_money_response(item.base_amount),
        reference=item.reference,
        status=item.status,
    )


def _payment_run_to_out(run: PaymentRun, items: list[PaymentRunItem]) -> PaymentRunOut:
    return PaymentRunOut(
        id=run.id,
        tenant_id=run.tenant_id,
        run_code=run.run_code,
        run_date=run.run_date,
        bank_account_id=run.bank_account_id,
        base_currency=run.base_currency,
        status=run.status,
        total_amount=decimal_to_money_response(run.total_amount),
        executed_voucher_id=run.executed_voucher_id,
        trade_case_id=run.trade_case_id,
        remarks=run.remarks,
        created_by=run.created_by,
        items=[_payment_run_item_to_out(item) for item in sorted(items, key=lambda x: x.id)],
    )


async def _payment_run_out(db: AsyncSession, run: PaymentRun) -> PaymentRunOut:
    items = list((await db.execute(select(PaymentRunItem).where(PaymentRunItem.payment_run_id == run.id))).scalars().all())
    return _payment_run_to_out(run, items)


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
        version=1,
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
        version=1,
    )
    db.add(account)
    await db.flush()
    return account


def _apply_voucher_impact(account: ChartOfAccount, entry_type: str, amount: float | str | Decimal) -> None:
    apply_amount_to_account(account, entry_type, to_decimal(amount))


def _assert_posting_line_amounts(lines: list[VoucherLine]) -> None:
    """Reject negative amounts and unknown entry types before posting, whichever path created the lines."""
    for line in lines:
        if (line.entry_type or "").upper() not in ("DEBIT", "CREDIT"):
            raise HTTPException(status_code=400, detail=f"Invalid voucher line entry type: {line.entry_type}")
        if safe_decimal(line.amount) < 0:
            raise HTTPException(status_code=400, detail="Voucher line amounts cannot be negative")


async def _lock_chart_accounts_for_subset(
    db: AsyncSession,
    tenant_id: int,
    account_ids: Iterable[int],
) -> dict[int, ChartOfAccount]:
    """
    Load ChartOfAccount rows with SELECT ... FOR UPDATE, ordered by id.

    Ordering prevents deadlocks when two transactions post vouchers that share
    accounts but would otherwise lock rows in different orders.
    """
    ids = sorted(set(account_ids))
    if not ids:
        return {}
    result = await db.execute(
        select(ChartOfAccount)
        .where(
            ChartOfAccount.tenant_id == tenant_id,
            ChartOfAccount.id.in_(ids),
        )
        .order_by(ChartOfAccount.id)
        .with_for_update()
    )
    return {a.id: a for a in result.scalars().all()}


async def _lock_voucher(db: AsyncSession, tenant_id: int, voucher_id: int) -> Voucher:
    """Load a voucher with SELECT ... FOR UPDATE so concurrent post/reverse/cancel serialize.

    populate_existing refreshes any copy already in the session, so status checks
    after this call see the committed value, not a stale one.
    """
    row = (
        await db.execute(
            select(Voucher)
            .where(Voucher.id == voucher_id, Voucher.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return row


async def _refresh_voucher_fiscal_year(db: AsyncSession, tenant: Tenant, row: Voucher) -> str | None:
    """After a draft's date changes, keep fiscal_year (and the number series) in step with the date.

    Same financial year: number is kept. Different financial year on a series-numbered voucher:
    a new number is taken from the new year's series. Returns the old number when renumbered.
    """
    from app.modules.finance.fiscal_year import fiscal_year_of, fy_start_month

    new_fy = fiscal_year_of(row.voucher_date, fy_start_month(tenant.feature_flags))
    if row.fiscal_year == new_fy:
        return None
    if row.fiscal_year is None or not row.number_series_key:
        # Legacy / unnumbered-series voucher: record the year, keep the existing number.
        row.fiscal_year = new_fy
        return None
    old_number = row.voucher_number
    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant.id,
        voucher_date=row.voucher_date,
        voucher_type=row.voucher_type,
        branch_code=row.branch_code,
    )
    row.voucher_number = voucher_number
    row.series_sequence = series_seq
    row.number_series_key = series_key
    row.fiscal_year = fy
    return old_number


async def _assert_open_period(db: AsyncSession, tenant_id: int, on_date: date, *, what: str = "this voucher date") -> None:
    open_period = (
        await db.execute(
            select(AccountingPeriod.id).where(
                AccountingPeriod.tenant_id == tenant_id,
                AccountingPeriod.is_closed.is_(False),
                AccountingPeriod.start_date <= on_date,
                AccountingPeriod.end_date >= on_date,
            )
        )
    ).scalars().first()
    if not open_period:
        raise HTTPException(status_code=400, detail=f"No open accounting period for {what}")


async def _assert_no_facility_link(db: AsyncSession, tenant_id: int, voucher_id: int) -> None:
    """Facility drawdowns/repayments have no automatic undo; block silent ledger/facility drift."""
    from app.models.facility import FacilityTransaction

    linked = (
        await db.execute(
            select(FacilityTransaction.id)
            .where(FacilityTransaction.tenant_id == tenant_id, FacilityTransaction.voucher_id == voucher_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if linked is not None:
        raise HTTPException(
            status_code=409,
            detail="This voucher created a loan/facility transaction. Reverse it from the Facilities module instead.",
        )


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


def _assert_body_amounts_balanced(body: "VoucherBody | VoucherUpdateBody") -> tuple[float, float]:
    """Transaction-amount check for single-currency vouchers; base-currency check runs on the built lines."""
    debit_total = sum(_to_float(line.amount) for line in body.lines if line.entry_type == "DEBIT")
    credit_total = sum(_to_float(line.amount) for line in body.lines if line.entry_type == "CREDIT")
    line_currencies = {_normalize_currency(line.currency, default=body.currency) for line in body.lines}
    if len(line_currencies) <= 1 and round(debit_total, 4) != round(credit_total, 4):
        raise HTTPException(status_code=400, detail="Voucher is not balanced")
    return debit_total, credit_total


def _assert_voucher_transition(current_status: str, next_status: str) -> None:
    allowed = VOUCHER_WORKFLOW.get(current_status, set())
    if next_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid workflow transition from {current_status} to {next_status}",
        )


@router.get("/account-groups", response_model=list[AccountGroupOut])
async def list_account_groups(
    limit: int = Query(default=500, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(AccountGroup)
        .where(AccountGroup.tenant_id == tenant.id)
        .order_by(AccountGroup.sort_order, AccountGroup.name)
        .offset(offset).limit(limit)
    )
    return list(result.scalars().all())


@router.get("/account-groups/hierarchy", response_model=list[AccountGroupHierarchyNode])
async def list_account_groups_hierarchy(
    limit: int = Query(default=500, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return account groups as a tree (Group → Type → hierarchy) for tree UX and reports."""
    _ensure_tenant(user, tenant)
    # Only the default page (what the UI requests) is cached, so one key per tenant covers it.
    use_cache = get_settings().api_cache_enabled and limit == 500 and offset == 0
    cache_key = account_group_hierarchy_cache_key(tenant.id)
    if use_cache:
        cached = await cache_get_json(cache_key)
        if cached is not None:
            return cached
    result = await db.execute(
        select(AccountGroup)
        .where(AccountGroup.tenant_id == tenant.id)
        .order_by(AccountGroup.sort_order, AccountGroup.name)
        .offset(offset).limit(limit)
    )
    groups = list(result.scalars().all())
    # Account count per group_id
    count_stmt = (
        select(ChartOfAccount.group_id, func.count(ChartOfAccount.id).label("cnt"))
        .where(ChartOfAccount.tenant_id == tenant.id)
        .group_by(ChartOfAccount.group_id)
    )
    count_result = await db.execute(count_stmt)
    count_by_group = {r.group_id: r.cnt for r in count_result.all()}
    # Build tree with advanced fields
    by_id = {g.id: AccountGroupHierarchyNode(
        id=g.id,
        code=g.code,
        name=g.name,
        nature=g.nature,
        parent_group_id=g.parent_group_id,
        sort_order=g.sort_order,
        is_active=g.is_active,
        children=[],
        account_count=count_by_group.get(g.id, 0),
        description=g.description,
        reporting_code=g.reporting_code,
        default_normal_balance=g.default_normal_balance or "debit",
        allow_posting=g.allow_posting,
        is_summary_group=g.is_summary_group,
        last_reviewed_at=g.last_reviewed_at,
        depth=0,
    ) for g in groups}
    roots: list[AccountGroupHierarchyNode] = []
    for g in groups:
        node = by_id[g.id]
        if g.parent_group_id and g.parent_group_id in by_id:
            by_id[g.parent_group_id].children.append(node)
        else:
            roots.append(node)
    # Set depth and sort children
    def set_depth_and_sort(n: AccountGroupHierarchyNode, d: int) -> None:
        n.depth = d
        n.children.sort(key=lambda c: (c.sort_order, c.name))
        for c in n.children:
            set_depth_and_sort(c, d + 1)
    for r in roots:
        set_depth_and_sort(r, 0)
    roots.sort(key=lambda r: (r.sort_order, r.name))
    if use_cache:
        await cache_set_json(
            cache_key,
            [r.model_dump(mode="json") for r in roots],
            ACCOUNT_GROUP_HIERARCHY_CACHE_TTL_SECONDS,
        )
    return roots


async def _invalidate_account_group_hierarchy_cache(tenant_id: int) -> None:
    await cache_delete(account_group_hierarchy_cache_key(tenant_id))


@router.post("/account-groups", response_model=AccountGroupOut)
async def create_account_group(
    body: AccountGroupBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    coa_cfg = await _get_coa_config(db, tenant.id)
    code = (body.code or "").strip() if body.code else None
    if code:
        existing = await db.execute(
            select(AccountGroup).where(
                AccountGroup.tenant_id == tenant.id,
                AccountGroup.code == code,
            )
        )
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail="An account group with this code already exists")
    else:
        code = await next_tenant_code(
            db,
            model=AccountGroup,
            tenant_id=tenant.id,
            prefix=coa_cfg["group_code_prefix"],
            width=coa_cfg["group_code_width"],
        )
    await ensure_owned(db, AccountGroup, body.parent_group_id, tenant.id, "Parent account group")
    payload = body.model_dump(exclude={"code"})
    payload["code"] = code
    row = AccountGroup(tenant_id=tenant.id, **payload)
    db.add(row)
    await db.commit()
    await _invalidate_account_group_hierarchy_cache(tenant.id)
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
    if row.is_protected:
        allowed = {"name", "description", "reporting_code", "last_reviewed_at", "is_active"}
        data = body.model_dump()
        for key in allowed:
            if key in data:
                setattr(row, key, data[key])
        await db.commit()
        await _invalidate_account_group_hierarchy_cache(tenant.id)
        await db.refresh(row)
        return row
    await ensure_owned(db, AccountGroup, body.parent_group_id, tenant.id, "Parent account group")
    new_parent_id = body.parent_group_id if body.parent_group_id is not None else row.parent_group_id
    if new_parent_id is not None and await _account_group_parent_would_cycle(db, tenant.id, group_id, new_parent_id):
        raise HTTPException(
            status_code=400,
            detail="Cannot set parent: would create a circular reference in account group hierarchy.",
        )
    for key, value in body.model_dump().items():
        if key == "code":
            continue
        setattr(row, key, value)
    await db.commit()
    await _invalidate_account_group_hierarchy_cache(tenant.id)
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
    if row.is_protected:
        raise HTTPException(status_code=403, detail="Cannot delete a protected system account group")
    # Prevent delete if used as parent
    child = await db.execute(
        select(AccountGroup).where(
            AccountGroup.tenant_id == tenant.id,
            AccountGroup.parent_group_id == group_id,
        ).limit(1)
    )
    if child.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="Cannot delete: group has child groups. Remove or reparent children first.",
        )
    await db.delete(row)
    await db.commit()
    await _invalidate_account_group_hierarchy_cache(tenant.id)
    return {"ok": True}


@router.post("/account-groups/seed", response_model=list[AccountGroupOut])
async def seed_account_groups(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seed default account groups if none exist. Idempotent."""
    from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa

    _ensure_tenant(user, tenant)
    existing = await db.execute(select(AccountGroup).where(AccountGroup.tenant_id == tenant.id).limit(1))
    if not existing.scalars().first():
        defaults = [
            {"name": "Capital Account", "code": "CAPITAL", "nature": "Equity", "sort_order": 1},
            {"name": "Loans (Liability)", "code": "LOANS_LIABILITY", "nature": "Liability", "sort_order": 3},
            {"name": "Current Liabilities", "code": "CURRENT_LIABILITIES", "nature": "Liability", "sort_order": 6},
            {"name": "Current Assets", "code": "CURRENT_ASSETS", "nature": "Asset", "sort_order": 9},
            {"name": "Fixed Assets", "code": "FIXED_ASSETS", "nature": "Asset", "sort_order": 16},
            {"name": "Investments", "code": "INVESTMENTS", "nature": "Asset", "sort_order": 17},
            {
                "name": "Direct Expenses",
                "code": "DIRECT_EXPENSES",
                "nature": "Expense",
                "sort_order": 18,
                "affects_gross_profit": True,
            },
            {"name": "Indirect Expenses", "code": "INDIRECT_EXPENSES", "nature": "Expense", "sort_order": 20},
            {
                "name": "Direct Income",
                "code": "DIRECT_INCOME",
                "nature": "Income",
                "sort_order": 21,
                "affects_gross_profit": True,
            },
            {"name": "Indirect Income", "code": "INDIRECT_INCOME", "nature": "Income", "sort_order": 23},
        ]
        for d in defaults:
            row = AccountGroup(
                tenant_id=tenant.id,
                name=d["name"],
                code=d["code"],
                nature=d["nature"],
                sort_order=d["sort_order"],
                affects_gross_profit=d.get("affects_gross_profit", False),
                is_bank_group=False,
                is_active=True,
            )
            db.add(row)
        await db.commit()
    await seed_tenant_system_coa(db, tenant.id)
    await db.commit()
    await _invalidate_account_group_hierarchy_cache(tenant.id)
    result = await db.execute(
        select(AccountGroup).where(AccountGroup.tenant_id == tenant.id).order_by(AccountGroup.sort_order)
    )
    return list(result.scalars().all())


class SystemCoaSeedSummary(BaseModel):
    tenant_id: int
    created_groups: int
    created_ledgers: int
    created_mappings: int


@router.post("/system-coa/seed", response_model=SystemCoaSeedSummary)
async def seed_system_coa_for_tenant(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Idempotent: add missing system groups, ledgers, and accounting_system_mappings."""
    from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa

    _ensure_tenant(user, tenant)
    summary = await seed_tenant_system_coa(db, tenant.id)
    await db.commit()
    await _invalidate_account_group_hierarchy_cache(tenant.id)
    return SystemCoaSeedSummary(**summary)


@router.get("/chart-of-accounts", response_model=list[ChartAccountOut])
async def list_chart_of_accounts(
    response: Response,
    active_only: bool = Query(default=True),
    search: str | None = Query(default=None, description="Substring match on account number or name (case-insensitive)"),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    filters = [ChartOfAccount.tenant_id == tenant.id]
    if active_only:
        filters.append(ChartOfAccount.is_active.is_(True))
    if search and search.strip():
        pat = f"%{search.strip().lower()}%"
        filters.append(
            or_(
                func.lower(ChartOfAccount.account_number).like(pat),
                func.lower(ChartOfAccount.name).like(pat),
            )
        )
    total = int(
        (await db.execute(select(func.count(ChartOfAccount.id)).where(*filters))).scalar() or 0,
    )
    response.headers["X-Total-Count"] = str(total)
    stmt = (
        select(ChartOfAccount)
        .where(*filters)
        .order_by(ChartOfAccount.display_order, ChartOfAccount.account_number)
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/chart-of-accounts/{account_id}", response_model=ChartAccountOut)
async def get_chart_of_account(
    account_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ChartOfAccount, account_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Ledger account not found")
    return row


@router.post("/chart-of-accounts", response_model=ChartAccountOut)
async def create_chart_account(
    body: ChartAccountBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    coa_cfg = await _get_coa_config(db, tenant.id)
    group = await db.get(AccountGroup, body.group_id)
    if not group or group.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Account group not found")
    if coa_cfg["validate_normal_balance"] and body.normal_balance != group.default_normal_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Normal balance must be '{group.default_normal_balance}' for this account group.",
        )
    manual_code = (body.account_number or "").strip() if body.account_number else None
    if manual_code and coa_cfg["allow_manual_account_number"]:
        existing = await db.execute(
            select(ChartOfAccount).where(
                ChartOfAccount.tenant_id == tenant.id,
                ChartOfAccount.account_number == manual_code,
            )
        )
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail="An account with this number already exists")
        account_number = manual_code
    else:
        account_number = await next_tenant_code(
            db,
            model=ChartOfAccount,
            tenant_id=tenant.id,
            prefix=coa_cfg["account_number_prefix"],
            width=coa_cfg["account_number_width"],
        )
    await ensure_owned(db, ChartOfAccount, body.parent_account_id, tenant.id, "Parent ledger account")
    payload = body.model_dump(exclude={"account_number"})
    payload["account_number"] = account_number
    payload["balance"] = body.opening_balance
    row = ChartOfAccount(tenant_id=tenant.id, **payload)
    db.add(row)
    await db.commit()
    await _invalidate_account_group_hierarchy_cache(tenant.id)
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
    if row.is_protected:
        allowed = {
            "name",
            "description",
            "is_active",
            "reporting_code",
            "display_order",
            "last_reviewed_at",
            "statistical_unit",
            "statistical_formula",
            "cost_nature",
        }
        data = body.model_dump(exclude={"account_number"})
        for key in allowed:
            if key in data:
                setattr(row, key, data[key])
        await db.commit()
        await _invalidate_account_group_hierarchy_cache(tenant.id)
        await db.refresh(row)
        return row
    group = await db.get(AccountGroup, body.group_id)
    if not group or group.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Account group not found")
    coa_cfg = await _get_coa_config(db, tenant.id)
    if coa_cfg["validate_normal_balance"] and body.normal_balance != group.default_normal_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Normal balance must be '{group.default_normal_balance}' for this account group.",
        )
    await ensure_owned(db, ChartOfAccount, body.parent_account_id, tenant.id, "Parent ledger account")
    for key, value in body.model_dump(exclude={"account_number"}).items():
        setattr(row, key, value)
    await db.commit()
    await _invalidate_account_group_hierarchy_cache(tenant.id)
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
    if row.is_protected:
        raise HTTPException(status_code=403, detail="Cannot delete a protected system ledger")
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
    await _invalidate_account_group_hierarchy_cache(tenant.id)
    return {"ok": True}


# Report identifiers that use account groups (for reporting-impact).
COA_REPORT_IDS = [
    {"id": "group_summary", "label": "Group Summary"},
    {"id": "pl", "label": "Profit & Loss"},
    {"id": "balance_sheet", "label": "Balance Sheet"},
    {"id": "trial_balance", "label": "Trial Balance"},
    {"id": "financial_statements", "label": "Financial Statements"},
]


@router.get("/account-groups/{group_id}/reporting-impact")
async def get_account_group_reporting_impact(
    group_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return which reports reference this account group (read-only)."""
    _ensure_tenant(user, tenant)
    row = await db.get(AccountGroup, group_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Account group not found")
    return {"group_id": group_id, "reports": COA_REPORT_IDS}


@router.get("/coa-config", response_model=CoAConfigOut)
async def get_coa_config(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    r = await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant.id))
    cfg = r.scalars().first()
    if cfg:
        return cfg
    # Return default in-memory (no row yet)
    return CoAConfigOut(
        id=0,
        tenant_id=tenant.id,
        account_number_prefix="AC-",
        account_number_width=4,
        group_code_prefix="GRP-",
        group_code_width=4,
        allow_manual_account_number=False,
        max_group_depth=None,
        max_account_depth=None,
        validate_normal_balance=True,
        inventory_stock_account_id=None,
        inventory_clearing_account_id=None,
    )


@router.put("/coa-config", response_model=CoAConfigOut)
async def put_coa_config(
    body: CoAConfigBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    await ensure_all_owned(
        db,
        ChartOfAccount,
        [body.inventory_stock_account_id, body.inventory_clearing_account_id],
        tenant.id,
        "Ledger account",
    )
    r = await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant.id))
    cfg = r.scalars().first()
    payload = body.model_dump()
    if cfg:
        for k, v in payload.items():
            setattr(cfg, k, v)
        await db.commit()
        await db.refresh(cfg)
        return cfg
    row = CoAConfig(tenant_id=tenant.id, **payload)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


def _coa_export_csv(tenant_id: int, groups: list, accounts: list, group_by_id: dict, account_by_id: dict) -> str:
    sio = StringIO()
    w = csv.writer(sio)
    # Groups section
    w.writerow([
        "section", "code", "name", "parent_code", "nature", "sort_order", "is_active",
        "description", "reporting_code", "default_normal_balance", "allow_posting", "is_summary_group",
    ])
    for g in groups:
        parent_code = ""
        if g.parent_group_id and g.parent_group_id in group_by_id:
            parent_code = group_by_id[g.parent_group_id].code
        w.writerow([
            "group", g.code, g.name, parent_code, g.nature, g.sort_order, g.is_active,
            g.description or "", g.reporting_code or "", g.default_normal_balance or "debit",
            g.allow_posting, g.is_summary_group,
        ])
    # Accounts section
    w.writerow([
        "section", "account_number", "name", "group_code", "normal_balance", "opening_balance", "balance",
        "account_currency", "maintain_fc_balance", "description", "is_active", "is_bank_account",
        "account_type", "reporting_code", "display_order", "statistical_unit", "parent_account_number", "cost_nature",
    ])
    for a in accounts:
        group_code = group_by_id.get(a.group_id)
        group_code = group_code.code if group_code else ""
        parent_num = ""
        if getattr(a, "parent_account_id", None) and a.parent_account_id in account_by_id:
            parent_num = account_by_id[a.parent_account_id].account_number
        w.writerow([
            "account", a.account_number, a.name, group_code, a.normal_balance, a.opening_balance, a.balance,
            a.account_currency or "", a.maintain_fc_balance, a.description or "", a.is_active, a.is_bank_account,
            getattr(a, "account_type", "posting"), getattr(a, "reporting_code", "") or "",
            getattr(a, "display_order", 0), getattr(a, "statistical_unit", "") or "", parent_num,
            (getattr(a, "cost_nature", None) or "").strip(),
        ])
    return sio.getvalue()


@router.get("/coa/export")
async def coa_export(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export Chart of Accounts (groups and accounts) as CSV."""
    _ensure_tenant(user, tenant)
    gr = await db.execute(select(AccountGroup).where(AccountGroup.tenant_id == tenant.id).order_by(AccountGroup.sort_order, AccountGroup.name))
    groups = list(gr.scalars().all())
    ac = await db.execute(
        select(ChartOfAccount).where(ChartOfAccount.tenant_id == tenant.id).order_by(ChartOfAccount.display_order, ChartOfAccount.account_number)
    )
    accounts = list(ac.scalars().all())
    group_by_id = {g.id: g for g in groups}
    account_by_id = {a.id: a for a in accounts}
    csv_data = _coa_export_csv(tenant.id, groups, accounts, group_by_id, account_by_id)
    return BytesResponse(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="coa_export.csv"'},
    )


@router.post("/coa/import")
async def coa_import(
    file: UploadFile = File(...),
    conflict: str = Query(default="skip", description="skip | update | abort"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import Chart of Accounts from CSV or Excel (.xlsx, first sheet). conflict: skip / update / abort."""
    from app.common.spreadsheet_upload import upload_to_csv_text

    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    if conflict not in ("skip", "update", "abort"):
        raise HTTPException(status_code=400, detail="conflict must be skip, update, or abort")
    content = await file.read()
    text = upload_to_csv_text(file.filename, content)
    sio = StringIO(text)
    reader = csv.DictReader(sio)
    rows = list(reader)
    if len(rows) > 20000:
        raise HTTPException(status_code=400, detail="CSV has too many rows (max 20000)")
    if not rows:
        return {"ok": True, "groups_created": 0, "groups_updated": 0, "accounts_created": 0, "accounts_updated": 0, "errors": []}
    # Separate group and account rows by section column or by column count
    group_rows = []
    account_rows = []
    for r in rows:
        sec = (r.get("section") or "").strip().lower()
        if sec == "group":
            group_rows.append(r)
        elif sec == "account":
            account_rows.append(r)
    # Resolve group code -> id for parent and for account group_code
    existing_groups = (await db.execute(select(AccountGroup).where(AccountGroup.tenant_id == tenant.id))).scalars().all()
    code_to_group = {g.code: g for g in existing_groups}
    coa_cfg = await _get_coa_config(db, tenant.id)
    created_g = 0
    updated_g = 0
    errors = []
    aborted = False

    def _safe_int(value: str | None, *, default: int = 0) -> int:
        try:
            return int((value or "").strip() or default)
        except (TypeError, ValueError):
            return default

    for r in group_rows:
        code = (r.get("code") or "").strip()
        if not code:
            continue
        parent_code = (r.get("parent_code") or "").strip()
        parent_id = None
        if parent_code and parent_code in code_to_group:
            parent_id = code_to_group[parent_code].id
        name = (r.get("name") or "").strip() or code
        nature = (r.get("nature") or "Asset").strip()
        sort_order = _safe_int(r.get("sort_order"), default=0)
        is_active = (r.get("is_active") or "true").strip().lower() not in ("false", "0", "no")
        desc = (r.get("description") or "").strip() or None
        reporting_code = (r.get("reporting_code") or "").strip() or None
        default_normal_balance = (r.get("default_normal_balance") or "debit").strip().lower()
        if default_normal_balance not in ("debit", "credit"):
            default_normal_balance = "debit"
        allow_posting = (r.get("allow_posting") or "true").strip().lower() not in ("false", "0", "no")
        is_summary_group = (r.get("is_summary_group") or "false").strip().lower() in ("true", "1", "yes")
        if code in code_to_group:
            if conflict == "abort":
                errors.append(f"Group code already exists: {code}")
                aborted = True
                break
            if conflict == "update":
                g = code_to_group[code]
                g.name = name
                g.parent_group_id = parent_id
                g.nature = nature
                g.sort_order = sort_order
                g.is_active = is_active
                g.description = desc
                g.reporting_code = reporting_code
                g.default_normal_balance = default_normal_balance
                g.allow_posting = allow_posting
                g.is_summary_group = is_summary_group
                updated_g += 1
            # skip: do nothing
        else:
            new_group = AccountGroup(
                tenant_id=tenant.id,
                code=code,
                name=name,
                parent_group_id=parent_id,
                nature=nature,
                sort_order=sort_order,
                is_active=is_active,
                description=desc,
                reporting_code=reporting_code,
                default_normal_balance=default_normal_balance,
                allow_posting=allow_posting,
                is_summary_group=is_summary_group,
            )
            db.add(new_group)
            await db.flush()
            code_to_group[code] = new_group
            created_g += 1
    if aborted:
        await safe_async_session_rollback(db)
        return {"ok": False, "groups_created": 0, "groups_updated": 0, "accounts_created": 0, "accounts_updated": 0, "errors": errors}

    existing_accounts = (await db.execute(select(ChartOfAccount).where(ChartOfAccount.tenant_id == tenant.id))).scalars().all()
    num_to_account = {a.account_number: a for a in existing_accounts}
    created_a = 0
    updated_a = 0
    for r in account_rows:
        account_number = (r.get("account_number") or "").strip()
        if not account_number:
            continue
        group_code = (r.get("group_code") or "").strip()
        if group_code not in code_to_group:
            errors.append(f"Unknown group_code for account {account_number}: {group_code}")
            continue
        group_id = code_to_group[group_code].id
        name = (r.get("name") or "").strip() or account_number
        normal_balance = (r.get("normal_balance") or "debit").strip().lower()
        if normal_balance not in ("debit", "credit"):
            normal_balance = "debit"
        opening_balance = (r.get("opening_balance") or "0").strip()
        account_currency = (r.get("account_currency") or "").strip() or None
        maintain_fc = (r.get("maintain_fc_balance") or "false").strip().lower() in ("true", "1", "yes")
        desc = (r.get("description") or "").strip() or None
        is_active = (r.get("is_active") or "true").strip().lower() not in ("false", "0", "no")
        is_bank = (r.get("is_bank_account") or "false").strip().lower() in ("true", "1", "yes")
        account_type = (r.get("account_type") or "posting").strip().lower()
        if account_type not in ("posting", "statistical", "header"):
            account_type = "posting"
        reporting_code = (r.get("reporting_code") or "").strip() or None
        display_order = _safe_int(r.get("display_order"), default=0)
        statistical_unit = (r.get("statistical_unit") or "").strip() or None
        parent_account_number = (r.get("parent_account_number") or "").strip()
        parent_account_id = None
        if parent_account_number and parent_account_number in num_to_account:
            parent_account_id = num_to_account[parent_account_number].id
        cost_nature_raw = (r.get("cost_nature") or "").strip().upper()
        cost_nature_val: str | None = cost_nature_raw if cost_nature_raw in COST_NATURE_CODES else None
        if cost_nature_raw and cost_nature_val is None:
            errors.append(f"Invalid cost_nature '{cost_nature_raw}' for account {account_number}; ignored.")
        if account_number in num_to_account:
            if conflict == "abort":
                errors.append(f"Account number already exists: {account_number}")
                aborted = True
                break
            if conflict == "update":
                acct = num_to_account[account_number]
                acct.name = name
                acct.group_id = group_id
                acct.normal_balance = normal_balance
                acct.account_currency = account_currency
                acct.maintain_fc_balance = maintain_fc
                acct.description = desc
                acct.is_active = is_active
                acct.is_bank_account = is_bank
                acct.account_type = account_type
                acct.reporting_code = reporting_code
                acct.display_order = display_order
                acct.statistical_unit = statistical_unit
                acct.parent_account_id = parent_account_id
                if "cost_nature" in r:
                    acct.cost_nature = cost_nature_val
                updated_a += 1
        else:
            new_acct = ChartOfAccount(
                tenant_id=tenant.id,
                account_number=account_number,
                name=name,
                group_id=group_id,
                normal_balance=normal_balance,
                opening_balance=opening_balance,
                balance=opening_balance,
                account_currency=account_currency,
                maintain_fc_balance=maintain_fc,
                description=desc,
                is_active=is_active,
                is_bank_account=is_bank,
                account_type=account_type,
                reporting_code=reporting_code,
                display_order=display_order,
                statistical_unit=statistical_unit,
                parent_account_id=parent_account_id,
                cost_nature=cost_nature_val,
                version=1,
            )
            db.add(new_acct)
            await db.flush()
            num_to_account[account_number] = new_acct
            created_a += 1
    if aborted:
        await safe_async_session_rollback(db)
        return {"ok": False, "groups_created": 0, "groups_updated": 0, "accounts_created": 0, "accounts_updated": 0, "errors": errors}
    await db.commit()
    await _invalidate_account_group_hierarchy_cache(tenant.id)
    return {"ok": True, "groups_created": created_g, "groups_updated": updated_g, "accounts_created": created_a, "accounts_updated": updated_a, "errors": errors}


@router.get("/vouchers/types", response_model=list[VoucherTypeOut])
async def list_voucher_types(
    active_only: bool = Query(default=False),
    limit: int = Query(default=500, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
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
                .offset(offset).limit(limit)
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
    await _require_manager_or_admin(db, user, tenant.id)
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
    response: Response,
    status_filter: str | None = Query(default=None),
    status_filters: list[str] | None = Query(
        default=None,
        description="Repeat to match any of several statuses (e.g. ?status_filters=SUBMITTED&status_filters=CHECKED)",
    ),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    search: str | None = Query(
        default=None,
        description="Substring match on voucher number, type, reference, narration, or status (case-insensitive)",
    ),
    voucher_id: int | None = Query(default=None, description="Exact voucher id filter (e.g. ?voucher_id= from deep link)"),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    sort: Literal["id", "date"] = Query(
        default="id", description="id = newest created first (default); date = newest voucher_date first"
    ),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    multi_statuses = sorted({s.strip().upper() for s in (status_filters or []) if s and s.strip()})
    if status_filter and multi_statuses:
        raise HTTPException(status_code=400, detail="Use either status_filter or status_filters, not both")
    filters = [Voucher.tenant_id == tenant.id]
    if status_filter:
        filters.append(Voucher.status == status_filter.strip().upper())
    if multi_statuses:
        filters.append(Voucher.status.in_(multi_statuses))
    if from_date:
        filters.append(Voucher.voucher_date >= from_date)
    if to_date:
        filters.append(Voucher.voucher_date <= to_date)
    if voucher_id is not None:
        filters.append(Voucher.id == voucher_id)
    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        filters.append(
            or_(
                func.lower(Voucher.voucher_number).like(q),
                func.lower(Voucher.voucher_type).like(q),
                func.lower(func.coalesce(Voucher.reference, "")).like(q),
                func.lower(func.coalesce(Voucher.description, "")).like(q),
                func.lower(Voucher.status).like(q),
            )
        )
    total = int((await db.execute(select(func.count(Voucher.id)).where(*filters))).scalar() or 0)
    response.headers["X-Total-Count"] = str(total)
    order_cols = (Voucher.voucher_date.desc(), Voucher.id.desc()) if sort == "date" else (Voucher.id.desc(),)
    stmt = select(Voucher).where(*filters).order_by(*order_cols).offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    if not rows:
        return []
    voucher_ids = [r.id for r in rows]
    lines_result = await db.execute(
        select(VoucherLine)
        .where(VoucherLine.voucher_id.in_(voucher_ids))
        .order_by(VoucherLine.voucher_id, VoucherLine.id)
    )
    lines_by_voucher: dict[int, list[VoucherLine]] = defaultdict(list)
    for line in lines_result.scalars().all():
        lines_by_voucher[line.voucher_id].append(line)
    return [_voucher_to_out(row, lines_by_voucher.get(row.id, [])) for row in rows]


@router.post("/vouchers/duplicate-risk-check")
async def duplicate_voucher_risk_check(
    body: DuplicateRiskCheckBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft duplicate check before save: compares fingerprint to already-posted vouchers."""
    _ensure_tenant(user, tenant)
    if not body.lines:
        raise HTTPException(status_code=400, detail="At least one line is required")
    debit_total = sum(_to_float(line.amount) for line in body.lines if line.entry_type == "DEBIT")
    credit_total = sum(_to_float(line.amount) for line in body.lines if line.entry_type == "CREDIT")
    if round(debit_total, 4) != round(credit_total, 4):
        raise HTTPException(status_code=400, detail="Voucher is not balanced")
    h = compute_duplicate_risk_hash(
        tenant_id=tenant.id,
        voucher_date=body.voucher_date,
        reference=body.reference,
        line_account_ids=[line.account_id for line in body.lines],
        debit_total=debit_total,
        credit_total=credit_total,
    )
    similar = await find_conflicting_posted_vouchers(
        db,
        tenant_id=tenant.id,
        duplicate_risk_hash=h,
        exclude_voucher_id=None,
    )
    return {
        "duplicate_risk_hash": h,
        "similar_posted_voucher_ids": similar,
        "risk_level": "high" if similar else "none",
    }


@router.get("/vouchers/{voucher_id}", response_model=VoucherOut)
async def get_voucher(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Voucher, voucher_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return await _voucher_out(db, row)


@router.post("/vouchers", response_model=VoucherOut)
async def create_voucher(
    body: VoucherBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if not (body.description or "").strip():
        raise HTTPException(status_code=400, detail="Narration / description is required for audit purposes")
    voucher_type_code = body.voucher_type.strip().upper()
    if voucher_type_code not in await _active_voucher_type_codes(db, tenant.id):
        raise HTTPException(status_code=400, detail="Voucher type is inactive or not configured")
    if not body.lines:
        raise HTTPException(status_code=400, detail="Voucher must have at least one line")
    debit_total, credit_total = _assert_body_amounts_balanced(body)
    if body.btb_lc_id is not None:
        btb_lc = await db.get(BtbLc, body.btb_lc_id)
        if not btb_lc or btb_lc.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="BTB LC not found")
    if body.facility_utilization_id is not None:
        fu = await db.get(FacilityUtilization, body.facility_utilization_id)
        if not fu or fu.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Facility utilization not found")
    await ensure_owned(db, BankReconciliation, body.bank_reconciliation_id, tenant.id, "Bank reconciliation")
    await ensure_owned(db, TradeCase, body.trade_case_id, tenant.id, "Trade case")
    txn_currency = _normalize_currency(body.currency, default="BDT")
    base_currency = _normalize_currency(body.base_currency, default=getattr(tenant, "base_currency", None) or "BDT")
    rate_source = (body.exchange_rate_source or "system").strip() or "system"
    fetched_at = body.exchange_rate_fetched_at
    exchange_rate_value: float | None = None
    if body.exchange_rate is not None:
        exchange_rate_value = _to_float(body.exchange_rate)
        if exchange_rate_value <= 0:
            raise HTTPException(status_code=400, detail="Exchange rate must be greater than zero")
        rate_source = "manual" if rate_source == "system" else rate_source
        fetched_at = fetched_at or datetime.utcnow()
    else:
        exchange_rate_value, rate_source, fetched_at = await _lookup_exchange_rate(
            db, tenant.id, txn_currency, base_currency
        )
    branch = ((body.branch_code or "").strip() or "MAIN")[:32]
    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant.id,
        voucher_date=body.voucher_date,
        voucher_type=voucher_type_code,
        branch_code=branch,
    )
    row = Voucher(
        tenant_id=tenant.id,
        voucher_number=voucher_number,
        voucher_type=voucher_type_code,
        voucher_date=body.voucher_date,
        status="DRAFT",
        description=body.description,
        reference=body.reference,
        branch_code=branch,
        fiscal_year=fy,
        series_sequence=series_seq,
        number_series_key=series_key,
        source_module="MANUAL",
        source_module_ref=None,
        allow_manual_edit=True,
        instrument_reference=(body.instrument_reference or None),
        bank_reconciliation_id=body.bank_reconciliation_id,
        currency=txn_currency,
        base_currency=base_currency,
        exchange_rate=str(round(exchange_rate_value or 1.0, 8)),
        exchange_rate_source=rate_source,
        exchange_rate_fetched_at=fetched_at,
        trade_case_id=body.trade_case_id,
        btb_lc_id=body.btb_lc_id,
        facility_utilization_id=body.facility_utilization_id,
        created_by=user.id,
    )
    db.add(row)
    await db.flush()
    created_lines: list[VoucherLine] = []
    for line in body.lines:
        acct = await db.get(ChartOfAccount, line.account_id)
        if not acct or acct.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail=f"Account not found: {line.account_id}")
        if line.cost_center_id is not None:
            center = await db.get(CostCenter, line.cost_center_id)
            if not center or center.tenant_id != tenant.id:
                raise HTTPException(status_code=404, detail=f"Cost center not found: {line.cost_center_id}")
        if getattr(acct, "account_type", "posting") == "header":
            raise HTTPException(
                status_code=400,
                detail=f"Posting not allowed to header account: {acct.account_number}",
            )
        grp = await db.get(AccountGroup, acct.group_id)
        if grp and grp.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Account group not found")
        if grp and not getattr(grp, "allow_posting", True):
            raise HTTPException(
                status_code=400,
                detail=f"Posting not allowed to accounts in group '{grp.name}' (summary/post-disabled).",
            )
        line_currency = _normalize_currency(line.currency, default=txn_currency)
        line_rate = _to_float(line.exchange_rate) if line.exchange_rate is not None else (exchange_rate_value or 1.0)
        if line_rate <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid exchange rate for account {line.account_id}")
        amount_value = _to_float(line.amount)
        base_amount_value = _to_float(line.base_amount) if line.base_amount is not None else amount_value * line_rate
        voucher_line = VoucherLine(
            tenant_id=tenant.id,
            voucher_id=row.id,
            account_id=line.account_id,
            cost_center_id=line.cost_center_id,
            currency=line_currency,
            exchange_rate=str(round(line_rate, 8)),
            base_amount=str(round(base_amount_value, 4)),
            is_rate_overridden=bool(line.is_rate_overridden or line.exchange_rate is not None),
            rate_source=(line.rate_source or ("manual" if line.exchange_rate is not None else rate_source)).strip() or "system",
            entry_type=line.entry_type,
            amount=line.amount,
            notes=line.notes,
            cost_nature_override=line.cost_nature_override,
        )
        db.add(
            voucher_line
        )
        created_lines.append(voucher_line)
    assert_lines_balanced(created_lines)
    _apply_internal_signature(row, created_lines)
    await db.flush()
    control_warnings: list[str] = []
    control_warnings.extend(
        await collect_bank_cash_control_warnings(
            db,
            tenant.id,
            created_lines,
            voucher_type=voucher_type_code,
            instrument_reference=body.instrument_reference,
        )
    )
    dup_hash = compute_duplicate_risk_hash(
        tenant_id=tenant.id,
        voucher_date=body.voucher_date,
        reference=body.reference,
        line_account_ids=[line.account_id for line in body.lines],
        debit_total=debit_total,
        credit_total=credit_total,
    )
    similar = await find_conflicting_posted_vouchers(
        db,
        tenant_id=tenant.id,
        duplicate_risk_hash=dup_hash,
        exclude_voucher_id=row.id,
    )
    if similar:
        control_warnings.append(
            "Possible duplicate risk: same fingerprint as posted voucher(s) "
            + ", ".join(str(v) for v in similar)
        )
    # Sprint 3: optional auto GST lines (flag-gated; never blocks create)
    try:
        from app.modules.finance.gst_tax_hooks import maybe_auto_calculate_tax_on_voucher

        await maybe_auto_calculate_tax_on_voucher(
            db,
            tenant.id,
            row,
            feature_flags=tenant.feature_flags,
        )
    except Exception:
        pass
    await record_voucher_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_id=row.id,
        event="created",
        summary=f"Created {voucher_type_code} {voucher_number} for {round(debit_total, 2):,.2f} ({len(body.lines)} lines)",
        to_status="DRAFT",
    )
    await db.commit()
    await db.refresh(row)
    return await _voucher_out(db, row, control_warnings=control_warnings or None)


@router.patch("/vouchers/{voucher_id}", response_model=VoucherOut)
async def update_voucher(
    voucher_id: int,
    body: VoucherUpdateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if not (body.description or "").strip():
        raise HTTPException(status_code=400, detail="Narration / description is required for audit purposes")
    # Row lock: a concurrent approve/post waits for this edit (and vice versa), and the status
    # check below sees the latest committed status instead of a stale copy.
    row = await _lock_voucher(db, tenant.id, voucher_id)
    _require_manual_voucher_edit(row)
    if row.status not in {"DRAFT", "REJECTED"}:
        raise HTTPException(status_code=400, detail="Only DRAFT or REJECTED vouchers can be edited")
    if not body.lines:
        raise HTTPException(status_code=400, detail="Voucher must have at least one line")
    voucher_type_code = body.voucher_type.strip().upper()
    if voucher_type_code not in await _active_voucher_type_codes(db, tenant.id):
        raise HTTPException(status_code=400, detail="Voucher type is inactive or not configured")
    _assert_body_amounts_balanced(body)
    await ensure_owned(db, BankReconciliation, body.bank_reconciliation_id, tenant.id, "Bank reconciliation")

    before_header = header_snapshot(row)
    before_lines = lines_snapshot(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == row.id))).scalars().all()
    )
    txn_currency = _normalize_currency(body.currency, default=row.currency)
    base_currency = _normalize_currency(body.base_currency, default=row.base_currency)
    if body.exchange_rate is not None:
        exchange_rate_value = _to_float(body.exchange_rate)
        if exchange_rate_value <= 0:
            raise HTTPException(status_code=400, detail="Exchange rate must be greater than zero")
        rate_source = "manual"
        fetched_at = datetime.utcnow()
    else:
        exchange_rate_value, rate_source, fetched_at = await _lookup_exchange_rate(
            db, tenant.id, txn_currency, base_currency
        )

    row.voucher_type = voucher_type_code
    row.voucher_date = body.voucher_date
    row.description = body.description
    row.reference = body.reference
    if body.branch_code is not None:
        row.branch_code = (body.branch_code.strip() or "MAIN")[:32]
    if body.instrument_reference is not None:
        row.instrument_reference = (body.instrument_reference.strip()[:128] or None)
    if body.bank_reconciliation_id is not None:
        row.bank_reconciliation_id = body.bank_reconciliation_id
    renumbered_from = await _refresh_voucher_fiscal_year(db, tenant, row)
    row.currency = txn_currency
    row.base_currency = base_currency
    row.exchange_rate = str(round(exchange_rate_value, 8))
    row.exchange_rate_source = rate_source
    row.exchange_rate_fetched_at = fetched_at
    if "facility_utilization_id" in body.model_fields_set:
        if body.facility_utilization_id is not None:
            fu = await db.get(FacilityUtilization, body.facility_utilization_id)
            if not fu or fu.tenant_id != tenant.id:
                raise HTTPException(status_code=400, detail="Facility utilization not found")
        row.facility_utilization_id = body.facility_utilization_id

    existing_lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == row.id))).scalars().all())
    for old_line in existing_lines:
        await db.delete(old_line)
    await db.flush()

    updated_lines: list[VoucherLine] = []
    for line in body.lines:
        acct = await db.get(ChartOfAccount, line.account_id)
        if not acct or acct.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail=f"Account not found: {line.account_id}")
        if line.cost_center_id is not None:
            center = await db.get(CostCenter, line.cost_center_id)
            if not center or center.tenant_id != tenant.id:
                raise HTTPException(status_code=404, detail=f"Cost center not found: {line.cost_center_id}")
        if getattr(acct, "account_type", "posting") == "header":
            raise HTTPException(
                status_code=400,
                detail=f"Posting not allowed to header account: {acct.account_number}",
            )
        grp = await db.get(AccountGroup, acct.group_id)
        if grp and grp.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Account group not found")
        if grp and not getattr(grp, "allow_posting", True):
            raise HTTPException(
                status_code=400,
                detail=f"Posting not allowed to accounts in group '{grp.name}' (summary/post-disabled).",
            )
        line_currency = _normalize_currency(line.currency, default=txn_currency)
        line_rate = _to_float(line.exchange_rate) if line.exchange_rate is not None else exchange_rate_value
        if line_rate <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid exchange rate for account {line.account_id}")
        amount_value = _to_float(line.amount)
        base_amount_value = _to_float(line.base_amount) if line.base_amount is not None else amount_value * line_rate
        voucher_line = VoucherLine(
            tenant_id=tenant.id,
            voucher_id=row.id,
            account_id=line.account_id,
            cost_center_id=line.cost_center_id,
            currency=line_currency,
            exchange_rate=str(round(line_rate, 8)),
            base_amount=str(round(base_amount_value, 4)),
            is_rate_overridden=bool(line.is_rate_overridden or line.exchange_rate is not None),
            rate_source=(line.rate_source or ("manual" if line.exchange_rate is not None else rate_source)).strip() or "system",
            entry_type=line.entry_type,
            amount=line.amount,
            notes=line.notes,
            cost_nature_override=line.cost_nature_override,
        )
        db.add(voucher_line)
        updated_lines.append(voucher_line)

    assert_lines_balanced(updated_lines)
    _apply_internal_signature(row, updated_lines)
    try:
        from app.modules.finance.gst_tax_hooks import maybe_auto_calculate_tax_on_voucher

        await maybe_auto_calculate_tax_on_voucher(
            db,
            tenant.id,
            row,
            feature_flags=tenant.feature_flags,
        )
    except Exception:
        pass
    changes = diff_voucher(before_header, before_lines, header_snapshot(row), lines_snapshot(updated_lines))
    if renumbered_from is not None:
        changes["voucher_number"] = {"from": renumbered_from, "to": row.voucher_number}
    changed_names = [k for k in changes if k != "lines"] + (["lines"] if "lines" in changes else [])
    await record_voucher_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_id=row.id,
        event="updated",
        summary=f"Edited: {', '.join(changed_names)}" if changed_names else "Saved with no changes",
        changes=changes,
    )
    await db.commit()
    await db.refresh(row)
    return await _voucher_out(db, row)


@router.delete("/vouchers/{voucher_id}")
async def delete_voucher(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Voucher, voucher_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    _require_manual_voucher_edit(row)
    if row.status in {"POSTED", "REVERSED"}:
        raise HTTPException(status_code=400, detail="Posted/reversed vouchers cannot be deleted")
    lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == row.id))).scalars().all())
    await record_voucher_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_id=row.id,
        event="deleted",
        summary=f"Deleted {row.voucher_type} {row.voucher_number} (was {row.status})",
        from_status=row.status,
        changes={"header": header_snapshot(row), "lines": lines_snapshot(lines)},
    )
    for line in lines:
        await db.delete(line)
    await db.delete(row)
    await db.commit()
    return {"ok": True, "message": "Voucher deleted"}


class VoucherStatusUpdateBody(BaseModel):
    status: str
    budget_override: bool = False
    budget_override_reason: str | None = None
    # Optional note shown in the voucher History (e.g. why it was rejected).
    reason: str | None = Field(default=None, max_length=1000)


class VoucherPostPreflightOut(BaseModel):
    ok: bool
    mode: str
    remaining: float | None = None
    warnings: list[str] = []
    has_budget: bool = False
    budget_amount: float | None = None
    used_amount: float | None = None
    pending_amount: float | None = None
    projected: float | None = None
    status: str = "within_budget"
    enforcement_mode: str = "off"
    can_post: bool = True
    warning_message: str | None = None


class VoucherPostBody(BaseModel):
    budget_override: bool = False
    budget_override_reason: str | None = None


@router.post("/vouchers/{voucher_id}/post-preflight", response_model=VoucherPostPreflightOut)
async def voucher_post_preflight(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check budget utilization before posting (does not change voucher status)."""
    _ensure_tenant(user, tenant)
    row = await db.get(Voucher, voucher_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    line_rows = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == row.id))).scalars().all()
    )
    result = await evaluate_voucher_budget(
        db,
        tenant_id=tenant.id,
        feature_flags=tenant.feature_flags,
        voucher=row,
        lines=line_rows,
    )
    return VoucherPostPreflightOut(
        ok=result.ok,
        mode=result.mode,
        remaining=result.remaining,
        warnings=result.warnings,
        has_budget=result.has_budget,
        budget_amount=result.budget_amount,
        used_amount=result.used_amount,
        pending_amount=result.pending_amount,
        projected=result.projected,
        status=result.status,
        enforcement_mode=result.enforcement_mode or result.mode,
        can_post=result.can_post,
        warning_message=result.warning_message,
    )


@router.post("/vouchers/{voucher_id}/status", response_model=VoucherOut)
async def update_voucher_status(
    voucher_id: int,
    body: VoucherStatusUpdateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await _lock_voucher(db, tenant.id, voucher_id)
    previous_status = row.status
    next_status = (body.status or "").strip().upper()
    budget_override = bool(body.budget_override)
    budget_override_reason = body.budget_override_reason
    allowed = set(VOUCHER_WORKFLOW.keys())
    if next_status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid voucher status")
    if next_status == "POSTED" and row.status == "POSTED":
        raise HTTPException(status_code=409, detail="Voucher is already posted")
    if next_status != row.status:
        _assert_voucher_transition(row.status, next_status)
    # Approval, posting, rejection and cancellation are restricted; a creator may
    # still cancel their own draft.
    if next_status != row.status:
        own_draft_cancel = (
            next_status == "CANCELLED" and row.status == "DRAFT" and row.created_by == user.id
        )
        if next_status in {"CHECKED", "RECOMMENDED", "APPROVED", "POSTED", "REJECTED", "CANCELLED"} and not own_draft_cancel:
            await _require_manager_or_admin(db, user, tenant.id)
    post_control_warnings: list[str] = []
    from app.modules.finance.advanced_voucher_service import voucher_should_affect_books

    affect_books = voucher_should_affect_books(row)
    if next_status == "POSTED" and row.status != "POSTED":
        pre_post_lines = list(
            (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == row.id))).scalars().all()
        )
        if affect_books or pre_post_lines:
            _assert_posting_line_amounts(pre_post_lines)
            assert_lines_balanced(pre_post_lines)
        if affect_books:
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
            try:
                from app.modules.finance.tds_service import split_tds_into_payment_voucher

                async with db.begin_nested():
                    await split_tds_into_payment_voucher(
                        db, tenant.id, row, feature_flags=tenant.feature_flags, created_by=user.id
                    )
            except Exception:
                logging.getLogger(__name__).exception("TDS split on payment failed voucher=%s", row.id)
            lines_result = await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == row.id))
            line_rows = list(lines_result.scalars().all())
            budget_check = await evaluate_voucher_budget(
                db,
                tenant_id=tenant.id,
                feature_flags=tenant.feature_flags,
                voucher=row,
                lines=line_rows,
            )
            if budget_check.over_budget and budget_check.mode == "block":
                if not budget_override:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "message": "Budget exceeded — posting blocked",
                            "code": "budget_exceeded",
                            "remaining": budget_check.remaining,
                            "warnings": budget_check.warnings,
                            "mode": budget_check.mode,
                            "status": budget_check.status,
                            "has_budget": budget_check.has_budget,
                            "budget_amount": budget_check.budget_amount,
                            "used_amount": budget_check.used_amount,
                            "pending_amount": budget_check.pending_amount,
                            "projected": budget_check.projected,
                        },
                    )
                reason = (budget_override_reason or "").strip()
                if not reason:
                    raise HTTPException(
                        status_code=400,
                        detail="budget_override_reason is required when overriding a budget block",
                    )
                await assert_delegate_manager_or_permission(
                    db, user, tenant.id, permission_key=PERMISSION_FINANCE_BUDGET_OVERRIDE
                )
                post_control_warnings.append(f"Budget override: {reason}")
                post_control_warnings.extend(budget_check.warnings)
            elif budget_check.warnings:
                # warn mode, near_limit, or exceeded-under-warn — allow and surface warnings
                post_control_warnings.extend(budget_check.warnings)
            if getattr(row, "fiscal_year", None) is None:
                row.fiscal_year = fiscal_year_calendar(row.voucher_date)
            post_control_warnings = list(post_control_warnings) + list(
                await finalize_posted_voucher_metadata(
                    db, tenant.id, row, line_rows, strict_duplicate_check=True
                )
            )
            await apply_voucher_to_books(db, tenant.id, row, line_rows)
        else:
            row.books_applied = False
            post_control_warnings.append("Posted without books impact (memorandum/optional/post-dated/stock transfer)")
    row.status = next_status
    if next_status == "POSTED" and affect_books:
        from app.modules.facility.posting_hooks import process_facility_voucher_posted
        from app.modules.commercial.proforma_receipt_service import sync_allocation_status_for_voucher
        from app.modules.commercial.commercial_invoice_service import sync_ci_allocation_status_for_voucher
        from app.modules.finance.party_ledger_hooks import on_voucher_posted

        await process_facility_voucher_posted(db, tenant.id, row, user.id)
        await sync_allocation_status_for_voucher(db, tenant_id=tenant.id, voucher=row)
        await sync_ci_allocation_status_for_voucher(db, tenant_id=tenant.id, voucher=row)
        await on_voucher_posted(
            db,
            tenant.id,
            row,
            feature_flags=tenant.feature_flags,
            created_by=user.id,
        )
        try:
            from app.modules.finance.tds_service import maybe_auto_tds_on_payment_voucher

            async with db.begin_nested():
                await maybe_auto_tds_on_payment_voucher(
                    db,
                    tenant.id,
                    row,
                    feature_flags=tenant.feature_flags,
                    created_by=user.id,
                )
        except Exception:
            import logging

            logging.getLogger(__name__).exception("auto TDS on payment failed voucher=%s", row.id)
    elif next_status in {"REVERSED", "CANCELLED"}:
        from app.modules.commercial.proforma_receipt_service import sync_allocation_status_for_voucher
        from app.modules.commercial.commercial_invoice_service import sync_ci_allocation_status_for_voucher
        from app.modules.finance.party_ledger_hooks import on_voucher_cancelled
        from app.modules.finance.tds_service import on_payment_voucher_cancelled

        await on_payment_voucher_cancelled(db, tenant.id, row)
        await sync_allocation_status_for_voucher(db, tenant_id=tenant.id, voucher=row)
        await sync_ci_allocation_status_for_voucher(db, tenant_id=tenant.id, voucher=row)
        await on_voucher_cancelled(db, tenant.id, row, feature_flags=tenant.feature_flags)
    if previous_status != next_status and next_status in {"APPROVED", "REJECTED", "POSTED", "CANCELLED"}:
        from app.modules.notifications.service import notify_user

        notify_user(
            db,
            tenant_id=tenant.id,
            user_id=row.created_by,
            actor_user_id=user.id,
            kind=f"finance.voucher.{next_status.lower()}",
            title=f"Voucher {row.voucher_number} {next_status.lower()}",
            body=f"{row.voucher_type} voucher dated {row.voucher_date.isoformat()} was {next_status.lower()}.",
            href=f"/app/accounts/vouchers/{row.id}",
        )
    lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == row.id))).scalars().all())
    _apply_internal_signature(row, lines)
    if previous_status != next_status:
        reason_parts = [p for p in ((body.reason or "").strip(), (budget_override_reason or "").strip() if budget_override else "") if p]
        await record_voucher_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            voucher_id=row.id,
            event="status",
            summary=f"{previous_status} → {next_status}",
            from_status=previous_status,
            to_status=next_status,
            reason=" | ".join(reason_parts) or None,
        )
    await db.commit()
    await db.refresh(row)
    if next_status == "POSTED" and affect_books and (row.voucher_type or "").upper() == "RECEIPT":
        from app.modules.orders.pipeline_service import auto_advance_order_pipeline

        oids: set[int] = set()
        if row.order_id:
            oids.add(int(row.order_id))
        if row.trade_case_id:
            tc = await db.get(TradeCase, row.trade_case_id)
            if tc and tc.tenant_id == tenant.id and tc.order_id:
                oids.add(int(tc.order_id))
        for oid in oids:
            await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=oid)
        if oids:
            await db.commit()
    return await _voucher_out(db, row, control_warnings=post_control_warnings or None)


@router.get("/reports/day-book")
async def day_book_report(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    voucher_type: str | None = Query(default=None),
    account_id: int | None = Query(default=None),
    group_id: int | None = Query(default=None),
    party_name: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=MAX_PAGE_SIZE, description="Optional page size"),
    offset: int = Query(default=0, ge=0, description="Optional rows to skip (with limit)"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Vouchers in the date range with their debit total. All filters run in SQL.

    Without ``limit`` every matching row is returned (original behaviour). ``total_amount`` and
    ``total_count`` always cover all matching vouchers, not just the page.
    """
    _ensure_tenant(user, tenant)
    from app.modules.finance.advanced_voucher_service import voucher_visible_in_day_book_clause

    if from_date is None:
        from_date = today_local(tenant).replace(day=1)
    if to_date is None:
        to_date = today_local(tenant)
    filters = [
        Voucher.tenant_id == tenant.id,
        Voucher.voucher_date >= from_date,
        Voucher.voucher_date <= to_date,
        voucher_visible_in_day_book_clause(),
    ]
    if voucher_type:
        filters.append(Voucher.voucher_type == voucher_type.upper())
    if party_name:
        q = f"%{party_name.strip().lower()}%"
        filters.append(
            func.lower(func.coalesce(Voucher.reference, "")).like(q)
            | func.lower(func.coalesce(Voucher.description, "")).like(q)
        )
    if account_id is not None:
        filters.append(
            select(VoucherLine.id)
            .where(VoucherLine.voucher_id == Voucher.id, VoucherLine.account_id == account_id)
            .exists()
        )
    if group_id is not None:
        filters.append(
            select(VoucherLine.id)
            .join(ChartOfAccount, ChartOfAccount.id == VoucherLine.account_id)
            .where(
                VoucherLine.voucher_id == Voucher.id,
                ChartOfAccount.tenant_id == tenant.id,
                ChartOfAccount.group_id == group_id,
            )
            .exists()
        )
    debit_amount = (
        select(func.coalesce(func.sum(VoucherLine.amount), 0))
        .where(VoucherLine.voucher_id == Voucher.id, VoucherLine.entry_type == "DEBIT")
        .scalar_subquery()
    )
    stmt = (
        select(
            Voucher.id,
            Voucher.voucher_number,
            Voucher.voucher_type,
            Voucher.voucher_date,
            Voucher.status,
            Voucher.description,
            debit_amount.label("debit_amount"),
        )
        .where(*filters)
        .order_by(Voucher.voucher_date, Voucher.id)
    )
    if limit is not None:
        stmt = stmt.limit(limit).offset(offset)
    elif offset:
        stmt = stmt.offset(offset)
    page = (await db.execute(stmt)).mappings().all()

    out = []
    page_total = 0.0
    for row in page:
        amt = float(row["debit_amount"] or 0)
        page_total += amt
        out.append(
            {
                "id": row["id"],
                "voucher_number": row["voucher_number"],
                "voucher_type": row["voucher_type"],
                "voucher_date": row["voucher_date"],
                "status": row["status"],
                "description": row["description"],
                "amount": round(amt, 2),
            }
        )
    if limit is None and not offset:
        total_count, total_amount = len(out), page_total
    else:
        totals_sq = select(debit_amount.label("debit_amount")).where(*filters).subquery()
        count_n, amount_sum = (
            await db.execute(select(func.count(), func.coalesce(func.sum(totals_sq.c.debit_amount), 0)))
        ).one()
        total_count, total_amount = int(count_n or 0), float(amount_sum or 0)
    return {"rows": out, "total_amount": round(total_amount, 2), "total_count": total_count}


async def _posted_movement_by_account(
    db: AsyncSession,
    tenant_id: int,
    as_of_date: date,
    account_ids: Iterable[int] | None = None,
) -> dict[int, dict[str, float]]:
    """Sum posted, in-books voucher lines per (account, DEBIT/CREDIT) in SQL.

    Replaces loading every voucher line into Python, which grew with ledger size.
    """
    stmt = (
        select(VoucherLine.account_id, VoucherLine.entry_type, func.coalesce(func.sum(line_base_amount_sql()), 0))
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(
            VoucherLine.tenant_id == tenant_id,
            Voucher.tenant_id == tenant_id,
            Voucher.status == "POSTED",
            voucher_in_books_clause(),
            Voucher.voucher_date <= as_of_date,
        )
        .group_by(VoucherLine.account_id, VoucherLine.entry_type)
    )
    if account_ids is not None:
        ids = list(account_ids)
        if not ids:
            return defaultdict(lambda: {"DEBIT": 0.0, "CREDIT": 0.0})
        stmt = stmt.where(VoucherLine.account_id.in_(ids))
    movement: dict[int, dict[str, float]] = defaultdict(lambda: {"DEBIT": 0.0, "CREDIT": 0.0})
    for acct_id, entry_type, total in (await db.execute(stmt)).all():
        movement[acct_id][(entry_type or "DEBIT").upper()] += _to_float(total)
    return movement


_PL_NATURES = frozenset({"Income", "Expense"})


async def _report_balances(
    db: AsyncSession,
    tenant: Tenant,
    account_rows: list,
    as_of_date: date,
    *,
    basis: str,
    account_ids: list[int] | None,
) -> tuple[dict[int, float], dict, float]:
    """Balance per account in its normal direction (positive = normal side).

    basis="cumulative": opening + all posted movement up to as_of (original behaviour).
    basis="fy": Income/Expense accounts show only this financial year's movement; everything
    earlier is returned as `profit_brought_forward` (Tally: no year-end closing entry needed).
    """
    from app.modules.finance.fiscal_year import fiscal_year_bounds, fiscal_year_info, fy_start_month

    start_month = fy_start_month(tenant.feature_flags)
    fy_info = fiscal_year_info(as_of_date, start_month)
    movement = await _posted_movement_by_account(db, tenant.id, as_of_date, account_ids)

    def signed(account: ChartOfAccount, opening: float, dr: float, cr: float) -> float:
        return opening + dr - cr if account.normal_balance == "debit" else opening + cr - dr

    balances: dict[int, float] = {}
    profit_bf = 0.0
    prior: dict[int, dict[str, float]] = {}
    if basis == "fy":
        fy_start, _ = fiscal_year_bounds(as_of_date, start_month)
        pl_ids = [a.id for a, g in account_rows if g.nature in _PL_NATURES]
        prior = await _posted_movement_by_account(db, tenant.id, fy_start - timedelta(days=1), pl_ids)
    for account, group in account_rows:
        opening = _to_float(account.opening_balance)
        total = signed(account, opening, movement[account.id]["DEBIT"], movement[account.id]["CREDIT"])
        if basis == "fy" and group.nature in _PL_NATURES:
            before = signed(account, opening, prior[account.id]["DEBIT"], prior[account.id]["CREDIT"])
            balances[account.id] = total - before
            natural = before if (account.normal_balance == "credit") == (group.nature == "Income") else -before
            profit_bf += natural if group.nature == "Income" else -natural
        else:
            balances[account.id] = total
    return balances, fy_info, profit_bf


@router.get("/reports/trial-balance")
async def trial_balance_report(
    as_of_date: date | None = Query(default=None),
    account_id: int | None = Query(default=None),
    group_id: int | None = Query(default=None),
    basis: str = Query(default="cumulative", pattern="^(cumulative|fy)$"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if as_of_date is None:
        as_of_date = today_local(tenant)
    accounts_stmt = (
        select(ChartOfAccount, AccountGroup)
        .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
        .where(ChartOfAccount.tenant_id == tenant.id)
    )
    if account_id is not None:
        accounts_stmt = accounts_stmt.where(ChartOfAccount.id == account_id)
    if group_id is not None:
        accounts_stmt = accounts_stmt.where(ChartOfAccount.group_id == group_id)
    account_rows = (await db.execute(accounts_stmt)).all()
    balances, fy_info, profit_bf = await _report_balances(
        db,
        tenant,
        account_rows,
        as_of_date,
        basis=basis,
        account_ids=[a.id for a, _g in account_rows] if (account_id is not None or group_id is not None) else None,
    )

    rows = []
    debit_total = 0.0
    credit_total = 0.0
    for account, group in account_rows:
        bal = balances[account.id]
        on_normal_side = bal >= 0
        if account.normal_balance == "debit":
            debit, credit = (bal, 0.0) if on_normal_side else (0.0, abs(bal))
        else:
            debit, credit = (0.0, bal) if on_normal_side else (abs(bal), 0.0)
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
    if basis == "fy" and account_id is None and group_id is None and abs(profit_bf) >= 0.005:
        pbf_debit, pbf_credit = (0.0, profit_bf) if profit_bf > 0 else (abs(profit_bf), 0.0)
        debit_total += pbf_debit
        credit_total += pbf_credit
        rows.append(
            {
                "account_id": 0,
                "account_number": "P&L-BF",
                "account_name": "Profit & Loss brought forward (earlier years)",
                "group_name": "Equity (computed)",
                "nature": "Equity",
                "debit": round(pbf_debit, 2),
                "credit": round(pbf_credit, 2),
                "is_computed": True,
            }
        )
    return {
        "as_of_date": as_of_date,
        "rows": rows,
        "total_debit": round(debit_total, 2),
        "total_credit": round(credit_total, 2),
        "basis": basis,
        "fiscal_year": fy_info,
        "profit_brought_forward": round(profit_bf, 2) if basis == "fy" else None,
    }


@router.get("/reports/financial-statements")
async def financial_statements(
    as_of_date: date | None = Query(default=None),
    group_id: int | None = Query(default=None),
    basis: str = Query(default="cumulative", pattern="^(cumulative|fy)$"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if as_of_date is None:
        as_of_date = today_local(tenant)
    accounts_stmt = (
        select(ChartOfAccount, AccountGroup)
        .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
        .where(ChartOfAccount.tenant_id == tenant.id)
    )
    if group_id is not None:
        accounts_stmt = accounts_stmt.where(ChartOfAccount.group_id == group_id)
    account_rows = (await db.execute(accounts_stmt)).all()
    balances, fy_info, profit_bf = await _report_balances(
        db,
        tenant,
        account_rows,
        as_of_date,
        basis=basis,
        account_ids=[a.id for a, _g in account_rows] if group_id is not None else None,
    )
    summary = {"Asset": 0.0, "Liability": 0.0, "Equity": 0.0, "Income": 0.0, "Expense": 0.0}
    for account, group in account_rows:
        summary[group.nature] = summary.get(group.nature, 0.0) + balances[account.id]
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
        "basis": basis,
        "fiscal_year": fy_info,
        "profit_brought_forward": round(profit_bf, 2) if basis == "fy" else None,
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
        from_date = today_local(tenant).replace(day=1)
    if to_date is None:
        to_date = today_local(tenant)

    vouchers = list(
        (
            await db.execute(
                select(Voucher)
                .where(
                    Voucher.tenant_id == tenant.id,
                    Voucher.status == "POSTED",
                    voucher_in_books_clause(),
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
        amount = float(line_base_amount(line))
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
    limit: int = Query(default=500, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    scenarios = list(
        (
            await db.execute(
                select(CashForecastScenario).where(CashForecastScenario.tenant_id == tenant.id).order_by(CashForecastScenario.id.desc())
                .offset(offset).limit(limit)
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


@router.delete("/cash-forecast/scenarios/{scenario_id}")
async def delete_cash_forecast_scenario(
    scenario_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    scenario = await db.get(CashForecastScenario, scenario_id)
    if not scenario or scenario.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    for line in list(
        (await db.execute(select(CashForecastLine).where(CashForecastLine.scenario_id == scenario.id))).scalars().all()
    ):
        await db.delete(line)
    await db.delete(scenario)
    await db.commit()
    return {"ok": True}


@router.put("/cash-forecast/scenarios/{scenario_id}", response_model=CashScenarioOut)
async def update_cash_forecast_scenario(
    scenario_id: int,
    body: CashScenarioUpdateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    scenario = await db.get(CashForecastScenario, scenario_id)
    if not scenario or scenario.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if body.name is not None:
        next_name = body.name.strip()
        if not next_name:
            raise HTTPException(status_code=400, detail="Scenario name is required")
        scenario.name = next_name
    if body.start_date is not None:
        scenario.start_date = body.start_date
    if body.months is not None:
        scenario.months = max(1, min(int(body.months), 24))
    if body.status is not None:
        scenario.status = body.status.strip().upper()

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

    # Debit total of the 60 most recent posted, in-books vouchers (latest voucher_date, then id).
    recent_voucher_ids = (
        select(Voucher.id)
        .where(
            Voucher.tenant_id == tenant.id,
            Voucher.status == "POSTED",
            voucher_in_books_clause(),
        )
        .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
        .limit(60)
    )
    posted_debit_sum = (
        await db.execute(
            select(func.coalesce(func.sum(VoucherLine.amount), 0)).where(
                VoucherLine.voucher_id.in_(recent_voucher_ids.scalar_subquery()),
                VoucherLine.entry_type == "DEBIT",
            )
        )
    ).scalar()
    posted_amount = float(posted_debit_sum or 0)

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
        month_date = _add_months(start, idx)
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
    await db.flush()
    lines_list = list(
        (
            await db.execute(
                select(CashForecastLine).where(CashForecastLine.scenario_id == scenario.id).order_by(CashForecastLine.id)
            )
        ).scalars().all()
    )
    line_by_label = {ln.month_label: ln for ln in lines_list}
    lc_rows = list((await db.execute(select(BtbLc).where(BtbLc.tenant_id == tenant.id, BtbLc.maturity_date.isnot(None)))).scalars().all())
    for lc in lc_rows:
        md = lc.maturity_date
        if not md:
            continue
        amt = _to_float(str(lc.maturity_amount or lc.amount or 0))
        if amt <= 0:
            continue
        for idx in range(scenario.months):
            month_date = _add_months(start, idx)
            if month_date.year != md.year or month_date.month != md.month:
                continue
            label = month_date.strftime("%b-%Y")
            line = line_by_label.get(label)
            if line:
                new_out = round(_to_float(line.outflow) + amt, 2)
                line.outflow = str(new_out)
                line.net = str(round(_to_float(line.inflow) - new_out, 2))
            break
    # Facility repayment obligations (EMI) by due month
    util_rows = list(
        (
            await db.execute(
                select(FacilityUtilization.id).where(
                    FacilityUtilization.tenant_id == tenant.id,
                    FacilityUtilization.status == "active",
                )
            )
        ).all()
    )
    util_ids = [r[0] for r in util_rows]
    if util_ids:
        sched_lines = list(
            (
                await db.execute(
                    select(RepaymentScheduleLine).where(
                        RepaymentScheduleLine.tenant_id == tenant.id,
                        RepaymentScheduleLine.facility_utilization_id.in_(util_ids),
                        RepaymentScheduleLine.status.in_(("upcoming", "due", "overdue", "partially_paid")),
                    )
                )
            ).scalars().all()
        )
        for sl in sched_lines:
            dd = sl.due_date
            emi_amt = _to_float(str(sl.emi_amount or 0))
            if emi_amt <= 0:
                continue
            for idx in range(scenario.months):
                month_date = _add_months(start, idx)
                if month_date.year != dd.year or month_date.month != dd.month:
                    continue
                label = month_date.strftime("%b-%Y")
                line = line_by_label.get(label)
                if line:
                    new_out = round(_to_float(line.outflow) + emi_amt, 2)
                    line.outflow = str(new_out)
                    line.net = str(round(_to_float(line.inflow) - new_out, 2))
                break
    running2 = 0.0
    for ln in sorted(lines_list, key=lambda x: x.id):
        running2 = round(running2 + _to_float(ln.net), 2)
        ln.cumulative = str(running2)
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
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(FxReceipt).where(FxReceipt.tenant_id == tenant.id).order_by(FxReceipt.id.desc())
    if status_filter:
        stmt = stmt.where(FxReceipt.status == status_filter.strip().upper())
    return list((await db.execute(stmt.offset(offset).limit(limit))).scalars().all())


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
    row_result = await db.execute(
        select(FxReceipt)
        .where(FxReceipt.id == receipt_id, FxReceipt.tenant_id == tenant.id)
        .with_for_update()
    )
    row = row_result.scalar_one_or_none()
    if not row:
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
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
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
    return list((await db.execute(stmt.offset(offset).limit(limit))).scalars().all())


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
    due = today_local(tenant) + timedelta(days=max(body.due_in_days, 0))
    combined_notes = f"{body.notes or ''} | PO:{po.po_code} | GRN_COUNT:{grn_count}".strip(" |")

    row = OutstandingBill(
        tenant_id=tenant.id,
        bill_no=code,
        party_name=po.supplier_name,
        bill_type="PAYABLE",
        bill_date=today_local(tenant),
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
    due = today_local(tenant) + timedelta(days=max(body.due_in_days, 0))
    combined_notes = f"{body.notes or ''} | PO:{po.po_code} | GRN:{grn.grn_code}".strip(" |")

    row = OutstandingBill(
        tenant_id=tenant.id,
        bill_no=code,
        party_name=po.supplier_name,
        bill_type="PAYABLE",
        bill_date=today_local(tenant),
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
    row_result = await db.execute(
        select(OutstandingBill)
        .where(OutstandingBill.id == bill_id, OutstandingBill.tenant_id == tenant.id)
        .with_for_update()
    )
    row = row_result.scalar_one_or_none()
    if not row:
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
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    as_of = as_of_date or today_local(tenant)
    stmt = select(OutstandingBill).where(
        OutstandingBill.tenant_id == tenant.id,
        OutstandingBill.bill_type == bill_type.strip().upper(),
    )
    if party_name:
        stmt = stmt.where(func.lower(func.coalesce(OutstandingBill.party_name, "")).like(f"%{party_name.strip().lower()}%"))
    rows = list(((await db.execute(stmt.offset(offset).limit(limit))).scalars().all()))
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
    response: Response,
    active_only: bool = Query(default=True),
    search: str | None = Query(default=None, description="Substring match on center code or name (case-insensitive)"),
    limit: int = Query(default=500, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    filters = [CostCenter.tenant_id == tenant.id]
    if active_only:
        filters.append(CostCenter.is_active.is_(True))
    if search and search.strip():
        pat = f"%{search.strip().lower()}%"
        filters.append(
            or_(
                func.lower(CostCenter.center_code).like(pat),
                func.lower(CostCenter.name).like(pat),
            )
        )
    total = int((await db.execute(select(func.count(CostCenter.id)).where(*filters))).scalar() or 0)
    response.headers["X-Total-Count"] = str(total)
    stmt = (
        select(CostCenter).where(*filters).order_by(CostCenter.center_code).offset(offset).limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


@router.get("/cost-centers/dashboard")
async def cost_center_dashboard(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    # Aggregate in the database: avoids loading all voucher lines (memory / timeouts) and keeps
    # voucher_lines scoped to tenant_id (the previous IN(cost_center_id) query did not).
    amt = cast(VoucherLine.amount, Numeric(18, 4))
    debit_sum = func.coalesce(
        func.sum(case((VoucherLine.entry_type == "DEBIT", amt), else_=0)),
        0,
    )
    credit_sum = func.coalesce(
        func.sum(case((VoucherLine.entry_type == "CREDIT", amt), else_=0)),
        0,
    )
    line_totals = (
        select(
            VoucherLine.cost_center_id.label("cc_id"),
            debit_sum.label("debit_total"),
            credit_sum.label("credit_total"),
        )
        .where(
            VoucherLine.tenant_id == tenant.id,
            VoucherLine.cost_center_id.isnot(None),
        )
        .group_by(VoucherLine.cost_center_id)
    ).subquery()

    rows = (
        await db.execute(
            select(
                CostCenter.id,
                CostCenter.center_code,
                CostCenter.name,
                CostCenter.department,
                func.coalesce(line_totals.c.debit_total, 0).label("debit_total"),
                func.coalesce(line_totals.c.credit_total, 0).label("credit_total"),
            )
            .outerjoin(line_totals, line_totals.c.cc_id == CostCenter.id)
            .where(CostCenter.tenant_id == tenant.id)
            .order_by(CostCenter.center_code)
        )
    ).all()

    out: list[dict] = []
    for r in rows:
        debit = float(r.debit_total or 0)
        credit = float(r.credit_total or 0)
        out.append(
            {
                "cost_center_id": r.id,
                "center_code": r.center_code,
                "name": r.name,
                "department": r.department,
                "debit_total": round(debit, 2),
                "credit_total": round(credit, 2),
                "net": round(debit - credit, 2),
            }
        )
    return out


# `{center_id:int}` so `/cost-centers/dashboard` never matches this route (avoids 422 if route order regresses).
@router.get("/cost-centers/{center_id:int}", response_model=CostCenterOut)
async def get_cost_center(
    center_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(CostCenter, center_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Cost center not found")
    return row


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


@router.patch("/cost-centers/{center_id:int}", response_model=CostCenterOut)
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


@router.get("/budgets", response_model=list[BudgetOut])
async def list_budgets(
    fiscal_year: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(Budget).where(Budget.tenant_id == tenant.id).order_by(Budget.id.desc())
    if fiscal_year:
        stmt = stmt.where(Budget.fiscal_year == fiscal_year)
    rows = list((await db.execute(stmt.offset(offset).limit(limit))).scalars().all())
    if not rows:
        return []
    budget_ids = [r.id for r in rows]
    bl_result = await db.execute(
        select(BudgetLine).where(BudgetLine.budget_id.in_(budget_ids)).order_by(BudgetLine.budget_id, BudgetLine.id)
    )
    lines_by_budget: dict[int, list[BudgetLine]] = defaultdict(list)
    for bl in bl_result.scalars().all():
        lines_by_budget[bl.budget_id].append(bl)
    return [_budget_to_out(row, lines_by_budget.get(row.id, [])) for row in rows]


@router.post("/budgets", response_model=BudgetOut)
async def create_budget(
    body: BudgetBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await ensure_all_owned(db, ChartOfAccount, [ln.account_id for ln in body.lines], tenant.id, "Ledger account")
    await ensure_all_owned(db, CostCenter, [ln.cost_center_id for ln in body.lines], tenant.id, "Cost center")
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


@router.put("/budgets/{budget_id}", response_model=BudgetOut)
async def update_budget(
    budget_id: int,
    body: BudgetBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    budget = await db.get(Budget, budget_id)
    if not budget or budget.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Budget not found")
    await ensure_all_owned(db, ChartOfAccount, [ln.account_id for ln in body.lines], tenant.id, "Ledger account")
    await ensure_all_owned(db, CostCenter, [ln.cost_center_id for ln in body.lines], tenant.id, "Cost center")
    budget.budget_name = body.budget_name
    budget.fiscal_year = body.fiscal_year
    budget.status = body.status
    old_lines = list((await db.execute(select(BudgetLine).where(BudgetLine.budget_id == budget.id))).scalars().all())
    for line in old_lines:
        await db.delete(line)
    await db.flush()
    for line in body.lines:
        db.add(
            BudgetLine(
                tenant_id=tenant.id,
                budget_id=budget.id,
                cost_center_id=line.cost_center_id,
                account_id=line.account_id,
                period_month=line.period_month,
                amount=line.amount,
                notes=line.notes,
            )
        )
    await db.commit()
    await db.refresh(budget)
    return await _budget_out(db, budget)


@router.delete("/budgets/{budget_id}")
async def delete_budget(
    budget_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    budget = await db.get(Budget, budget_id)
    if not budget or budget.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Budget not found")
    for line in list((await db.execute(select(BudgetLine).where(BudgetLine.budget_id == budget.id))).scalars().all()):
        await db.delete(line)
    await db.delete(budget)
    await db.commit()
    return {"ok": True}


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

    from app.modules.finance.budget_vs_actual_service import compute_budget_vs_actual

    # Each line is compared with its own period (month / quarter / financial year), netted by account nature.
    return await compute_budget_vs_actual(db, tenant, budget)


@router.get("/banking/accounts", response_model=list[BankAccountOut])
async def list_bank_accounts(
    active_only: bool = Query(default=True),
    limit: int = Query(default=500, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(BankAccount).where(BankAccount.tenant_id == tenant.id).order_by(BankAccount.id.desc())
    if active_only:
        stmt = stmt.where(BankAccount.is_active.is_(True))
    return list((await db.execute(stmt.offset(offset).limit(limit))).scalars().all())


@router.post("/banking/accounts", response_model=BankAccountOut)
async def create_bank_account(
    body: BankAccountBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await ensure_owned(db, ChartOfAccount, body.gl_account_id, tenant.id, "Ledger account")
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
    await ensure_owned(db, ChartOfAccount, body.gl_account_id, tenant.id, "Ledger account")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/banking/reconciliation", response_model=list[BankReconciliationOut])
async def list_bank_reconciliations(
    bank_account_id: int | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(BankReconciliation).where(BankReconciliation.tenant_id == tenant.id).order_by(BankReconciliation.id.desc())
    if bank_account_id is not None:
        stmt = stmt.where(BankReconciliation.bank_account_id == bank_account_id)
    rows = list((await db.execute(stmt.offset(offset).limit(limit))).scalars().all())
    return [_bank_reconciliation_to_out(row) for row in rows]


async def _bank_book_balance(db: AsyncSession, tenant_id: int, bank: BankAccount, as_of: date) -> Decimal:
    """Bank balance as per our books on `as_of`: the bank's ledger (GL) account opening balance plus
    posted, in-books voucher lines up to that date, in base currency.

    Bank accounts without a GL link have no ledger to read, so the stored current_balance is used.
    """
    account = await db.get(ChartOfAccount, bank.gl_account_id) if bank.gl_account_id else None
    if account is None or account.tenant_id != tenant_id:
        return Decimal(str(bank.current_balance or 0)).quantize(Decimal("0.01"))
    base = line_base_amount_sql()
    debit, credit = (
        await db.execute(
            select(
                func.coalesce(func.sum(case((VoucherLine.entry_type == "DEBIT", base), else_=0)), 0),
                func.coalesce(func.sum(case((VoucherLine.entry_type == "CREDIT", base), else_=0)), 0),
            )
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .where(
                VoucherLine.tenant_id == tenant_id,
                Voucher.tenant_id == tenant_id,
                VoucherLine.account_id == account.id,
                Voucher.status == "POSTED",
                voucher_in_books_clause(),
                Voucher.voucher_date <= as_of,
            )
        )
    ).one()
    opening = Decimal(str(account.opening_balance or 0))
    debit = Decimal(str(debit))
    credit = Decimal(str(credit))
    balance = opening + debit - credit if account.normal_balance == "debit" else opening + credit - debit
    return balance.quantize(Decimal("0.01"))


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
    book_balance = float(await _bank_book_balance(db, tenant.id, bank, body.statement_date))
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
    return _bank_reconciliation_to_out(row)


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
    return _bank_reconciliation_to_out(row)


@router.post("/banking/reconciliation/{recon_id}/finalize", response_model=BankReconciliationOut)
async def finalize_bank_reconciliation(
    recon_id: int,
    body: BankReconciliationFinalizeBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    recon = await db.get(BankReconciliation, recon_id)
    if not recon or recon.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    if recon.is_finalized:
        return _bank_reconciliation_to_out(recon)
    recon.is_finalized = True
    recon.finalized_at = datetime.utcnow()
    recon.finalized_by = user.id
    recon.finalize_reason = body.reason
    await db.commit()
    await db.refresh(recon)
    return _bank_reconciliation_to_out(recon)


@router.get("/banking/reconciliation/{recon_id}/match-logs", response_model=list[BankStatementMatchLogOut])
async def list_bank_statement_match_logs(
    recon_id: int,
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
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
                .offset(offset).limit(limit)
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
    return BytesResponse(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/banking/reconciliation/{recon_id}/statement-lines", response_model=list[BankStatementLineOut])
async def list_statement_lines(
    recon_id: int,
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
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
                .offset(offset).limit(limit)
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
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(PaymentRun).where(PaymentRun.tenant_id == tenant.id).order_by(PaymentRun.id.desc())
    if status_filter:
        stmt = stmt.where(PaymentRun.status == status_filter.strip().upper())
    runs = list((await db.execute(stmt.offset(offset).limit(limit))).scalars().all())
    if not runs:
        return []
    run_ids = [r.id for r in runs]
    items_result = await db.execute(
        select(PaymentRunItem)
        .where(PaymentRunItem.payment_run_id.in_(run_ids))
        .order_by(PaymentRunItem.payment_run_id, PaymentRunItem.id)
    )
    items_by_run: dict[int, list[PaymentRunItem]] = defaultdict(list)
    for item in items_result.scalars().all():
        items_by_run[item.payment_run_id].append(item)
    return [_payment_run_to_out(run, items_by_run.get(run.id, [])) for run in runs]


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
    base_currency = (body.base_currency or "BDT").strip().upper()
    if body.bank_account_id is not None:
        bank = await db.get(BankAccount, body.bank_account_id)
        if not bank or bank.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Bank account not found")
    await ensure_owned(db, TradeCase, body.trade_case_id, tenant.id, "Trade case")
    code = await next_tenant_code(
        db,
        model=PaymentRun,
        tenant_id=tenant.id,
        prefix="PR-",
        width=4,
    )
    total_base = 0.0
    run = PaymentRun(
        tenant_id=tenant.id,
        run_code=code,
        run_date=body.run_date,
        bank_account_id=body.bank_account_id,
        base_currency=base_currency,
        status="DRAFT",
        total_amount="0",
        remarks=body.remarks,
        trade_case_id=body.trade_case_id,
        created_by=user.id,
    )
    db.add(run)
    await db.flush()
    for item in body.items:
        amount_value = round(_to_float(item.amount), 2)
        if amount_value <= 0:
            raise HTTPException(status_code=400, detail="Payment run item amount must be greater than zero")
        bill = None
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
        source_currency = (
            (item.source_currency or (bill.currency if bill else None) or base_currency).strip().upper()
        )
        if bill and bill.currency and source_currency != str(bill.currency).strip().upper():
            raise HTTPException(
                status_code=400,
                detail=f"Source currency mismatch with bill currency for bill: {bill.bill_no}",
            )
        fx_rate = round(_to_float(item.fx_rate_to_base), 6)
        if source_currency == base_currency:
            fx_rate = 1.0
        if fx_rate <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"fx_rate_to_base is required and must be > 0 for currency {source_currency}",
            )
        calculated_base_amount = round(amount_value * fx_rate, 2)
        base_amount = round(_to_float(item.base_amount), 2)
        if base_amount <= 0:
            base_amount = calculated_base_amount
        if abs(base_amount - calculated_base_amount) > 0.05:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"base_amount mismatch for {item.party_name}. "
                    f"Expected {calculated_base_amount} using amount x fx_rate_to_base"
                ),
            )
        total_base += base_amount
        db.add(
            PaymentRunItem(
                tenant_id=tenant.id,
                payment_run_id=run.id,
                bill_id=item.bill_id,
                party_name=item.party_name,
                amount=str(amount_value),
                source_currency=source_currency,
                fx_rate_to_base=str(fx_rate),
                base_amount=str(base_amount),
                status="PENDING",
                reference=item.reference,
            )
        )
    run.total_amount = str(round(total_base, 2))
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
    await _require_manager_or_admin(db, user, tenant.id)
    run_result = await db.execute(
        select(PaymentRun)
        .where(PaymentRun.id == run_id, PaymentRun.tenant_id == tenant.id)
        .with_for_update()
    )
    run = run_result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Payment run not found")
    if run.status == "EXECUTED":
        return await _payment_run_out(db, run)
    if run.status != "PROCESSED":
        raise HTTPException(status_code=400, detail="Only processed payment runs can be executed")
    items = list(
        (
            await db.execute(
                select(PaymentRunItem)
                .where(PaymentRunItem.payment_run_id == run.id)
                .with_for_update()
            )
        ).scalars().all()
    )
    if not items:
        raise HTTPException(status_code=400, detail="Payment run has no items")
    bank: BankAccount | None = None
    if run.bank_account_id:
        bank = await db.get(BankAccount, run.bank_account_id)
        if not bank or bank.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Linked bank account not found")
    # Bills may only be marked paid together with a posted payment voucher.
    if bank is None or not bank.gl_account_id:
        raise HTTPException(
            status_code=400,
            detail="Link this payment run to a bank account that has a ledger (GL) account before executing; "
            "bills are only marked paid when a posted payment voucher is created.",
        )
    if run.executed_voucher_id is not None:
        existing_voucher = await db.get(Voucher, run.executed_voucher_id)
        if not existing_voucher or existing_voucher.tenant_id != tenant.id or existing_voucher.status != "POSTED":
            raise HTTPException(
                status_code=400,
                detail="The payment voucher for this run is missing or not posted; bills were not marked paid.",
            )

    # Auto-voucher posting for payment run (debit AP clearing, credit bank GL).
    if run.executed_voucher_id is None:
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

        bank_gl_probe = await db.get(ChartOfAccount, bank.gl_account_id)
        if not bank_gl_probe or bank_gl_probe.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Bank GL account is missing or invalid")
        party_totals: dict[str, float] = defaultdict(float)
        for item in items:
            party = (item.party_name or "").strip() or "Unknown Supplier"
            party_totals[party] += _to_float(item.base_amount)

        # Ensure supplier AP accounts exist, then lock all touched GL accounts before updating balances.
        supplier_party_lines: list[tuple[str, float, ChartOfAccount]] = []
        for party_name, amount in party_totals.items():
            rounded_amount = round(amount, 2)
            if rounded_amount <= 0:
                continue
            supplier_ap = await _find_or_create_supplier_ap_account(db, tenant.id, party_name)
            supplier_party_lines.append((party_name, rounded_amount, supplier_ap))
        if not supplier_party_lines:
            raise HTTPException(status_code=400, detail="Payment run has no positive amounts to pay")

        lock_ids = [bank_gl_probe.id] + [ap.id for _, _, ap in supplier_party_lines]
        locked_gl = await _lock_chart_accounts_for_subset(db, tenant.id, lock_ids)
        bank_gl = locked_gl.get(bank_gl_probe.id)
        if not bank_gl:
            raise HTTPException(status_code=400, detail="Bank GL account is missing or invalid")

        vnum, series_seq, series_key, fy = await allocate_series_voucher_number(
            db,
            tenant_id=tenant.id,
            voucher_date=run.run_date,
            voucher_type="PAYMENT",
            branch_code="MAIN",
        )
        voucher = Voucher(
            tenant_id=tenant.id,
            voucher_number=vnum,
            voucher_type="PAYMENT",
            voucher_date=run.run_date,
            status="POSTED",
            description=f"Auto payment voucher for {run.run_code}",
            reference=run.run_code,
            branch_code="MAIN",
            fiscal_year=fy,
            series_sequence=series_seq,
            number_series_key=series_key,
            source_module="PAYMENT_RUN",
            source_module_ref=(run.run_code or "")[:128],
            allow_manual_edit=False,
            created_by=user.id,
        )
        db.add(voucher)
        await db.flush()

        # Credit must equal the debits actually booked (per-party rounding), not the
        # separately rounded run total, or the voucher is out of balance by paisa.
        total_amount = float(
            sum((Decimal(str(amt)) for _, amt, _ in supplier_party_lines), Decimal("0")).quantize(Decimal("0.01"))
        )
        voucher.books_applied = True
        for party_name, rounded_amount, supplier_ap in supplier_party_lines:
            acct = locked_gl.get(supplier_ap.id)
            if not acct:
                continue
            db.add(
                VoucherLine(
                    tenant_id=tenant.id,
                    voucher_id=voucher.id,
                    account_id=acct.id,
                    cost_center_id=None,
                    entry_type="DEBIT",
                    amount=str(rounded_amount),
                    base_amount=str(rounded_amount),
                    notes=f"Payment run {run.run_code} - {party_name} ({run.base_currency})",
                )
            )

        credit_line = VoucherLine(
            tenant_id=tenant.id,
            voucher_id=voucher.id,
            account_id=bank_gl.id,
            cost_center_id=None,
            entry_type="CREDIT",
            amount=str(total_amount),
            base_amount=str(total_amount),
            notes=f"Payment run {run.run_code} ({run.base_currency})",
        )
        db.add(credit_line)
        await db.flush()
        all_lines = list(
            (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all()
        )
        await finalize_posted_voucher_metadata(db, tenant.id, voucher, all_lines, strict_duplicate_check=True)

        for party_name, rounded_amount, supplier_ap in supplier_party_lines:
            acct = locked_gl.get(supplier_ap.id)
            if not acct:
                continue
            _apply_voucher_impact(acct, "DEBIT", rounded_amount)
        _apply_voucher_impact(bank_gl, "CREDIT", total_amount)
        run.executed_voucher_id = voucher.id
    for item in items:
        item.status = "PAID"
        if item.bill_id:
            bill = await db.get(OutstandingBill, item.bill_id)
            if not bill or bill.tenant_id != tenant.id:
                raise HTTPException(status_code=404, detail=f"Bill not found: {item.bill_id}")
            paid = Decimal(str(bill.paid_amount or 0)) + Decimal(str(item.amount or 0))
            total = Decimal(str(bill.amount or 0))
            bill.paid_amount = str(min(paid, total).quantize(Decimal("0.01")))
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
                "source_currency": item.source_currency,
                "fx_rate_to_base": round(_to_float(item.fx_rate_to_base), 6),
                "base_amount": round(_to_float(item.base_amount), 2),
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
            "base_currency": run.base_currency,
            "executed_voucher_id": run.executed_voucher_id,
        },
        "items": output,
        "totals": {
            "item_count": len(output),
            "total_amount": round(_to_float(run.total_amount), 2),
            "base_currency": run.base_currency,
        },
    }


@router.get("/banking/settlement-audit", response_model=SettlementAuditOut)
async def settlement_audit(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    source_currency: str | None = Query(default=None),
    party_query: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    raw_rows = await _load_settlement_audit_rows(
        db=db,
        tenant_id=tenant.id,
        from_date=from_date,
        to_date=to_date,
        status_filter=status_filter,
        source_currency=source_currency,
        party_query=party_query,
    )
    totals_source = round(sum(_to_float(r[0].amount) for r in raw_rows), 2)
    totals_base = round(sum(_to_float(r[0].base_amount) for r in raw_rows), 2)
    paged = raw_rows[offset : offset + limit]
    rows: list[SettlementAuditRow] = []
    for item, run, bill_no in paged:
        rows.append(
            SettlementAuditRow(
                item_id=item.id,
                run_id=run.id,
                run_code=run.run_code,
                run_date=run.run_date,
                run_status=run.status,
                party_name=item.party_name,
                bill_no=bill_no,
                source_currency=item.source_currency,
                source_amount=round(_to_float(item.amount), 2),
                fx_rate_to_base=round(_to_float(item.fx_rate_to_base), 6),
                base_amount=round(_to_float(item.base_amount), 2),
                base_currency=run.base_currency,
            )
        )
    return SettlementAuditOut(
        rows=rows,
        totals=SettlementAuditTotals(
            row_count=len(raw_rows),
            source_total=totals_source,
            base_total=totals_base,
        ),
    )


async def _load_settlement_audit_rows(
    db: AsyncSession,
    tenant_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
    status_filter: str | None = None,
    source_currency: str | None = None,
    party_query: str | None = None,
):
    stmt = (
        select(PaymentRunItem, PaymentRun, OutstandingBill.bill_no)
        .join(PaymentRun, PaymentRun.id == PaymentRunItem.payment_run_id)
        .outerjoin(
            OutstandingBill,
            OutstandingBill.id == PaymentRunItem.bill_id,
        )
        .where(PaymentRunItem.tenant_id == tenant_id, PaymentRun.tenant_id == tenant_id)
    )
    if from_date is not None:
        stmt = stmt.where(PaymentRun.run_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(PaymentRun.run_date <= to_date)
    if status_filter:
        stmt = stmt.where(PaymentRun.status == status_filter.strip().upper())
    if source_currency:
        stmt = stmt.where(PaymentRunItem.source_currency == source_currency.strip().upper())
    if party_query:
        q = f"%{party_query.strip().lower()}%"
        stmt = stmt.where(func.lower(PaymentRunItem.party_name).like(q))
    return list(
        (
            await db.execute(
                stmt.order_by(
                    PaymentRun.run_date.desc(),
                    PaymentRun.id.desc(),
                    PaymentRunItem.id.desc(),
                )
            )
        ).all()
    )


def _settlement_preset_to_out(row: SettlementAuditPreset) -> SettlementAuditPresetOut:
    return SettlementAuditPresetOut(
        id=row.id,
        tenant_id=row.tenant_id,
        name=row.name,
        from_date=row.from_date,
        to_date=row.to_date,
        status_filter=row.status_filter,
        source_currency=row.source_currency,
        party_query=row.party_query,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(
    "/banking/settlement-audit-presets",
    response_model=list[SettlementAuditPresetOut],
)
async def list_settlement_audit_presets(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = list(
        (
            await db.execute(
                select(SettlementAuditPreset)
                .where(SettlementAuditPreset.tenant_id == tenant.id)
                .order_by(SettlementAuditPreset.updated_at.desc(), SettlementAuditPreset.id.desc())
            )
        )
        .scalars()
        .all()
    )
    return [_settlement_preset_to_out(r) for r in rows]


@router.post(
    "/banking/settlement-audit-presets",
    response_model=SettlementAuditPresetOut,
    status_code=status.HTTP_201_CREATED,
)
async def save_settlement_audit_preset(
    body: SettlementAuditPresetBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Preset name is required")
    existing = (
        await db.execute(
            select(SettlementAuditPreset).where(
                SettlementAuditPreset.tenant_id == tenant.id,
                func.lower(SettlementAuditPreset.name) == name.lower(),
            )
        )
    ).scalars().first()
    if existing:
        existing.from_date = body.from_date
        existing.to_date = body.to_date
        existing.status_filter = body.status_filter.strip().upper() if body.status_filter else None
        existing.source_currency = (
            body.source_currency.strip().upper() if body.source_currency else None
        )
        existing.party_query = body.party_query.strip() if body.party_query else None
        existing.created_by = user.id
        await db.commit()
        await db.refresh(existing)
        return _settlement_preset_to_out(existing)
    row = SettlementAuditPreset(
        tenant_id=tenant.id,
        name=name,
        from_date=body.from_date,
        to_date=body.to_date,
        status_filter=body.status_filter.strip().upper() if body.status_filter else None,
        source_currency=body.source_currency.strip().upper() if body.source_currency else None,
        party_query=body.party_query.strip() if body.party_query else None,
        created_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _settlement_preset_to_out(row)


@router.delete(
    "/banking/settlement-audit-presets/{preset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_settlement_audit_preset(
    preset_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(SettlementAuditPreset, preset_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Preset not found")
    await db.delete(row)
    await db.commit()


@router.get("/banking/settlement-audit/export.csv")
async def settlement_audit_export_csv(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    source_currency: str | None = Query(default=None),
    party_query: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    raw_rows = await _load_settlement_audit_rows(
        db=db,
        tenant_id=tenant.id,
        from_date=from_date,
        to_date=to_date,
        status_filter=status_filter,
        source_currency=source_currency,
        party_query=party_query,
    )
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "run_code",
            "run_date",
            "run_status",
            "party_name",
            "bill_no",
            "source_currency",
            "source_amount",
            "fx_rate_to_base",
            "base_amount",
            "base_currency",
        ]
    )
    for item, run, bill_no in raw_rows:
        writer.writerow(
            [
                run.run_code,
                run.run_date.isoformat() if run.run_date else "",
                run.status,
                item.party_name,
                bill_no or "",
                item.source_currency,
                round(_to_float(item.amount), 2),
                round(_to_float(item.fx_rate_to_base), 6),
                round(_to_float(item.base_amount), 2),
                run.base_currency,
            ]
        )
    filename = f"settlement_audit_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return BytesResponse(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
        if 0 <= (p.due_date - today_local(tenant)).days <= 7
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
    if posted:
        v_ids = [v.id for v in posted]
        vl_rows = list(
            (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id.in_(v_ids)))).scalars().all()
        )
        actual = sum(_to_float(line.amount) for line in vl_rows if line.entry_type == "DEBIT")
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
    if not voucher.verification_id and lines:
        _apply_internal_signature(voucher, lines)
        await db.commit()
        await db.refresh(voucher)
        lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())

    created_by_name = ""
    if voucher.created_by:
        creator = await db.get(User, voucher.created_by)
        if creator:
            parts = [creator.first_name or "", creator.last_name or ""]
            created_by_name = " ".join(p for p in parts if p).strip() or creator.username

    account_ids = {line.account_id for line in lines if line.account_id is not None}
    if account_ids:
        acct_rows = list(
            (
                await db.execute(
                    select(ChartOfAccount).where(
                        ChartOfAccount.tenant_id == tenant.id,
                        ChartOfAccount.id.in_(account_ids),
                    )
                )
            ).scalars().all()
        )
        account_by_id = {a.id: a for a in acct_rows}
    else:
        account_by_id = {}
    cc_ids = {line.cost_center_id for line in lines if line.cost_center_id is not None}
    if cc_ids:
        cc_rows = list(
            (
                await db.execute(
                    select(CostCenter).where(CostCenter.tenant_id == tenant.id, CostCenter.id.in_(cc_ids))
                )
            ).scalars().all()
        )
        cc_by_id = {c.id: c for c in cc_rows}
    else:
        cc_by_id = {}

    output_lines = []
    total_debit = 0.0
    total_credit = 0.0
    for line in lines:
        account = account_by_id.get(line.account_id) if line.account_id is not None else None
        account_name = account.name if account and account.tenant_id == tenant.id else f"Account#{line.account_id}"
        account_code = account.account_number if account and account.tenant_id == tenant.id else ""

        cost_center_name = ""
        if line.cost_center_id:
            cc = cc_by_id.get(line.cost_center_id)
            if cc and cc.tenant_id == tenant.id:
                cost_center_name = cc.name

        amount = _to_float(line.amount)
        if line.entry_type == "DEBIT":
            total_debit += amount
        else:
            total_credit += amount
        cn_override = getattr(line, "cost_nature_override", None)
        acct_cn = getattr(account, "cost_nature", None) if account else None
        if cn_override:
            cost_nature_display = str(cn_override).upper()
        elif acct_cn:
            cost_nature_display = f"{str(acct_cn).upper()} (acct)"
        else:
            cost_nature_display = "—"
        output_lines.append(
            {
                "line_id": line.id,
                "account_id": line.account_id,
                "account_code": account_code,
                "account_name": account_name,
                "cost_center_id": line.cost_center_id,
                "cost_center_name": cost_center_name,
                "cost_nature": cost_nature_display,
                "entry_type": line.entry_type,
                "currency": line.currency,
                "exchange_rate": line.exchange_rate,
                "amount": round(amount, 2),
                "base_amount": round(_to_float(line.base_amount), 2),
                "notes": line.notes,
            }
        )
    verification_url = (
        f"/api/v1/finance/vouchers/verify/{voucher.verification_id}" if voucher.verification_id else None
    )
    stage_signers = await voucher_stage_signers(db, tenant_id=tenant.id, voucher_id=voucher.id)

    def _stage(label: str, stage: str) -> SignatoryEntry:
        uid, at = stage_signers.get(stage, (None, None))
        return SignatoryEntry(label, uid, at)

    signatories = await build_signatories(
        db,
        tenant.id,
        [
            SignatoryEntry("Prepared By", voucher.created_by, voucher.created_at),
            _stage("Checked By", "CHECKED"),
            _stage("Recommended By", "RECOMMENDED"),
            _stage("Approved By", "APPROVED"),
            _stage("Posted By", "POSTED"),
        ],
    )
    return {
        "signatories": signatories,
        "voucher": {
            "id": voucher.id,
            "voucher_number": voucher.voucher_number,
            "voucher_type": voucher.voucher_type,
            "voucher_date": voucher.voucher_date,
            "status": voucher.status,
            "description": voucher.description,
            "reference": voucher.reference,
            "currency": voucher.currency,
            "base_currency": voucher.base_currency,
            "exchange_rate": voucher.exchange_rate,
            "verification_id": voucher.verification_id,
            "signature_hash": voucher.signature_hash,
            "signed_at": voucher.signed_at,
            "created_by": voucher.created_by,
            "created_by_name": created_by_name,
            "created_at": voucher.created_at.isoformat() if voucher.created_at else None,
        },
        "tenant": {
            "name": tenant.name,
            "company_code": tenant.company_code,
            "domain": tenant.domain,
        },
        "lines": output_lines,
        "totals": {
            "debit_total": round(total_debit, 2),
            "credit_total": round(total_credit, 2),
            "is_balanced": round(total_debit, 2) == round(total_credit, 2),
        },
        "print_meta": {
            "copy_labels": ["Original", "Duplicate", "Triplicate"],
            "verification_url": verification_url,
            "generated_at": datetime.utcnow().isoformat(),
        },
    }


@router.get("/vouchers/verify/{verification_id}")
async def verify_voucher_signature(
    verification_id: str,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    voucher = (
        await db.execute(
            select(Voucher).where(
                Voucher.tenant_id == tenant.id,
                Voucher.verification_id == verification_id,
            )
        )
    ).scalars().first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Verification record not found")
    lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())
    payload = json.dumps(_voucher_signature_payload(voucher, lines), sort_keys=True, separators=(",", ":"))
    recalculated = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    is_valid = bool(voucher.signature_hash and voucher.signature_hash == recalculated)
    return {
        "voucher_id": voucher.id,
        "voucher_number": voucher.voucher_number,
        "verification_id": voucher.verification_id,
        "status": voucher.status,
        "signed_at": voucher.signed_at,
        "is_valid": is_valid,
        "signature_hash": voucher.signature_hash,
        "recalculated_hash": recalculated,
    }


@router.post("/vouchers/backfill-signatures")
async def backfill_voucher_signatures(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    unsigned = list(
        (
            await db.execute(
                select(Voucher).where(
                    Voucher.tenant_id == tenant.id,
                    Voucher.verification_id.is_(None),
                )
            )
        ).scalars().all()
    )
    signed_count = 0
    for v in unsigned:
        lines = list(
            (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == v.id))).scalars().all()
        )
        _apply_internal_signature(v, lines)
        signed_count += 1
    await db.commit()
    return {"signed_count": signed_count, "message": f"Backfilled signatures for {signed_count} voucher(s)."}


@router.get("/accounting-periods", response_model=list[AccountingPeriodOut])
async def list_accounting_periods(
    limit: int = Query(default=500, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return list(
        (
            await db.execute(
                select(AccountingPeriod).where(AccountingPeriod.tenant_id == tenant.id).order_by(AccountingPeriod.start_date.desc())
                .offset(offset).limit(limit)
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
    await _require_manager_or_admin(db, user, tenant.id)
    from app.services.inventory_pending import inventory_period_close_blockers

    blockers = await inventory_period_close_blockers(db, tenant.id)
    if blockers:
        raise HTTPException(
            status_code=400,
            detail="Cannot close period until inventory is cleared: " + "; ".join(blockers),
        )
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
    role = await get_user_role_scoped_to_tenant(db, user, tenant.id)
    role_name = (role.name if role else "").strip().lower()
    is_privileged = role_name in {"admin", "manager", "super_admin", "superadmin", "owner"}
    voucher = await db.get(Voucher, voucher_id)
    if not voucher or voucher.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    actions = _voucher_actions_for_status(voucher.status, is_privileged=is_privileged)
    return {"voucher_id": voucher_id, "status": voucher.status, "actions": actions}


class VoucherAvailableActionsBatchBody(BaseModel):
    voucher_ids: list[int] = Field(default_factory=list, max_length=200)


@router.post("/vouchers/available-actions-batch")
async def voucher_available_actions_batch(
    body: VoucherAvailableActionsBatchBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Batch available-actions lookup to avoid N+1 from Approvals UI."""
    _ensure_tenant(user, tenant)
    role = await get_user_role_scoped_to_tenant(db, user, tenant.id)
    role_name = (role.name if role else "").strip().lower()
    is_privileged = role_name in {"admin", "manager", "super_admin", "superadmin", "owner"}
    ids = list(dict.fromkeys(int(i) for i in (body.voucher_ids or []) if i is not None))
    if not ids:
        return {"items": []}
    rows = (
        await db.execute(
            select(Voucher.id, Voucher.status).where(
                Voucher.tenant_id == tenant.id,
                Voucher.id.in_(ids),
            )
        )
    ).all()
    by_id = {int(r.id): str(r.status) for r in rows}
    items = []
    for vid in ids:
        st = by_id.get(vid)
        if st is None:
            continue
        items.append(
            {
                "voucher_id": vid,
                "status": st,
                "actions": _voucher_actions_for_status(st, is_privileged=is_privileged),
            }
        )
    return {"items": items}


def _voucher_actions_for_status(status_value: str, *, is_privileged: bool) -> list[str]:
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
    actions = list(status_to_actions.get(status_value, []))
    privileged_actions = {"check", "recommend", "approve", "post", "reject", "reverse", "cancel_posting"}
    if not is_privileged:
        actions = [a for a in actions if a not in privileged_actions]
    return actions


@router.post("/vouchers/{voucher_id}/post", response_model=VoucherOut)
async def post_voucher(
    voucher_id: int,
    body: VoucherPostBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post_body = body or VoucherPostBody()
    return await update_voucher_status(
        voucher_id=voucher_id,
        body=VoucherStatusUpdateBody(
            status="POSTED",
            budget_override=bool(post_body.budget_override),
            budget_override_reason=post_body.budget_override_reason,
        ),
        tenant=tenant,
        user=user,
        db=db,
    )


DIRECT_POST_PATH = ("SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED")


@router.post("/vouchers/{voucher_id}/direct-post", response_model=VoucherOut)
async def direct_post_voucher(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tally-style save = post (flag `direct_post_vouchers`, default off).

    Walks the normal workflow (submit → check → recommend → approve → post) in one call, so every
    step is still validated and recorded in the voucher History. Admin / manager only. If a later
    step fails (e.g. closed period, budget block) the voucher stays at the last successful step.
    """
    from app.common.tenant_feature_keys import is_direct_post_vouchers_enabled

    _ensure_tenant(user, tenant)
    if not is_direct_post_vouchers_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Direct posting is disabled. Set tenant feature flag direct_post_vouchers to true.")
    await _require_manager_or_admin(db, user, tenant.id)
    row = await db.get(Voucher, voucher_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    if row.status == "POSTED":
        raise HTTPException(status_code=409, detail="Voucher is already posted")
    if row.status not in ("DRAFT", *DIRECT_POST_PATH[:-1]):
        raise HTTPException(status_code=400, detail=f"Cannot direct-post a {row.status} voucher")
    start = DIRECT_POST_PATH.index(row.status) + 1 if row.status in DIRECT_POST_PATH else 0
    out = None
    for step in DIRECT_POST_PATH[start:]:
        out = await update_voucher_status(
            voucher_id=voucher_id,
            body=VoucherStatusUpdateBody(status=step, reason="Direct post (single-step mode)"),
            tenant=tenant,
            user=user,
            db=db,
        )
    return out


@router.get("/vouchers/{voucher_id}/history")
async def voucher_history(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit log for one voucher, newest first (also works after the voucher is deleted)."""
    _ensure_tenant(user, tenant)
    row = await db.get(Voucher, voucher_id)
    if row is not None and row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    events = await list_voucher_events(db, tenant_id=tenant.id, voucher_id=voucher_id)
    if row is None and not events:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return {"voucher_id": voucher_id, "events": events}


@router.post("/vouchers/{voucher_id}/cancel-posting", response_model=VoucherOut)
async def cancel_posted_voucher(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    voucher = await _lock_voucher(db, tenant.id, voucher_id)
    if voucher.status != "POSTED":
        raise HTTPException(status_code=400, detail="Only posted vouchers can cancel posting")
    if voucher.reversed_by_voucher_id:
        raise HTTPException(status_code=409, detail="Voucher already has a reversal")
    await _assert_no_facility_link(db, tenant.id, voucher.id)
    from app.modules.finance.tds_service import on_payment_voucher_cancelled

    await on_payment_voucher_cancelled(db, tenant.id, voucher)
    lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())
    if voucher_book_impact_applied(voucher):
        await _assert_open_period(db, tenant.id, voucher.voucher_date)
        await apply_voucher_to_books(db, tenant.id, voucher, lines, reverse=True)
    voucher.status = "APPROVED"
    from app.modules.finance.party_ledger_hooks import on_voucher_cancelled

    await on_voucher_cancelled(db, tenant.id, voucher, feature_flags=tenant.feature_flags)
    await record_voucher_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_id=voucher.id,
        event="cancel_posting",
        summary="Posting cancelled (book impact removed)",
        from_status="POSTED",
        to_status="APPROVED",
    )
    await db.commit()
    await db.refresh(voucher)
    return await _voucher_out(db, voucher)


@router.post("/vouchers/{voucher_id}/reverse", response_model=VoucherOut)
async def reverse_voucher(
    voucher_id: int,
    body: VoucherReverseBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    src = await _lock_voucher(db, tenant.id, voucher_id)
    if src.status != "POSTED":
        raise HTTPException(status_code=400, detail="Only posted vouchers can be reversed")
    if src.reversed_by_voucher_id:
        raise HTTPException(status_code=409, detail="Voucher already has a reversal")
    if not voucher_book_impact_applied(src):
        raise HTTPException(
            status_code=400,
            detail="This voucher never affected the books (memorandum/optional/post-dated); use cancel-posting instead",
        )
    await _assert_no_facility_link(db, tenant.id, src.id)
    await _assert_open_period(db, tenant.id, today_local(tenant), what="today's date (reversal date)")
    from app.modules.finance.tds_service import on_payment_voucher_cancelled

    await on_payment_voucher_cancelled(db, tenant.id, src)

    source_lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == src.id))).scalars().all())
    if not source_lines:
        raise HTTPException(status_code=400, detail="Voucher has no lines")
    src_basis = voucher_balance_basis(src)
    branch = getattr(src, "branch_code", None) or "MAIN"
    vnum, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant.id,
        voucher_date=today_local(tenant),
        voucher_type=src.voucher_type,
        branch_code=branch,
    )
    now = datetime.utcnow()
    reason = body.reason.strip()
    rev = Voucher(
        tenant_id=tenant.id,
        voucher_number=vnum,
        voucher_type=src.voucher_type,
        voucher_date=today_local(tenant),
        status="POSTED",
        description=f"Reversal of {src.voucher_number}",
        reference=src.voucher_number,
        currency=src.currency,
        base_currency=src.base_currency,
        exchange_rate=src.exchange_rate,
        exchange_rate_source=src.exchange_rate_source,
        exchange_rate_fetched_at=src.exchange_rate_fetched_at,
        branch_code=branch[:32],
        fiscal_year=fy,
        series_sequence=series_seq,
        number_series_key=series_key,
        source_module="REVERSAL",
        source_module_ref=f"reverses:{src.id}",
        allow_manual_edit=False,
        reverses_voucher_id=src.id,
        reversal_reason=reason,
        reversal_recorded_at=now,
        reversal_recorded_by_user_id=user.id,
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
                currency=line.currency,
                exchange_rate=line.exchange_rate,
                base_amount=line.base_amount,
                is_rate_overridden=line.is_rate_overridden,
                rate_source=line.rate_source,
                entry_type=flipped,
                amount=line.amount,
                notes=f"Reversal line of voucher {src.voucher_number}",
                cost_nature_override=getattr(line, "cost_nature_override", None),
            )
        )
    await db.flush()
    rev_lines = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == rev.id))).scalars().all()
    )
    # Same basis as the source so a legacy voucher is undone with the amounts it was posted with.
    await apply_voucher_to_books(db, tenant.id, rev, rev_lines, basis=src_basis, check_balance=False)
    src.status = "REVERSED"
    src.reversed_by_voucher_id = rev.id
    await db.flush()
    from app.modules.commercial.commercial_invoice_service import sync_ci_allocation_status_for_voucher
    from app.modules.commercial.proforma_receipt_service import sync_allocation_status_for_voucher
    from app.modules.finance.party_ledger_hooks import on_voucher_cancelled

    await sync_allocation_status_for_voucher(db, tenant_id=tenant.id, voucher=src)
    await sync_ci_allocation_status_for_voucher(db, tenant_id=tenant.id, voucher=src)
    await on_voucher_cancelled(db, tenant.id, src, feature_flags=tenant.feature_flags)
    post_warnings = await finalize_posted_voucher_metadata(
        db, tenant.id, rev, rev_lines, strict_duplicate_check=False
    )
    mark_balance_basis(rev, src_basis)
    _apply_internal_signature(rev, rev_lines)
    await record_voucher_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_id=src.id,
        event="reversed",
        summary=f"Reversed by {rev.voucher_number}",
        from_status="POSTED",
        to_status="REVERSED",
        reason=reason,
    )
    await record_voucher_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_id=rev.id,
        event="created",
        summary=f"Reversal of {src.voucher_number} (posted)",
        to_status="POSTED",
        reason=reason,
    )
    await db.commit()
    await db.refresh(rev)
    return await _voucher_out(db, rev, control_warnings=post_warnings or None)


@router.post("/bills/{bill_id}/allocate", response_model=BillOut)
async def allocate_bill_against_voucher(
    bill_id: int,
    body: BillAllocationBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    # Lock the bill so two concurrent allocations cannot both pass the outstanding check.
    bill = (
        await db.execute(
            select(OutstandingBill)
            .where(OutstandingBill.id == bill_id, OutstandingBill.tenant_id == tenant.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if not bill:
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
    # A balanced voucher's value is one side; summing DEBIT+CREDIT doubled every bill.
    total = sum(_to_float(line.amount) for line in lines if line.entry_type == "DEBIT")
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
    due = today_local(tenant) + timedelta(days=max(body.due_in_days, 0))
    row = OutstandingBill(
        tenant_id=tenant.id,
        bill_no=code,
        party_name=body.party_name,
        bill_type=body.bill_type,
        bill_date=today_local(tenant),
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
    await _require_manager_or_admin(db, user, tenant.id)
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
    await _require_manager_or_admin(db, user, tenant.id)
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
    await _require_manager_or_admin(db, user, tenant.id)
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
    await _require_manager_or_admin(db, user, tenant.id)
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
    filters = _voucher_report_filters(tenant.id, from_date, to_date, voucher_type, status_filter)
    stmt = (
        select(Voucher.status, func.count())
        .where(*filters)
        .group_by(Voucher.status)
        .order_by(func.min(Voucher.id))
    )
    status_counts: dict[str, int] = {status: int(n) for status, n in (await db.execute(stmt)).all()}
    return {
        "total_vouchers": sum(status_counts.values()),
        "status_counts": status_counts,
    }


def _voucher_report_filters(
    tenant_id: int,
    from_date: date | None,
    to_date: date | None,
    voucher_type: str | None,
    status_filter: str | None,
) -> list:
    """WHERE clauses shared by the /voucher-reports/* endpoints."""
    filters = [Voucher.tenant_id == tenant_id]
    if from_date is not None:
        filters.append(Voucher.voucher_date >= from_date)
    if to_date is not None:
        filters.append(Voucher.voucher_date <= to_date)
    if voucher_type:
        filters.append(Voucher.voucher_type == voucher_type.strip().upper())
    if status_filter:
        filters.append(Voucher.status == status_filter.strip().upper())
    return filters


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
        from_date = today_local(tenant).replace(day=1)
    if to_date is None:
        to_date = today_local(tenant)

    q = (
        select(VoucherLine, Voucher)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(
            VoucherLine.tenant_id == tenant.id,
            VoucherLine.account_id == account_id,
            Voucher.voucher_date >= from_date,
            Voucher.voucher_date <= to_date,
            Voucher.status == "POSTED",
            voucher_in_books_clause(),
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
    filters = _voucher_report_filters(tenant.id, from_date, to_date, voucher_type, status_filter)
    month = func.to_char(Voucher.voucher_date, "YYYY-MM")
    stmt = (
        select(month.label("month"), func.count(), func.count().filter(Voucher.status == "POSTED"))
        .where(*filters, Voucher.voucher_date.is_not(None))
        .group_by(month)
        .order_by(month.desc())
        .limit(max(months_back, 1))
    )
    latest_first = (await db.execute(stmt)).all()
    return {
        "months": [
            {"month": key, "count": int(count), "posted_count": int(posted)}
            for key, count, posted in reversed(latest_first)
        ]
    }


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
    filters = _voucher_report_filters(tenant.id, from_date, to_date, voucher_type, status_filter)
    stmt = (
        select(Voucher.created_by, func.count())
        .where(*filters, Voucher.created_by.is_not(None))
        .group_by(Voucher.created_by)
        .order_by(func.count().desc(), func.min(Voucher.id))
        .limit(max(limit, 1))
    )
    ranking = [(int(uid), int(cnt)) for uid, cnt in (await db.execute(stmt)).all()]
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


# ─────────────────────────────────────────────
# Bill-Wise Tracking (Tally-style)
# ─────────────────────────────────────────────

class BillRefCreateBody(BaseModel):
    bill_number: str | None = None
    bill_date: date
    due_date: date | None = None
    bill_type: Literal["PAYABLE", "RECEIVABLE"]
    party_name: str
    account_id: int
    original_amount: str
    credit_period_days: int | None = None
    source_voucher_id: int | None = None
    source_doc_type: str | None = None
    source_doc_number: str | None = None
    notes: str | None = None


class BillRefOut(BaseModel):
    id: int
    tenant_id: int
    bill_number: str
    bill_date: date
    due_date: date | None
    bill_type: str
    party_name: str
    account_id: int
    account_name: str | None = None
    original_amount: str
    pending_amount: str
    source_voucher_id: int | None
    source_doc_type: str | None
    source_doc_number: str | None
    status: str
    credit_period_days: int | None
    is_overdue: bool
    notes: str | None
    created_at: datetime | None


class BillAllocBody(BaseModel):
    allocation_type: Literal["AGAINST_REF", "NEW_REF", "ADVANCE", "ON_ACCOUNT"]
    bill_reference_id: int | None = None
    voucher_id: int
    voucher_line_id: int | None = None
    account_id: int
    amount: str
    notes: str | None = None


@router.get("/bill-references", response_model=list[BillRefOut])
async def list_bill_references(
    bill_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    account_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(BillReference).where(BillReference.tenant_id == tenant.id).order_by(BillReference.bill_date.desc())
    if bill_type:
        stmt = stmt.where(BillReference.bill_type == bill_type.strip().upper())
    if status_filter:
        stmt = stmt.where(BillReference.status == status_filter.strip().upper())
    if account_id:
        stmt = stmt.where(BillReference.account_id == account_id)
    if search:
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            func.lower(BillReference.bill_number).like(q)
            | func.lower(BillReference.party_name).like(q)
        )
    rows = list((await db.execute(stmt.offset(offset).limit(limit))).scalars().all())
    account_ids = {r.account_id for r in rows if r.account_id is not None}
    if account_ids:
        acct_rows = list(
            (
                await db.execute(
                    select(ChartOfAccount).where(
                        ChartOfAccount.tenant_id == tenant.id,
                        ChartOfAccount.id.in_(account_ids),
                    )
                )
            ).scalars().all()
        )
        acct_by_id = {a.id: a for a in acct_rows}
    else:
        acct_by_id = {}
    out = []
    for r in rows:
        acct = acct_by_id.get(r.account_id)
        out.append(BillRefOut(
            id=r.id, tenant_id=r.tenant_id, bill_number=r.bill_number,
            bill_date=r.bill_date, due_date=r.due_date, bill_type=r.bill_type,
            party_name=r.party_name, account_id=r.account_id,
            account_name=acct.name if acct else None,
            original_amount=r.original_amount, pending_amount=r.pending_amount,
            source_voucher_id=r.source_voucher_id,
            source_doc_type=r.source_doc_type, source_doc_number=r.source_doc_number,
            status=r.status, credit_period_days=r.credit_period_days,
            is_overdue=r.is_overdue, notes=r.notes, created_at=r.created_at,
        ))
    return out


@router.post("/bill-references", response_model=BillRefOut)
async def create_bill_reference(
    body: BillRefCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    acct = await db.get(ChartOfAccount, body.account_id)
    if not acct or acct.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Account not found")
    await ensure_owned(db, Voucher, body.source_voucher_id, tenant.id, "Voucher")
    bill_number = body.bill_number
    if not bill_number:
        prefix = "PAY-" if body.bill_type == "PAYABLE" else "RCV-"
        bill_number = await next_tenant_code(db, model=BillReference, tenant_id=tenant.id, prefix=prefix, width=4)
    amount = _to_float(body.original_amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    ref = BillReference(
        tenant_id=tenant.id,
        bill_number=bill_number,
        bill_date=body.bill_date,
        due_date=body.due_date,
        bill_type=body.bill_type,
        party_name=body.party_name.strip(),
        account_id=body.account_id,
        original_amount=str(round(amount, 2)),
        pending_amount=str(round(amount, 2)),
        source_voucher_id=body.source_voucher_id,
        source_doc_type=body.source_doc_type,
        source_doc_number=body.source_doc_number,
        status="OPEN",
        credit_period_days=body.credit_period_days,
        is_overdue=body.due_date < today_local(tenant) if body.due_date else False,
        notes=body.notes,
        created_by=user.id,
    )
    db.add(ref)
    await db.commit()
    await db.refresh(ref)
    return BillRefOut(
        id=ref.id, tenant_id=ref.tenant_id, bill_number=ref.bill_number,
        bill_date=ref.bill_date, due_date=ref.due_date, bill_type=ref.bill_type,
        party_name=ref.party_name, account_id=ref.account_id,
        account_name=acct.name,
        original_amount=ref.original_amount, pending_amount=ref.pending_amount,
        source_voucher_id=ref.source_voucher_id,
        source_doc_type=ref.source_doc_type, source_doc_number=ref.source_doc_number,
        status=ref.status, credit_period_days=ref.credit_period_days,
        is_overdue=ref.is_overdue, notes=ref.notes, created_at=ref.created_at,
    )


@router.get("/bill-references/{bill_ref_id}")
async def get_bill_reference_detail(
    bill_ref_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    ref = await db.get(BillReference, bill_ref_id)
    if not ref or ref.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Bill reference not found")
    acct = await db.get(ChartOfAccount, ref.account_id)
    allocs = list(
        (await db.execute(
            select(BillAllocation).where(
                BillAllocation.bill_reference_id == ref.id,
                BillAllocation.tenant_id == tenant.id,
            ).order_by(BillAllocation.created_at.desc())
        )).scalars().all()
    )
    alloc_out = []
    for a in allocs:
        v = await db.get(Voucher, a.voucher_id) if a.voucher_id else None
        if v is not None and v.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Voucher not found for allocation")
        alloc_out.append({
            "id": a.id,
            "allocation_type": a.allocation_type,
            "amount": a.amount,
            "allocation_date": a.allocation_date,
            "voucher_id": a.voucher_id,
            "voucher_number": v.voucher_number if v else None,
            "notes": a.notes,
            "created_at": a.created_at,
        })
    return {
        "bill": {
            "id": ref.id, "bill_number": ref.bill_number,
            "bill_date": ref.bill_date, "due_date": ref.due_date,
            "bill_type": ref.bill_type, "party_name": ref.party_name,
            "account_id": ref.account_id, "account_name": acct.name if acct else None,
            "original_amount": ref.original_amount, "pending_amount": ref.pending_amount,
            "status": ref.status, "credit_period_days": ref.credit_period_days,
            "is_overdue": ref.is_overdue, "notes": ref.notes,
            "source_voucher_id": ref.source_voucher_id,
            "source_doc_type": ref.source_doc_type, "source_doc_number": ref.source_doc_number,
        },
        "allocations": alloc_out,
    }


@router.post("/bill-references/allocate")
async def allocate_bill_wise(
    body: BillAllocBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    amount = _to_float(body.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    voucher = await db.get(Voucher, body.voucher_id)
    if not voucher or voucher.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    acct = await db.get(ChartOfAccount, body.account_id)
    if not acct or acct.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Account not found")
    await ensure_owned(db, VoucherLine, body.voucher_line_id, tenant.id, "Voucher line")
    if body.allocation_type == "ON_ACCOUNT":
        await ensure_owned(db, BillReference, body.bill_reference_id, tenant.id, "Bill reference")
    today = today_local(tenant)

    if body.allocation_type == "AGAINST_REF":
        if not body.bill_reference_id:
            raise HTTPException(status_code=400, detail="bill_reference_id is required for AGAINST_REF")
        ref = await db.get(BillReference, body.bill_reference_id)
        if not ref or ref.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Bill reference not found")
        pending = _to_float(ref.pending_amount)
        if amount > pending + 0.01:
            raise HTTPException(status_code=400, detail=f"Amount exceeds pending {pending:.2f}")
        new_pending = max(0, round(pending - amount, 2))
        ref.pending_amount = str(new_pending)
        ref.status = "SETTLED" if new_pending <= 0.01 else "PARTIALLY_SETTLED"
        ref.updated_at = datetime.utcnow()
    elif body.allocation_type == "NEW_REF":
        new_bill_no = await next_tenant_code(db, model=BillReference, tenant_id=tenant.id, prefix="NEW-", width=4)
        ref = BillReference(
            tenant_id=tenant.id, bill_number=new_bill_no, bill_date=today,
            bill_type="PAYABLE", party_name=acct.name or "", account_id=body.account_id,
            original_amount=str(round(amount, 2)), pending_amount=str(round(amount, 2)),
            source_voucher_id=body.voucher_id, source_doc_type="NEW_REF", status="OPEN",
            created_by=user.id,
        )
        db.add(ref)
        await db.flush()
        body.bill_reference_id = ref.id
    elif body.allocation_type == "ADVANCE":
        adv_no = await next_tenant_code(db, model=BillReference, tenant_id=tenant.id, prefix="ADV-", width=4)
        ref = BillReference(
            tenant_id=tenant.id, bill_number=adv_no, bill_date=today,
            bill_type="RECEIVABLE", party_name=acct.name or "", account_id=body.account_id,
            original_amount=str(-round(amount, 2)), pending_amount=str(-round(amount, 2)),
            source_voucher_id=body.voucher_id, source_doc_type="ADVANCE", status="OPEN",
            notes=body.notes or "Advance payment", created_by=user.id,
        )
        db.add(ref)
        await db.flush()
        body.bill_reference_id = ref.id

    alloc = BillAllocation(
        tenant_id=tenant.id,
        bill_reference_id=body.bill_reference_id,
        voucher_id=body.voucher_id,
        voucher_line_id=body.voucher_line_id,
        allocation_type=body.allocation_type,
        amount=str(round(amount, 2)),
        account_id=body.account_id,
        allocation_date=today,
        notes=body.notes,
        created_by=user.id,
    )
    db.add(alloc)
    await db.commit()
    await db.refresh(alloc)
    return {"ok": True, "allocation_id": alloc.id, "message": f"Allocation of {amount:.2f} recorded."}


@router.post("/bill-references/auto-create/{voucher_id}")
async def auto_create_bill_refs_from_voucher(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Auto-create bill references for all lines hitting bill-wise enabled accounts."""
    _ensure_tenant(user, tenant)
    voucher = await db.get(Voucher, voucher_id)
    if not voucher or voucher.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    lines = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all()
    )
    created = []
    for line in lines:
        acct = await db.get(ChartOfAccount, line.account_id)
        if not acct or not acct.enable_bill_wise:
            continue
        group = await db.get(AccountGroup, acct.group_id) if acct.group_id else None
        if group and group.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Account group not found")
        is_creditor = False
        if group:
            gn = (group.name or "").lower()
            is_creditor = "creditor" in gn or "payable" in gn
        bill_type = "PAYABLE" if is_creditor else "RECEIVABLE"
        prefix = "PAY-" if bill_type == "PAYABLE" else "RCV-"
        bill_no = await next_tenant_code(db, model=BillReference, tenant_id=tenant.id, prefix=prefix, width=4)
        amount = _to_float(line.amount)
        ref = BillReference(
            tenant_id=tenant.id, bill_number=bill_no, bill_date=voucher.voucher_date,
            bill_type=bill_type, party_name=acct.name, account_id=acct.id,
            original_amount=str(round(amount, 2)), pending_amount=str(round(amount, 2)),
            source_voucher_id=voucher.id, source_doc_type="VOUCHER",
            source_doc_number=voucher.voucher_number, status="OPEN",
            created_by=user.id,
        )
        db.add(ref)
        created.append(bill_no)
    await db.commit()
    return {"ok": True, "bills_created": len(created), "bill_numbers": created}


@router.get("/bill-references/report/outstanding")
async def bill_wise_outstanding_report(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = list(
        (await db.execute(
            select(BillReference).where(
                BillReference.tenant_id == tenant.id,
                BillReference.status.in_(["OPEN", "PARTIALLY_SETTLED"]),
            )
        )).scalars().all()
    )
    receivable_total = 0.0
    payable_total = 0.0
    receivable_count = 0
    payable_count = 0
    overdue_total = 0.0
    for r in rows:
        pending = _to_float(r.pending_amount)
        if r.bill_type == "RECEIVABLE":
            receivable_total += pending
            receivable_count += 1
        else:
            payable_total += pending
            payable_count += 1
        if r.is_overdue or (r.due_date and r.due_date < today_local(tenant)):
            overdue_total += pending
    return {
        "receivable": {"total": round(receivable_total, 2), "count": receivable_count},
        "payable": {"total": round(payable_total, 2), "count": payable_count},
        "overdue_total": round(overdue_total, 2),
    }


@router.get("/bill-references/report/aging")
async def bill_wise_aging_report(
    bill_type: str = Query(default="PAYABLE"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = list(
        (await db.execute(
            select(BillReference).where(
                BillReference.tenant_id == tenant.id,
                BillReference.bill_type == bill_type.strip().upper(),
                BillReference.status.in_(["OPEN", "PARTIALLY_SETTLED"]),
            ).order_by(BillReference.bill_date.asc())
        )).scalars().all()
    )
    today = today_local(tenant)
    buckets: dict[str, float] = {"0_30": 0, "31_60": 0, "61_90": 0, "91_120": 0, "120_plus": 0}
    party_rows: list[dict] = []
    for r in rows:
        pending = _to_float(r.pending_amount)
        if pending <= 0:
            continue
        days = (today - r.bill_date).days
        if days <= 30:
            buckets["0_30"] += pending
        elif days <= 60:
            buckets["31_60"] += pending
        elif days <= 90:
            buckets["61_90"] += pending
        elif days <= 120:
            buckets["91_120"] += pending
        else:
            buckets["120_plus"] += pending
        party_rows.append({
            "bill_number": r.bill_number,
            "party_name": r.party_name,
            "bill_date": r.bill_date,
            "due_date": r.due_date,
            "days_outstanding": days,
            "pending_amount": round(pending, 2),
        })
    return {
        "bill_type": bill_type.upper(),
        "buckets": {k: round(v, 2) for k, v in buckets.items()},
        "rows": party_rows,
    }


@router.get("/ai/readonly-insights")
async def finance_ai_readonly_insights(
    months_back: int = Query(default=6, ge=1, le=24),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 17: read-only voucher activity series and simple anomaly hints."""
    _ensure_tenant(user, tenant)
    from app.modules.ai_tool.audit import log_ai_event
    from app.modules.erp_ai_phases.feature_flags import require_phase
    from app.modules.finance.finance_ai_readonly_service import build_finance_readonly_insights

    require_phase("finance_ai_readonly", tenant=tenant)
    payload = await build_finance_readonly_insights(db, tenant_id=tenant.id, months_back=months_back)
    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="FINANCE_AI_READONLY_INSIGHTS",
        resource="voucher_series",
        details_json={"periods": len(payload.get("posted_voucher_series") or [])},
        reason_code="PHASE17_READ_ONLY",
    )
    await db.commit()
    return payload


@router.get("/business-overview")
async def finance_business_overview(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("business_overview.dashboard.read")),
):
    if not get_settings().business_overview_enabled:
        raise HTTPException(status_code=403, detail="Business overview disabled")
    _ensure_tenant(user, tenant)
    from app.modules.finance.business_overview_service import build_business_overview

    return await build_business_overview(db, tenant_id=tenant.id)


@router.get("/business-overview/health-score")
async def finance_business_health_score(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("business_overview.dashboard.read")),
):
    if not get_settings().business_overview_enabled:
        raise HTTPException(status_code=403, detail="Business overview disabled")
    _ensure_tenant(user, tenant)
    from app.modules.finance.health_score_service import build_health_score

    return await build_health_score(db, tenant_id=tenant.id)


@router.get("/business-overview/deterministic-summary")
async def finance_business_overview_deterministic(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("business_overview.dashboard.read")),
):
    _ensure_tenant(user, tenant)
    from app.modules.finance.business_overview_rules import deterministic_summary
    from app.modules.finance.business_overview_service import build_business_overview

    ov = await build_business_overview(db, tenant_id=tenant.id)
    return deterministic_summary(ov)


@router.get("/business-overview/ai-narrative")
async def finance_business_overview_ai(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("business_overview.ai_insights.read")),
):
    if not get_settings().business_overview_enabled:
        raise HTTPException(status_code=403, detail="Business overview disabled")
    _ensure_tenant(user, tenant)
    from app.modules.finance.business_overview_ai_service import build_business_overview_ai_narrative

    return await build_business_overview_ai_narrative(db, tenant_id=tenant.id, user_id=user.id)


# --- Vendor bills (AP) — drafts from GRN, Finance-owned booking ---


@router.post("/vendor-bills/from-grn/{grn_id}", status_code=201)
async def create_vendor_bill_draft_from_grn(
    grn_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    grn = await db.get(GoodsReceiving, grn_id)
    if not grn or grn.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="GRN not found")
    if (grn.status or "").upper() != "RECEIVED":
        raise HTTPException(status_code=400, detail="GRN must be received before creating vendor bill")
    vid = getattr(grn, "vendor_id", None)
    if not vid and grn.purchase_order_id:
        po = await db.get(PurchaseOrder, grn.purchase_order_id)
        if po:
            vid = po.vendor_id
    if not vid:
        raise HTTPException(status_code=400, detail="GRN has no vendor; set vendor on GRN or use a PO-linked receipt")
    v = await db.get(Vendor, vid)
    if not v or v.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Vendor not found")

    bill_code = await next_tenant_code(db, model=VendorBill, tenant_id=tenant.id, prefix="VB-", width=4)
    bill = VendorBill(
        tenant_id=tenant.id,
        bill_code=bill_code,
        vendor_id=vid,
        vendor_invoice_ref=None,
        vendor_invoice_date=today_local(tenant),
        bill_date=grn.received_date or today_local(tenant),
        status="DRAFT",
        goods_receiving_id=grn.id,
        purchase_order_id=grn.purchase_order_id,
        source_order_id=getattr(grn, "source_order_id", None),
        is_non_po_receipt=(getattr(grn, "source_type", None) or "").upper() == "NON_PO",
        created_by_user_id=user.id,
    )
    db.add(bill)
    await db.flush()

    gi_res = await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == grn.id))
    run_total = 0.0
    for gi in gi_res.scalars().all():
        acc = getattr(gi, "accepted_qty", None) or getattr(gi, "quantity", None) or "0"
        up = getattr(gi, "unit_price", None) or "0"
        lt = f"{round(float(acc or 0) * float(up or 0), 4):.4f}"
        run_total += float(acc or 0) * float(up or 0)
        db.add(
            VendorBillLine(
                tenant_id=tenant.id,
                vendor_bill_id=bill.id,
                goods_receiving_item_id=gi.id,
                purchase_order_line_id=getattr(gi, "purchase_order_line_id", None),
                item_id=gi.item_id,
                quantity=str(acc),
                unit_price=str(up),
                line_total=lt,
            )
        )
    bill.subtotal_amount = f"{run_total:.4f}"
    bill.total_amount = f"{run_total:.4f}"
    await db.commit()
    await db.refresh(bill)
    return {"id": bill.id, "bill_code": bill.bill_code, "status": bill.status}


@router.get("/vendor-bills")
async def list_vendor_bills(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    _ensure_tenant(user, tenant)
    r = await db.execute(
        select(VendorBill)
        .where(VendorBill.tenant_id == tenant.id)
        .order_by(VendorBill.id.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = list(r.scalars().all())
    return [
        {
            "id": b.id,
            "bill_code": b.bill_code,
            "vendor_id": b.vendor_id,
            "status": b.status,
            "goods_receiving_id": b.goods_receiving_id,
            "purchase_order_id": b.purchase_order_id,
            "total_amount": b.total_amount,
            "vendor_invoice_ref": b.vendor_invoice_ref,
        }
        for b in rows
    ]


@router.get("/vendor-bills/{bill_id}")
async def get_vendor_bill(
    bill_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    b = await db.get(VendorBill, bill_id)
    if not b or b.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Vendor bill not found")
    lr = await db.execute(select(VendorBillLine).where(VendorBillLine.vendor_bill_id == b.id))
    lines = list(lr.scalars().all())
    return {
        "id": b.id,
        "bill_code": b.bill_code,
        "vendor_id": b.vendor_id,
        "status": b.status,
        "vendor_invoice_ref": b.vendor_invoice_ref,
        "goods_receiving_id": b.goods_receiving_id,
        "purchase_order_id": b.purchase_order_id,
        "source_order_id": b.source_order_id,
        "is_non_po_receipt": b.is_non_po_receipt,
        "lines": [
            {
                "id": ln.id,
                "item_id": ln.item_id,
                "quantity": ln.quantity,
                "unit_price": ln.unit_price,
                "line_total": ln.line_total,
                "goods_receiving_item_id": ln.goods_receiving_item_id,
                "purchase_order_line_id": ln.purchase_order_line_id,
            }
            for ln in lines
        ],
    }


class VendorBillPatchBody(BaseModel):
    vendor_invoice_ref: str | None = None
    status: str | None = None
    notes: str | None = None


@router.patch("/vendor-bills/{bill_id}")
async def patch_vendor_bill(
    bill_id: int,
    body: VendorBillPatchBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    b = await db.get(VendorBill, bill_id)
    if not b or b.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Vendor bill not found")
    if (b.status or "").upper() == "POSTED":
        raise HTTPException(status_code=400, detail="Posted vendor bill cannot be edited")
    if body.vendor_invoice_ref is not None:
        b.vendor_invoice_ref = body.vendor_invoice_ref.strip() or None
    if body.notes is not None:
        b.notes = body.notes
    if body.status is not None:
        st = body.status.strip().upper()
        if st not in {"DRAFT", "APPROVED", "CANCELLED"}:
            raise HTTPException(status_code=400, detail="Invalid status")
        b.status = st
    await db.commit()
    await db.refresh(b)
    return {"id": b.id, "bill_code": b.bill_code, "status": b.status, "vendor_invoice_ref": b.vendor_invoice_ref}


@router.post("/vendor-bills/{bill_id}/post")
async def post_vendor_bill(
    bill_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Book AP: clear GRNI (goods received not billed) and credit trade payables."""
    _ensure_tenant(user, tenant)
    await assert_delegate_manager_or_permission(
        db, user, tenant.id, permission_key=PERMISSION_FINANCE_AP_POSTING_APPROVE
    )
    b = await db.get(VendorBill, bill_id)
    if not b or b.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Vendor bill not found")
    if b.voucher_id is not None:
        raise HTTPException(status_code=400, detail="Vendor bill already posted")
    st = (b.status or "").upper()
    if st == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cancelled vendor bill cannot be posted")
    if not (b.vendor_invoice_ref or "").strip():
        raise HTTPException(status_code=400, detail="vendor_invoice_ref is required before posting")
    lr = await db.execute(select(VendorBillLine).where(VendorBillLine.vendor_bill_id == b.id))
    lines = list(lr.scalars().all())
    if not lines:
        raise HTTPException(status_code=400, detail="Vendor bill has no lines")
    total = sum(float(str(ln.line_total or 0).replace(",", "") or 0) for ln in lines)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Vendor bill total must be greater than zero")
    amt = Decimal(str(round(total, 4)))

    voucher = await create_system_voucher(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_type="JOURNAL",
        voucher_date=b.bill_date or today_local(tenant),
        lines=[
            AutoPostingLine(
                entry_type="DEBIT",
                amount=amt,
                system_code="GOODS_RECEIVED_NOT_BILLED_IMPORT",
                notes="Clear GRNI / receipt clearing",
            ),
            AutoPostingLine(
                entry_type="CREDIT",
                amount=amt,
                system_code="ACCOUNTS_PAYABLE_TRADE",
                notes="Vendor bill payable",
            ),
        ],
        description=f"Vendor bill {b.bill_code}",
        reference=b.bill_code,
        source_module="VENDOR_BILL",
        source_module_ref=str(b.id),
        auto_post=True,
    )
    b.voucher_id = voucher.id
    b.status = "POSTED"
    b.posted_at = datetime.utcnow()
    b.approved_by_user_id = user.id
    await db.commit()
    await db.refresh(b)
    return {"id": b.id, "bill_code": b.bill_code, "status": b.status, "voucher_id": b.voucher_id}


@router.get("/exposure/master-lc/{master_contract_id}")
async def finance_exposure_master_lc(
    master_contract_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    require_control_tower_enabled(tenant)
    payload = await compute_master_lc_exposure(
        db, tenant_id=tenant.id, master_contract_id=master_contract_id
    )
    if not payload:
        raise HTTPException(status_code=404, detail="Master contract not found")
    return payload


@router.get("/maturity-ladder")
async def finance_maturity_ladder(
    master_contract_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    require_control_tower_enabled(tenant)
    return await build_maturity_ladder(
        db, tenant_id=tenant.id, master_contract_id=master_contract_id
    )
