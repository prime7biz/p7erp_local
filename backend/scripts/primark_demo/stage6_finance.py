"""Stage 6 – Accounting: every voucher for the Primark order PRM-ORD-001 (amounts in BDT).

Stores (stages 3–5) already post the stock side automatically: GRN Dr Inventory / Cr GRNI, issues to WIP,
process-order receipts valued WITH print charge and CM, and Dr COGS / Cr Inventory on the delivery challan.
This stage books the money side so that every control ledger (GRNI, WIP, suppliers, Primark, loans) ends at 0:

    Date         Type     Reference         What happened                         Dr                                Cr
    15-Jul-2026  PJ       PRM-GRN-FAB-001   Fabric bill (BTB LC supplier)          GRNI (or Raw Material Inventory)  Fabric supplier
    18-Jul-2026  PJ       PRM-GRN-TRM-001   Trims bill                             GRNI (or Raw Material Inventory)  Trims supplier
    20-Jul-2026  PJ       PRM-GRN-PCK-001   Packing bill                           GRNI (or Packing Inventory)       Packing supplier
    22-Jul-2026  JOURNAL  PRM-MCJ-001       Materials to COGS – only when stores did not post it themselves
    23-Jul-2026  RECEIPT  PRM-PCL-001       Packing-credit loan from Eastern Bank  Eastern Bank                      Working Capital Loan
    05-Aug-2026  PJ       PRM-JW-001        Chest-print job-work bill              WIP (or Subcontract Printing)     Job-work supplier
    05-Aug-2026  PAYMENT  PRM-PAY-JWT-001   Covered-van trips for the job work     WIP                               Eastern Bank
    30-Aug-2026  JOURNAL  PRM-CMJ-001       CM labour (cutting, sewing, finishing) WIP (or Direct Wages Expense)     Direct Wages Payable
    05-Sep-2026  JOURNAL  PRM-CI-001        Export sales invoice (CI draft posted) Primark (Customer)                Sales Revenue - Export
    05-Sep-2026  JOURNAL  PRM-CCA-001       Challan COGS → order cost centre       COGS (cost centre)                COGS (no cost centre)
    05-Sep-2026  PAYMENT  PRM-PAY-EXP-001   Inland transport + inspection          Transport / Miscellaneous Expense Eastern Bank
    08-Sep-2026  PAYMENT  PRM-PAY-TRM-001   Pay trims supplier (bill-wise)         Trims supplier                    Eastern Bank
    08-Sep-2026  PAYMENT  PRM-PAY-PCK-001   Pay packing supplier                   Packing supplier                  Eastern Bank
    08-Sep-2026  PAYMENT  PRM-PAY-JW-001    Pay job-work supplier                  Job-work supplier                 Eastern Bank
    15-Oct-2026  PAYMENT  PRM-BTB-001       BTB LC matured, bank paid supplier     Fabric supplier                   Bank-Financed BTB Settlement
    23-Oct-2026  RECEIPT  PRM-CI-001        Export proceeds @ 122.50 (CI payment)  Eastern Bank + Bank Charges       Primark + Exchange Gain
    23-Oct-2026  PAYMENT  PRM-PRD-001       Proceeds distribution by the bank      BTB finance + PC loan + interest  Eastern Bank

How the vouchers are booked (the same services the Finance API uses):
  * create_system_voucher()  – numbered DRAFT voucher + lines (VCH-<year>-<type>-MAIN-0001 series)
  * _post()                  – the same steps as the "Post" button (POST /finance/vouchers/{id}/status):
                               open-period check, duplicate fingerprint, posted snapshot, ledger balances,
                               party-ledger bills (bill-wise), QR verification id + approval trail
  * get_or_create_party_ledger()               – Sundry debtor / creditor ledgers (AR-/AP- accounts)
  * create_receipt_from_commercial_invoice()   – realisation linked to the commercial invoice
Income/expense lines carry the order cost centre, so the cost-centre "net" equals the order profit.

Safety: each voucher runs in its own savepoint (one failure is logged, the rest continue). Re-running is
safe: a voucher is found by (type, reference) + narration containing the order code. Vouchers that an
upstream module already posted (GRN inventory GL, posted vendor bills, BTB LC realisation, posted CI AR
voucher) are detected and not booked twice.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Awaitable, Callable

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.models import (
    AccountGroup,
    AccountingPeriod,
    BankAccount,
    BtbLc,
    BtbLcAccounting,
    BtbMaturityTranche,
    ChartOfAccount,
    CommercialInvoice,
    CommercialInvoiceReceiptAllocation,
    CostCenter,
    DeliveryChallan,
    GoodsReceiving,
    GoodsReceivingItem,
    InventoryGlPosting,
    Item,
    MasterContract,
    Order,
    ProcessOrder,
    ProcessOrderCostLine,
    ProductionMaterialIssue,
    PurchaseOrder,
    PurchaseOrderItem,
    Quotation,
    Role,
    StockMovement,
    User,
    Vendor,
    VendorBill,
    VendorBillLine,
    Voucher,
    VoucherLine,
    VoucherType,
)
from app.models.party_ledger import PartyLedger, PartyLedgerBill, PartyLedgerBillAllocation
from app.modules.finance.auto_posting_service import (
    AutoPostingLine,
    _apply_internal_signature,
    create_system_voucher,
)
from app.modules.finance.party_ledger_bill_service import auto_allocate_payment
from app.modules.finance.party_ledger_service import get_or_create_party_ledger, update_party_ledger_balance
from app.modules.finance.system_coa_seeding_service import resolve_system_ledger
from app.modules.finance.voucher_controls import finalize_posted_voucher_metadata
from app.modules.finance.voucher_history import record_voucher_event

from primark_demo.common import (
    BTB_LC_REF,
    COMMERCIAL_INVOICE_NO,
    DELIVERY_CHALLAN_CODE,
    GRN_FABRIC_CODE,
    GRN_PACK_CODE,
    GRN_TRIM_CODE,
    JOBWORK_CODE,
    MATERIAL_ISSUE_CODE,
    MATERIALS,
    ORDER_CODE,
    ORDER_QTY,
    ORDER_VALUE_USD,
    PO_FABRIC_CODE,
    PO_PACK_CODE,
    PO_TRIM_CODE,
    QUOTATION_CODE,
    SALES_CONTRACT_REF,
    SEASON,
    USD_TO_BDT,
    VENDOR_FABRIC_CODE,
    VENDOR_JOBWORK_CODE,
    VENDOR_PACK_CODE,
    VENDOR_TRIM_CODE,
    D,
    DemoContext,
    find_one,
    require_one,
)

# ---------------------------------------------------------------------------
# Settings for this stage
# ---------------------------------------------------------------------------
TWO = Decimal("0.01")
ZERO = Decimal("0")

COST_CENTER_CODE = ORDER_CODE
COST_CENTER_NAME = f"{ORDER_CODE} Primark {SEASON} Tee"

PURCHASE_VTYPE = ("PJ", "Purchase Journal")  # in the app's default voucher-type catalogue
SOURCE_MANUAL = "MANUAL"
SOURCE_VENDOR_BILL = "VENDOR_BILL"
SOURCE_CI = "COMMERCIAL_INVOICE"

# Accounting periods (monthly) so every order date can be posted.
PERIOD_MONTHS = [(2026, m) for m in range(6, 13)]  # Jun–Dec 2026

REALISATION_RATE = Decimal("122.50")  # bank buying rate on the day Primark paid
BANK_CHARGES_USD = Decimal("45.00")
JOBWORK_RATE_USD = Decimal("0.12")
CM_FALLBACK_USD = Decimal("13200.00")  # quotation manufacturing cost, used if the quotation is missing
INLAND_TRANSPORT_USD = Decimal("600.00")
INSPECTION_USD = Decimal("450.00")

PC_LOAN_BDT = Decimal("1000000.00")  # packing credit against the sales contract
PC_LOAN_DATE = D["cutting_start"]
PC_INTEREST_RATE = Decimal("0.09")  # 9% p.a.

FABRIC_CREDIT_DAYS = (D["btb_maturity"] - D["grn_fabric"]).days  # BTB LC usance
LOCAL_CREDIT_DAYS = 30
BUYER_CREDIT_DAYS = 45

EBL_LEDGER_NAME = "Eastern Bank PLC – Principal Branch (CD 1011060123456)"
EBL_ACCOUNT_NO = "1011060123456"
JOBWORK_LEDGER_NAME = "Subcontract Printing Charges (Job Work)"

# Voucher references (purchase bills use the GRN / job-work code as the bill-wise reference)
REF_PC_LOAN = "PRM-PCL-001"
REF_CONSUMPTION = "PRM-MCJ-001"
REF_CM = "PRM-CMJ-001"
REF_JW_ADDONS = "PRM-PAY-JWT-001"
REF_COGS_CC = "PRM-CCA-001"
REF_OTHER_COSTS = "PRM-PAY-EXP-001"
REF_DISTRIBUTION = "PRM-PRD-001"
CI_RECEIPT_KEY = "PRM-REALISATION-001"

# (GRN code, PO code, vendor code, credit days, fallback date)
PURCHASES = [
    (GRN_FABRIC_CODE, PO_FABRIC_CODE, VENDOR_FABRIC_CODE, FABRIC_CREDIT_DAYS, D["grn_fabric"]),
    (GRN_TRIM_CODE, PO_TRIM_CODE, VENDOR_TRIM_CODE, LOCAL_CREDIT_DAYS, D["grn_trims"]),
    (GRN_PACK_CODE, PO_PACK_CODE, VENDOR_PACK_CODE, LOCAL_CREDIT_DAYS, D["grn_packing"]),
]
# (vendor code, bill reference, payment reference, cheque number)
LOCAL_PAYMENTS = [
    (VENDOR_TRIM_CODE, GRN_TRIM_CODE, "PRM-PAY-TRM-001", "EBL-CHQ-0042117"),
    (VENDOR_PACK_CODE, GRN_PACK_CODE, "PRM-PAY-PCK-001", "EBL-CHQ-0042118"),
    (VENDOR_JOBWORK_CODE, JOBWORK_CODE, "PRM-PAY-JW-001", "EBL-CHQ-0042119"),
]

# role -> system ledger mapping key (accounting_system_mappings, seeded by the system chart of accounts)
SYSTEM_LEDGERS = {
    "rm_inventory": "RAW_MATERIAL_INVENTORY",
    "pack_inventory": "PACKING_MATERIAL_INVENTORY",
    "consumption": "RAW_MATERIAL_CONSUMPTION",
    "export_sales": "SALES_REVENUE_EXPORT",
    "fx_gain": "EXCHANGE_GAIN",
    "bank_charges": "BANK_CHARGES_EXPENSE",
    "interest": "INTEREST_ON_LOAN_EXPENSE",
    "pc_loan": "WORKING_CAPITAL_LOAN",
    "btb_finance": "BANK_FINANCED_BTB_SETTLEMENT",
    "wages": "DIRECT_WAGES_EXPENSE",
    "wages_payable": "DIRECT_WAGES_PAYABLE",
    "transport": "TRANSPORT_EXPENSE",
    "inspection": "MISCELLANEOUS_EXPENSE",
}

SPEC_BY_CODE = {m.code: m for m in MATERIALS}
APPROVAL_STAGES = ["SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED"]
DEAD_STATUSES = ("CANCELLED", "REVERSED", "REJECTED")


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _d(value: Any) -> Decimal:
    """Any number / numeric string -> Decimal (None or junk -> 0)."""
    try:
        return Decimal(str(value).replace(",", "")) if value not in (None, "") else ZERO
    except Exception:
        return ZERO


def _bdt(usd: Decimal, rate: Decimal = USD_TO_BDT) -> Decimal:
    return (usd * rate).quantize(TWO)


def _fmt(amount: Decimal) -> str:
    return f"{amount:,.2f}"


def _dr(amount: Decimal, account_id: int, notes: str, cost_center_id: int | None = None) -> AutoPostingLine:
    return AutoPostingLine(entry_type="DEBIT", amount=amount.quantize(TWO), account_id=account_id,
                           cost_center_id=cost_center_id, notes=notes)


def _cr(amount: Decimal, account_id: int, notes: str, cost_center_id: int | None = None) -> AutoPostingLine:
    return AutoPostingLine(entry_type="CREDIT", amount=amount.quantize(TWO), account_id=account_id,
                           cost_center_id=cost_center_id, notes=notes)


@dataclass
class Books:
    """Everything the voucher steps share: posting user, order, cost centre and ledger ids."""

    user: User
    order: Order
    contract: MasterContract
    cost_center_id: int
    acc: dict[str, int] = field(default_factory=dict)  # role -> chart_of_accounts.id
    booked: list[Voucher] = field(default_factory=list)


@dataclass
class GrnLine:
    """One received material line, valued in BDT (stores value) with its USD equivalent at the PO rate."""

    item_id: int
    item_code: str
    qty: Decimal
    unit_price_bdt: Decimal
    rate: Decimal
    grn_item_id: int | None = None
    po_line_id: int | None = None

    @property
    def amount_bdt(self) -> Decimal:
        return (self.qty * self.unit_price_bdt).quantize(TWO)

    @property
    def unit_price_usd(self) -> Decimal:
        return (self.unit_price_bdt / self.rate).quantize(Decimal("0.0001"))

    @property
    def amount_usd(self) -> Decimal:
        return (self.amount_bdt / self.rate).quantize(TWO)

    @property
    def is_packing(self) -> bool:
        spec = SPEC_BY_CODE.get(self.item_code)
        return bool(spec and spec.category_code == "PACK")


# ---------------------------------------------------------------------------
# Set-up: periods, voucher type, cost centre, ledgers
# ---------------------------------------------------------------------------
async def _admin_user(db: AsyncSession, ctx: DemoContext) -> User:
    """First active admin of the tenant – the 'accountant' who enters and approves the vouchers."""
    user = (
        await db.execute(
            select(User)
            .join(Role, Role.id == User.role_id)
            .where(User.tenant_id == ctx.tenant_id, User.is_active.is_(True), func.lower(Role.name) == "admin")
            .order_by(User.id)
            .limit(1)
        )
    ).scalars().first()
    if user is None:
        raise RuntimeError("No active admin user in tenant – needed to post vouchers")
    return user


async def _ensure_accounting_periods(db: AsyncSession, ctx: DemoContext) -> None:
    """Open monthly accounting periods (FY26-M06 … FY26-M12) so the order dates can be posted."""
    created = []
    for year, month in PERIOD_MONTHS:
        start = date(year, month, 1)
        end = date(year, month, calendar.monthrange(year, month)[1])
        overlap = (
            await db.execute(
                select(AccountingPeriod).where(
                    AccountingPeriod.tenant_id == ctx.tenant_id,
                    AccountingPeriod.start_date <= end,
                    AccountingPeriod.end_date >= start,
                )
            )
        ).scalars().first()
        if overlap is None:
            name = f"FY{str(year)[-2:]}-M{month:02d}"
            db.add(AccountingPeriod(tenant_id=ctx.tenant_id, period_name=name, start_date=start,
                                    end_date=end, is_closed=False))
            created.append(name)
        elif overlap.is_closed:
            ctx.log(f"WARNING accounting period {overlap.period_name} is CLOSED – vouchers in it will fail")
    await db.flush()
    ctx.log(f"Accounting periods: {'created ' + ', '.join(created) if created else 'Jun–Dec 2026 already open'}")


async def _ensure_purchase_voucher_type(db: AsyncSession, ctx: DemoContext) -> None:
    """Activate the app's standard 'PJ – Purchase Journal' type for supplier bills."""
    code, name = PURCHASE_VTYPE
    row = await find_one(db, VoucherType, tenant_id=ctx.tenant_id, code=code)
    if row is None:
        db.add(VoucherType(tenant_id=ctx.tenant_id, code=code, name=name, is_active=True, is_system=True))
        await db.flush()
        ctx.log(f"Voucher type {code} ({name}) activated")
    elif not row.is_active:
        row.is_active = True
        ctx.log(f"Voucher type {code} re-activated")


async def _ensure_cost_center(db: AsyncSession, ctx: DemoContext, contract: MasterContract) -> int:
    """Order cost centre, linked to sales contract PRM-SC-001 (MasterContract.cost_center_id)."""
    if contract.cost_center_id is not None:
        cc = await db.get(CostCenter, contract.cost_center_id)
        ctx.log(f"Cost centre already linked to {SALES_CONTRACT_REF}: {cc.center_code if cc else contract.cost_center_id}")
        return contract.cost_center_id
    cc = await find_one(db, CostCenter, tenant_id=ctx.tenant_id, center_code=COST_CENTER_CODE)
    if cc is None:
        cc = CostCenter(tenant_id=ctx.tenant_id, center_code=COST_CENTER_CODE, name=COST_CENTER_NAME,
                        department="Trade", is_active=True)
        db.add(cc)
        await db.flush()
        ctx.log(f"Cost centre {COST_CENTER_CODE} '{COST_CENTER_NAME}' created")
    contract.cost_center_id = cc.id
    await db.flush()
    ctx.log(f"Cost centre {COST_CENTER_CODE} linked to sales contract {SALES_CONTRACT_REF}")
    return cc.id


async def _ensure_ledger(db: AsyncSession, ctx: DemoContext, *, name: str, group_system_code: str,
                         is_bank: bool = False, description: str | None = None) -> int:
    """Find a ledger by name, or create it like Finance → Chart of accounts → New (AC-0001 numbering)."""
    acct = await find_one(db, ChartOfAccount, tenant_id=ctx.tenant_id, name=name)
    if acct:
        return acct.id
    group = await require_one(db, AccountGroup, tenant_id=ctx.tenant_id, system_code=group_system_code)
    number = await next_tenant_code(db, model=ChartOfAccount, tenant_id=ctx.tenant_id, prefix="AC-", width=4)
    acct = ChartOfAccount(
        tenant_id=ctx.tenant_id, account_number=number, name=name, group_id=group.id,
        normal_balance=group.default_normal_balance or "debit", opening_balance=ZERO, balance=ZERO,
        is_active=True, is_bank_account=is_bank, account_type="posting", description=description,
        account_currency="BDT",
    )
    db.add(acct)
    await db.flush()
    ctx.log(f"Ledger {number} '{name}' created under {group.name}")
    return acct.id


async def _ensure_eastern_bank(db: AsyncSession, ctx: DemoContext) -> int:
    """Eastern Bank ledger + Banking → Bank accounts row (same account as the PI's shipper bank)."""
    gl_id = await _ensure_ledger(db, ctx, name=EBL_LEDGER_NAME, group_system_code="CASH_AND_BANK", is_bank=True,
                                 description="Export proceeds / BTB / packing-credit account")
    bank = await find_one(db, BankAccount, tenant_id=ctx.tenant_id, account_number=EBL_ACCOUNT_NO)
    if bank is None:
        db.add(BankAccount(tenant_id=ctx.tenant_id, account_name=ctx.tenant.name, bank_name="Eastern Bank PLC",
                           account_number=EBL_ACCOUNT_NO, branch_name="Principal Branch, Dhaka",
                           swift_code="EBLDBDDH", currency="BDT", gl_account_id=gl_id, is_active=True))
        await db.flush()
        ctx.log(f"Bank account Eastern Bank PLC {EBL_ACCOUNT_NO} linked to its ledger")
    return gl_id


async def _party_account(db: AsyncSession, ctx: DemoContext, books: Books, party_type: str, party_id: int,
                         credit_days: int) -> tuple[PartyLedger, int]:
    """Sundry debtor/creditor ledger for a customer/vendor (created like Finance → Party ledgers → New)."""
    existed = (
        await db.execute(
            select(PartyLedger).where(
                PartyLedger.tenant_id == ctx.tenant_id,
                PartyLedger.party_type == party_type,
                (PartyLedger.customer_id if party_type == "CUSTOMER" else PartyLedger.vendor_id) == party_id,
            )
        )
    ).scalars().first()
    pl = existed or await get_or_create_party_ledger(
        db, ctx.tenant_id, party_type, party_id, credit_days=credit_days,
        opening_balance_date=D["inquiry_received"], created_by=books.user.id,
    )
    if existed is None:
        acct = await db.get(ChartOfAccount, pl.ledger_account_id)
        ctx.log(f"Party ledger {acct.account_number} '{acct.name}' created ({credit_days} credit days, bill-wise)")
    return pl, pl.ledger_account_id


async def _prepare(db: AsyncSession, ctx: DemoContext) -> Books:
    await _ensure_accounting_periods(db, ctx)
    await _ensure_purchase_voucher_type(db, ctx)
    user = await _admin_user(db, ctx)
    order = await require_one(db, Order, tenant_id=ctx.tenant_id, order_code=ORDER_CODE)
    contract = await require_one(db, MasterContract, tenant_id=ctx.tenant_id, reference=SALES_CONTRACT_REF)
    cc_id = await _ensure_cost_center(db, ctx, contract)
    books = Books(user=user, order=order, contract=contract, cost_center_id=cc_id)
    for role, key in SYSTEM_LEDGERS.items():
        books.acc[role] = await resolve_system_ledger(db, ctx.tenant_id, key)
    books.acc["bank"] = await _ensure_eastern_bank(db, ctx)
    _, books.acc["primark"] = await _party_account(db, ctx, books, "CUSTOMER", ctx.customer.id, BUYER_CREDIT_DAYS)
    ctx.log(f"Posting as user '{user.username}'; ledgers ready ({len(books.acc)} roles)")
    return books


# ---------------------------------------------------------------------------
# Voucher engine: find / create / post / log
# ---------------------------------------------------------------------------
async def _find_voucher(db: AsyncSession, ctx: DemoContext, vtype: str, reference: str) -> Voucher | None:
    """Our earlier voucher for this (type, reference) – narration always contains the order code."""
    return (
        await db.execute(
            select(Voucher)
            .where(
                Voucher.tenant_id == ctx.tenant_id,
                Voucher.voucher_type == vtype,
                Voucher.reference == reference,
                Voucher.status.not_in(DEAD_STATUSES),
                Voucher.description.ilike(f"%{ORDER_CODE}%"),
            )
            .order_by(Voucher.id)
            .limit(1)
        )
    ).scalars().first()


async def _voucher_lines(db: AsyncSession, voucher_id: int) -> list[VoucherLine]:
    return list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher_id).order_by(VoucherLine.id)))
        .scalars().all()
    )


async def _record_approval_trail(db: AsyncSession, ctx: DemoContext, books: Books, v: Voucher) -> None:
    """Draft → Submitted → Checked → Recommended → Approved → Posted (shows as signatures on the print)."""
    previous = "DRAFT"
    for status in APPROVAL_STAGES:
        await record_voucher_event(db, tenant_id=ctx.tenant_id, user_id=books.user.id, voucher_id=v.id,
                                   event="status", summary=f"{previous} → {status}",
                                   from_status=previous, to_status=status)
        previous = status


async def _apply_to_books(db: AsyncSession, tenant_id: int, v: Voucher, lines: list[VoucherLine]) -> None:
    """Add the voucher lines to the cached ledger balances (shared posting helper when available)."""
    try:
        from app.modules.finance.posting_core import apply_voucher_to_books
    except ImportError:  # older app build without posting_core
        accounts = {
            a.id: a
            for a in (await db.execute(select(ChartOfAccount).where(
                ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_({ln.account_id for ln in lines}))
                .order_by(ChartOfAccount.id).with_for_update())).scalars().all()
        }
        for ln in lines:
            acct = accounts[ln.account_id]
            debit_normal = (acct.normal_balance or "debit").lower() == "debit"
            sign = 1 if (ln.entry_type == "DEBIT") == debit_normal else -1
            acct.balance = (_d(acct.balance) + sign * _d(ln.amount)).quantize(Decimal("0.0001"))
        v.books_applied = True
        return
    await apply_voucher_to_books(db, tenant_id, v, lines)


async def _post(db: AsyncSession, ctx: DemoContext, books: Books, v: Voucher, *,
                party_hook_by_account: bool = False) -> None:
    """Post a DRAFT voucher with the same steps as the Finance 'Post' action.

    party_hook_by_account=True makes the party-ledger hook match bills by ledger account instead of the
    commercial-invoice link (the CI link would open a new receivable bill for a receipt's bank line).
    """
    tid = ctx.tenant_id
    period = (
        await db.execute(
            select(AccountingPeriod).where(
                AccountingPeriod.tenant_id == tid,
                AccountingPeriod.is_closed.is_(False),
                AccountingPeriod.start_date <= v.voucher_date,
                AccountingPeriod.end_date >= v.voucher_date,
            )
        )
    ).scalars().first()
    if period is None:
        raise RuntimeError(f"No open accounting period for {v.voucher_date}")
    lines = await _voucher_lines(db, v.id)
    await finalize_posted_voucher_metadata(db, tid, v, lines, strict_duplicate_check=True)
    await _apply_to_books(db, tid, v, lines)
    v.status = "POSTED"
    await db.flush()

    from app.modules.commercial.commercial_invoice_service import sync_ci_allocation_status_for_voucher
    from app.modules.commercial.proforma_receipt_service import sync_allocation_status_for_voucher
    from app.modules.facility.posting_hooks import process_facility_voucher_posted
    from app.modules.finance.party_ledger_hooks import on_voucher_posted

    await process_facility_voucher_posted(db, tid, v, books.user.id)
    await sync_allocation_status_for_voucher(db, tenant_id=tid, voucher=v)
    await sync_ci_allocation_status_for_voucher(db, tenant_id=tid, voucher=v)
    saved_ref = v.source_module_ref
    if party_hook_by_account:
        v.source_module_ref = None
    await on_voucher_posted(db, tid, v, feature_flags=ctx.tenant.feature_flags, created_by=books.user.id)
    v.source_module_ref = saved_ref
    if v.voucher_type == "PAYMENT":
        from app.modules.finance.tds_service import maybe_auto_tds_on_payment_voucher

        try:
            async with db.begin_nested():
                await maybe_auto_tds_on_payment_voucher(db, tid, v, feature_flags=ctx.tenant.feature_flags,
                                                        created_by=books.user.id)
        except Exception as exc:  # same fail-soft rule as the API
            ctx.log(f"   (auto TDS skipped: {exc})")
    _apply_internal_signature(v, lines)
    await _record_approval_trail(db, ctx, books, v)
    await db.flush()


async def _name_party_bills(db: AsyncSession, ctx: DemoContext, v: Voucher, bill_number: str) -> None:
    """Give the bill-wise reference the source document number (e.g. PRM-GRN-FAB-001) instead of PL-x-0001."""
    taken = await find_one(db, PartyLedgerBill, tenant_id=ctx.tenant_id, bill_number=bill_number)
    if taken is not None:
        return
    bill = (
        await db.execute(
            select(PartyLedgerBill).where(PartyLedgerBill.tenant_id == ctx.tenant_id,
                                          PartyLedgerBill.voucher_id == v.id).order_by(PartyLedgerBill.id).limit(1)
        )
    ).scalars().first()
    if bill is not None:
        bill.bill_number = bill_number
        await db.flush()


async def _log_voucher(db: AsyncSession, ctx: DemoContext, v: Voucher, extra: str = "") -> None:
    lines = await _voucher_lines(db, v.id)
    names = {
        a.id: a.name
        for a in (await db.execute(select(ChartOfAccount).where(ChartOfAccount.id.in_({ln.account_id for ln in lines}))))
        .scalars().all()
    }
    total = sum((_d(ln.amount) for ln in lines if ln.entry_type == "DEBIT"), ZERO)

    def side(entry_type: str) -> str:
        picked = [ln for ln in lines if ln.entry_type == entry_type]
        if len(picked) == 1:
            return names.get(picked[0].account_id, "?")
        return " + ".join(f"{names.get(ln.account_id, '?')} {_fmt(_d(ln.amount))}" for ln in picked)

    ctx.log(f"{v.voucher_type:<7} {v.voucher_number} {v.voucher_date:%d-%b-%Y} BDT {_fmt(total):>15} "
            f"| Dr {side('DEBIT')} | Cr {side('CREDIT')} | ref {v.reference}{extra}")


async def _book(db: AsyncSession, ctx: DemoContext, books: Books, *, vtype: str, vdate: date, reference: str,
                narration: str, lines: list[AutoPostingLine], source_module: str = SOURCE_MANUAL,
                source_ref: str | None = None, btb_lc_id: int | None = None, instrument: str | None = None,
                bill_number: str | None = None) -> Voucher:
    """Create a numbered voucher (create_system_voucher), post it and log it."""
    v = await create_system_voucher(
        db, tenant_id=ctx.tenant_id, user_id=books.user.id, voucher_type=vtype, voucher_date=vdate,
        lines=lines, description=narration, reference=reference, source_module=source_module,
        source_module_ref=source_ref, btb_lc_id=btb_lc_id, currency="BDT", auto_post=False,
    )
    v.order_id = books.order.id
    v.instrument_reference = instrument
    v.allow_manual_edit = source_module == SOURCE_MANUAL
    await record_voucher_event(db, tenant_id=ctx.tenant_id, user_id=books.user.id, voucher_id=v.id,
                               event="created", to_status="DRAFT",
                               summary=f"Created {vtype} {v.voucher_number} for {_fmt(sum(l.amount for l in lines if l.entry_type == 'DEBIT'))}")
    await _post(db, ctx, books, v)
    if bill_number:
        await _name_party_bills(db, ctx, v, bill_number)
    await _log_voucher(db, ctx, v)
    books.booked.append(v)
    return v


async def _replace_lines(db: AsyncSession, ctx: DemoContext, v: Voucher, lines: list[AutoPostingLine]) -> None:
    """Rewrite an app-generated DRAFT (USD amounts) into BDT lines – reports add up line amounts as BDT."""
    await db.execute(delete(VoucherLine).where(VoucherLine.voucher_id == v.id))
    for ln in lines:
        amt = f"{ln.amount:.2f}"
        db.add(VoucherLine(tenant_id=ctx.tenant_id, voucher_id=v.id, account_id=ln.account_id,
                           cost_center_id=ln.cost_center_id, currency="BDT", exchange_rate="1", base_amount=amt,
                           is_rate_overridden=False, rate_source="system", entry_type=ln.entry_type,
                           amount=amt, notes=ln.notes))
    v.currency, v.base_currency, v.exchange_rate = "BDT", "BDT", "1"
    await db.flush()


async def _ensure_settled(db: AsyncSession, ctx: DemoContext, books: Books, v: Voucher, party_id: int,
                          party_type: str, amount: Decimal) -> None:
    """Bill-wise: make sure a payment/receipt is allocated against the party's open bill (FIFO)."""
    done = await find_one(db, PartyLedgerBillAllocation, tenant_id=ctx.tenant_id, voucher_id=v.id)
    if done is not None:
        return
    pl = (
        await db.execute(
            select(PartyLedger).where(
                PartyLedger.tenant_id == ctx.tenant_id,
                (PartyLedger.vendor_id if party_type == "VENDOR" else PartyLedger.customer_id) == party_id,
            )
        )
    ).scalars().first()
    if pl is None:
        return
    await auto_allocate_payment(db, ctx.tenant_id, pl.id, v, amount, allocation_method="FIFO",
                                target_amount_type="CR" if party_type == "VENDOR" else "DR",
                                created_by=books.user.id)
    await update_party_ledger_balance(db, pl.id)


# ---------------------------------------------------------------------------
# Upstream look-ups (never double-post)
# ---------------------------------------------------------------------------
async def _grn_lines(db: AsyncSession, ctx: DemoContext, grn: GoodsReceiving, vendor_code: str,
                     rate: Decimal) -> list[GrnLine]:
    """Accepted qty × unit price per GRN line, in BDT.

    Stores value GRNs in taka (e.g. 414.80 = USD 3.40 × 122). A GRN price that still equals the PO / BOM
    USD price is converted at the PO rate; a missing price falls back to PO price, then the BOM price.
    """
    rows = (
        await db.execute(
            select(GoodsReceivingItem, Item.item_code)
            .join(Item, Item.id == GoodsReceivingItem.item_id)
            .where(GoodsReceivingItem.goods_receiving_id == grn.id)
            .order_by(GoodsReceivingItem.id)
        )
    ).all()
    out: list[GrnLine] = []
    for gi, code in rows:
        qty = _d(gi.accepted_qty) or _d(gi.received_qty) or _d(gi.quantity)
        poi = await db.get(PurchaseOrderItem, gi.purchase_order_line_id) if gi.purchase_order_line_id else None
        foreign_price = _d(poi.unit_price) if poi else (SPEC_BY_CODE[code].unit_price if code in SPEC_BY_CODE else ZERO)
        grn_price = _d(gi.unit_price)
        if grn_price <= 0:
            bdt_price = foreign_price * rate
        elif foreign_price > 0 and abs(grn_price - foreign_price) <= foreign_price * Decimal("0.05"):
            bdt_price = grn_price * rate  # GRN still carries the USD price
        else:
            bdt_price = grn_price
        if qty > 0 and bdt_price > 0:
            out.append(GrnLine(gi.item_id, code, qty, bdt_price, rate, gi.id, gi.purchase_order_line_id))
    if out:
        return out
    ctx.log(f"   {grn.grn_code} has no priced lines – using BOM quantities for {vendor_code}")
    for spec in (m for m in MATERIALS if m.vendor_code == vendor_code):
        item = await require_one(db, Item, tenant_id=ctx.tenant_id, item_code=spec.code)
        out.append(GrnLine(item.id, spec.code, spec.required_qty, spec.unit_price * rate, rate))
    return out


def _po_rate(po: PurchaseOrder | None) -> Decimal:
    """USD purchase orders are booked at the order rate (122); a BDT PO is already in taka."""
    if po is not None and (po.currency or "USD").upper() == "BDT":
        return Decimal("1")
    return USD_TO_BDT


async def _posted_vendor_bill_voucher(db: AsyncSession, ctx: DemoContext, grn_id: int) -> Voucher | None:
    """A vendor bill for this GRN that another module (Finance → Vendor bills) already posted."""
    vb = (
        await db.execute(
            select(VendorBill).where(VendorBill.tenant_id == ctx.tenant_id, VendorBill.goods_receiving_id == grn_id,
                                     VendorBill.voucher_id.is_not(None))
        )
    ).scalars().first()
    return await db.get(Voucher, vb.voucher_id) if vb else None


async def _inventory_gl_vouchers(db: AsyncSession, ctx: DemoContext, source_system: str,
                                 source_ids: list[int], action: str | None = None) -> list[Voucher]:
    """POSTED stores vouchers (inventory_gl_postings) for the given source documents."""
    if not source_ids:
        return []
    stmt = select(InventoryGlPosting.voucher_id).where(
        InventoryGlPosting.tenant_id == ctx.tenant_id,
        InventoryGlPosting.source_system == source_system,
        InventoryGlPosting.source_id.in_(source_ids),
    )
    if action:
        stmt = stmt.where(InventoryGlPosting.action == action)
    ids = (await db.execute(stmt)).scalars().all()
    vouchers = [await db.get(Voucher, i) for i in ids]
    return [v for v in vouchers if v is not None and v.status == "POSTED"]


async def _absorbed_wip_account(db: AsyncSession, ctx: DemoContext, process_order_id: int) -> int | None:
    """WIP ledger credited when stores received this process order's output at full cost.

    Stores value the output with processing charges / CM already added, so the real bill must be
    debited to that WIP ledger (not to an expense), otherwise the cost would be counted twice.
    """
    for v in await _inventory_gl_vouchers(db, ctx, "PROCESS_ORDER", [process_order_id], action="RECEIVE"):
        for ln in await _voucher_lines(db, v.id):
            if ln.entry_type == "CREDIT":
                return ln.account_id
    return None


async def _order_process_orders(db: AsyncSession, ctx: DemoContext, books: Books) -> list[ProcessOrder]:
    return list(
        (
            await db.execute(
                select(ProcessOrder)
                .where(ProcessOrder.tenant_id == ctx.tenant_id,
                       (ProcessOrder.source_order_id == books.order.id) | (ProcessOrder.linked_order_id == books.order.id))
                .order_by(ProcessOrder.id)
            )
        ).scalars().all()
    )


def _cost_line_bdt(line: ProcessOrderCostLine) -> Decimal:
    rate = Decimal("1") if (line.currency or "BDT").upper() == "BDT" else USD_TO_BDT
    return (_d(line.amount) * rate).quantize(TWO)


async def _bill_liability(db: AsyncSession, ctx: DemoContext, bill_ref: str) -> tuple[int, Decimal]:
    """(ledger, amount) still owed on a posted supplier bill – ours (PJ) or an upstream vendor-bill voucher."""
    v = await _find_voucher(db, ctx, PURCHASE_VTYPE[0], bill_ref)
    if v is None:
        grn = await find_one(db, GoodsReceiving, tenant_id=ctx.tenant_id, grn_code=bill_ref)
        v = await _posted_vendor_bill_voucher(db, ctx, grn.id) if grn else None
    if v is None or v.status != "POSTED":
        raise RuntimeError(f"Prerequisite missing: posted supplier bill {bill_ref}")
    credits = [ln for ln in await _voucher_lines(db, v.id) if ln.entry_type == "CREDIT"]
    main = max(credits, key=lambda ln: _d(ln.amount))
    return main.account_id, _d(main.amount)


# ---------------------------------------------------------------------------
# Voucher steps
# ---------------------------------------------------------------------------
async def _vendor_bill_row(db: AsyncSession, ctx: DemoContext, books: Books, *, code: str, vendor: Vendor,
                           bill_date: date, due: date, lines: list[GrnLine], rate: Decimal, invoice_ref: str,
                           grn: GoodsReceiving | None = None, po: PurchaseOrder | None = None,
                           notes: str) -> VendorBill:
    """Finance → Vendor bills row (re-uses an upstream draft for the same GRN when there is one)."""
    vb = await find_one(db, VendorBill, tenant_id=ctx.tenant_id, bill_code=code)
    if vb is None and grn is not None:
        vb = (
            await db.execute(
                select(VendorBill).where(VendorBill.tenant_id == ctx.tenant_id, VendorBill.goods_receiving_id == grn.id,
                                         VendorBill.voucher_id.is_(None), VendorBill.status != "CANCELLED")
            )
        ).scalars().first()
    total_usd = sum((ln.amount_usd for ln in lines), ZERO)
    if vb is None:
        vb = VendorBill(tenant_id=ctx.tenant_id, bill_code=code, vendor_id=vendor.id, created_by_user_id=books.user.id)
        db.add(vb)
        await db.flush()
        for ln in lines:
            db.add(VendorBillLine(tenant_id=ctx.tenant_id, vendor_bill_id=vb.id, goods_receiving_item_id=ln.grn_item_id,
                                  purchase_order_line_id=ln.po_line_id, item_id=ln.item_id,
                                  description=SPEC_BY_CODE[ln.item_code].name if ln.item_code in SPEC_BY_CODE else None,
                                  quantity=ln.qty, unit_price=ln.unit_price_usd, line_total=ln.amount_usd))
    vb.vendor_invoice_ref = vb.vendor_invoice_ref or invoice_ref
    vb.vendor_invoice_date = bill_date
    vb.bill_date = bill_date
    vb.due_date = due
    vb.currency = "USD" if rate != 1 else "BDT"
    vb.exchange_rate_to_base = rate
    vb.subtotal_amount = total_usd
    vb.tax_amount = ZERO
    vb.total_amount = total_usd
    vb.goods_receiving_id = grn.id if grn else None
    vb.purchase_order_id = po.id if po else None
    vb.source_order_id = books.order.id
    vb.notes = notes
    await db.flush()
    return vb


async def step_purchase_bill(db: AsyncSession, ctx: DemoContext, books: Books, grn_code: str, po_code: str,
                             vendor_code: str, credit_days: int, fallback_date: date) -> None:
    """Supplier bill for one GRN: Dr inventory (or GRNI if stores already posted it) / Cr supplier."""
    if (v := await _find_voucher(db, ctx, PURCHASE_VTYPE[0], grn_code)) is not None:
        ctx.log(f"{grn_code}: purchase bill already booked ({v.voucher_number})")
        return
    grn = await require_one(db, GoodsReceiving, tenant_id=ctx.tenant_id, grn_code=grn_code)
    vendor = await require_one(db, Vendor, tenant_id=ctx.tenant_id, vendor_code=vendor_code)
    po = await find_one(db, PurchaseOrder, tenant_id=ctx.tenant_id, po_code=po_code)
    if (upstream := await _posted_vendor_bill_voucher(db, ctx, grn.id)) is not None:
        ctx.log(f"{grn_code}: SKIPPED – vendor bill already posted upstream as {upstream.voucher_number}")
        return

    rate = _po_rate(po)
    lines = await _grn_lines(db, ctx, grn, vendor_code, rate)
    total_usd = sum((ln.amount_usd for ln in lines), ZERO)
    bill_date = grn.received_date or fallback_date
    by_inventory: dict[int, Decimal] = {}
    for ln in lines:
        acc = books.acc["pack_inventory"] if ln.is_packing else books.acc["rm_inventory"]
        by_inventory[acc] = by_inventory.get(acc, ZERO) + ln.amount_bdt
    total_bdt = sum(by_inventory.values(), ZERO)
    note = f"{grn_code} – USD {_fmt(total_usd)} @ {rate}"

    _, vendor_acc = await _party_account(db, ctx, books, "VENDOR", vendor.id, credit_days)
    credit_lines = [_cr(total_bdt, vendor_acc, f"Supplier bill {grn_code}")]
    debit_lines = [_dr(amt, acc, note) for acc, amt in by_inventory.items()]

    # Stores may already have posted Dr Inventory / Cr GRNI at receipt – then the bill clears GRNI instead.
    stock_vouchers = await _inventory_gl_vouchers(db, ctx, "GRN", [grn.id])
    if stock_vouchers:
        grni: dict[int, Decimal] = {}
        for sv in stock_vouchers:
            for ln in await _voucher_lines(db, sv.id):
                if ln.entry_type == "CREDIT":
                    grni[ln.account_id] = grni.get(ln.account_id, ZERO) + _d(ln.amount)
        debit_lines = [_dr(amt, acc, f"Clear GRNI {grn_code}") for acc, amt in grni.items()]
        diff = total_bdt - sum(grni.values(), ZERO)
        if diff > 0:
            debit_lines.append(_dr(diff, books.acc["rm_inventory"], f"{grn_code} bill vs stock value difference"))
        elif diff < 0:
            credit_lines.append(_cr(-diff, books.acc["rm_inventory"], f"{grn_code} bill vs stock value difference"))
        ctx.log(f"{grn_code}: stores already posted {', '.join(v.voucher_number for v in stock_vouchers)} "
                f"(Dr Inventory / Cr GRNI) – supplier bill clears GRNI")

    due = bill_date + timedelta(days=credit_days)
    invoice_ref = grn.supplier_invoice_no or f"{vendor_code}-INV-{bill_date:%y%m%d}"
    vb = await _vendor_bill_row(db, ctx, books, code=grn_code.replace("-GRN-", "-VB-"), vendor=vendor,
                                bill_date=bill_date, due=due, lines=lines, rate=rate, invoice_ref=invoice_ref,
                                grn=grn, po=po, notes=f"{ORDER_CODE} – {note}")
    btb_id = grn.btb_lc_id or (po.btb_lc_id if po else None)
    v = await _book(
        db, ctx, books, vtype=PURCHASE_VTYPE[0], vdate=bill_date, reference=grn_code,
        narration=f"Being purchase of materials from {vendor.name} against {po_code} / {grn_code}, "
                  f"invoice {invoice_ref}, USD {_fmt(total_usd)} @ {rate} – {ORDER_CODE}",
        lines=debit_lines + credit_lines, source_module=SOURCE_VENDOR_BILL, source_ref=str(vb.id),
        btb_lc_id=btb_id, bill_number=grn_code,
    )
    vb.voucher_id, vb.status, vb.posted_at, vb.approved_by_user_id = v.id, "POSTED", datetime.utcnow(), books.user.id
    await db.flush()


async def step_jobwork_bill(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    """Print job-work bill: Dr WIP (stores already absorbed the charge) or Subcontract charges / Cr supplier."""
    if (v := await _find_voucher(db, ctx, PURCHASE_VTYPE[0], JOBWORK_CODE)) is not None:
        ctx.log(f"{JOBWORK_CODE}: job-work bill already booked ({v.voucher_number})")
        return
    jw = await require_one(db, ProcessOrder, tenant_id=ctx.tenant_id, process_number=JOBWORK_CODE)
    vendor = (await db.get(Vendor, jw.vendor_id)) if jw.vendor_id else None
    vendor = vendor or await require_one(db, Vendor, tenant_id=ctx.tenant_id, vendor_code=VENDOR_JOBWORK_CODE)
    other = (
        await db.execute(
            select(Voucher).where(Voucher.tenant_id == ctx.tenant_id, Voucher.reference == JOBWORK_CODE,
                                  Voucher.status == "POSTED")
        )
    ).scalars().first()
    if other is not None or jw.knitting_service_voucher_id:
        ctx.log(f"{JOBWORK_CODE}: SKIPPED – job-work charge already posted upstream "
                f"({other.voucher_number if other else jw.knitting_service_voucher_id})")
        return

    qty = _d(jw.actual_output_qty) or _d(jw.expected_output_qty) or Decimal(ORDER_QTY)
    usd = (qty * JOBWORK_RATE_USD).quantize(TWO)
    bdt = _bdt(usd)
    bill_date = D["jobwork_received"]
    wip_acc = await _absorbed_wip_account(db, ctx, jw.id)
    if wip_acc is not None:
        debit = _dr(bdt, wip_acc, f"{JOBWORK_CODE} print charges (absorbed in printed-panel stock)")
        ctx.log(f"{JOBWORK_CODE}: stores valued the printed panels incl. print charge – bill debits WIP")
    else:
        books.acc.setdefault("jobwork", await _ensure_ledger(
            db, ctx, name=JOBWORK_LEDGER_NAME, group_system_code="DIRECT_PRODUCTION_COST",
            description="Outside printing / embroidery / washing charged per piece"))
        debit = _dr(bdt, books.acc["jobwork"], f"{JOBWORK_CODE} print charges", books.cost_center_id)
    _, vendor_acc = await _party_account(db, ctx, books, "VENDOR", vendor.id, LOCAL_CREDIT_DAYS)
    item_id = jw.output_item_id or jw.input_item_id
    item = await db.get(Item, item_id)
    vb = await _vendor_bill_row(
        db, ctx, books, code="PRM-VB-JW-001", vendor=vendor, bill_date=bill_date,
        due=bill_date + timedelta(days=LOCAL_CREDIT_DAYS),
        lines=[GrnLine(item_id, item.item_code if item else "", qty, JOBWORK_RATE_USD * USD_TO_BDT, USD_TO_BDT)],
        rate=USD_TO_BDT, invoice_ref=f"{vendor.vendor_code}-INV-{bill_date:%y%m%d}",
        notes=f"{ORDER_CODE} – chest print job work {JOBWORK_CODE}",
    )
    v = await _book(
        db, ctx, books, vtype=PURCHASE_VTYPE[0], vdate=bill_date, reference=JOBWORK_CODE,
        narration=f"Being chest-print job-work charges of {vendor.name} for {JOBWORK_CODE}: "
                  f"{qty:,.0f} pcs × USD {JOBWORK_RATE_USD} = USD {_fmt(usd)} @ {USD_TO_BDT} – {ORDER_CODE}",
        lines=[debit, _cr(bdt, vendor_acc, f"Job-work bill {JOBWORK_CODE}")],
        source_module=SOURCE_VENDOR_BILL, source_ref=str(vb.id), bill_number=JOBWORK_CODE,
    )
    vb.voucher_id, vb.status, vb.posted_at, vb.approved_by_user_id = v.id, "POSTED", datetime.utcnow(), books.user.id
    await db.flush()


async def step_pc_loan(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    """Packing credit from Eastern Bank against the sales contract (pays local suppliers before proceeds)."""
    if (v := await _find_voucher(db, ctx, "RECEIPT", REF_PC_LOAN)) is not None:
        ctx.log(f"{REF_PC_LOAN}: packing-credit loan already booked ({v.voucher_number})")
        return
    await _book(
        db, ctx, books, vtype="RECEIPT", vdate=PC_LOAN_DATE, reference=REF_PC_LOAN,
        narration=f"Being packing credit disbursed by Eastern Bank against sales contract {SALES_CONTRACT_REF} "
                  f"@ {PC_INTEREST_RATE * 100:.0f}% p.a. – {ORDER_CODE}",
        lines=[_dr(PC_LOAN_BDT, books.acc["bank"], "PC loan credited to CD account"),
               _cr(PC_LOAN_BDT, books.acc["pc_loan"], f"Packing credit {REF_PC_LOAN}")],
        instrument="EBL-PC-2026-0711",
    )


async def step_material_consumption(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    """Materials issued to the order: Dr Raw Material Consumption (COGS) / Cr RM + Packing inventory."""
    if (v := await _find_voucher(db, ctx, "JOURNAL", REF_CONSUMPTION)) is not None:
        ctx.log(f"{REF_CONSUMPTION}: material consumption already booked ({v.voucher_number})")
        return
    # Did stores already move these materials to COGS / WIP (material issue, job-work issue, challan)?
    upstream: list[Voucher] = []
    pmi = await find_one(db, ProductionMaterialIssue, tenant_id=ctx.tenant_id, issue_code=MATERIAL_ISSUE_CODE)
    if pmi is not None:
        mv_ids = list((await db.execute(select(StockMovement.id).where(
            StockMovement.tenant_id == ctx.tenant_id, StockMovement.reference_type == "PRODUCTION_MATERIAL_ISSUE",
            StockMovement.reference_id == pmi.id))).scalars().all())
        upstream += await _inventory_gl_vouchers(db, ctx, "PRODUCTION_MATERIAL_ISSUE", mv_ids)
    jw = await find_one(db, ProcessOrder, tenant_id=ctx.tenant_id, process_number=JOBWORK_CODE)
    if jw is not None:
        upstream += await _inventory_gl_vouchers(db, ctx, "PROCESS_ORDER", [jw.id])
    dc = await find_one(db, DeliveryChallan, tenant_id=ctx.tenant_id, challan_code=DELIVERY_CHALLAN_CODE)
    if dc is not None:
        upstream += await _inventory_gl_vouchers(db, ctx, "DELIVERY_CHALLAN", [dc.id])
    if upstream:
        ctx.log(f"{REF_CONSUMPTION}: SKIPPED – stores already posted material/COGS vouchers "
                f"{', '.join(v.voucher_number for v in upstream)}")
        return

    by_inventory: dict[int, Decimal] = {}
    for grn_code, po_code, vendor_code, _days, _dt in PURCHASES:
        grn = await find_one(db, GoodsReceiving, tenant_id=ctx.tenant_id, grn_code=grn_code)
        if grn is None:
            continue
        booked = (await _find_voucher(db, ctx, PURCHASE_VTYPE[0], grn_code)
                  or await _posted_vendor_bill_voucher(db, ctx, grn.id))
        if booked is None:
            continue
        rate = _po_rate(await find_one(db, PurchaseOrder, tenant_id=ctx.tenant_id, po_code=po_code))
        for ln in await _grn_lines(db, ctx, grn, vendor_code, rate):
            acc = books.acc["pack_inventory"] if ln.is_packing else books.acc["rm_inventory"]
            by_inventory[acc] = by_inventory.get(acc, ZERO) + ln.amount_bdt
    total = sum(by_inventory.values(), ZERO)
    if total <= 0:
        raise RuntimeError("Prerequisite missing: no booked purchase bills to consume")
    await _book(
        db, ctx, books, vtype="JOURNAL", vdate=D["material_issue"], reference=REF_CONSUMPTION,
        narration=f"Being fabric, trims and packing issued to production for {ORDER_CODE} "
                  f"(material issue {MATERIAL_ISSUE_CODE}) – charged to cost of goods sold",
        lines=[_dr(total, books.acc["consumption"], f"{MATERIAL_ISSUE_CODE} materials consumed", books.cost_center_id)]
              + [_cr(amt, acc, f"{MATERIAL_ISSUE_CODE} issued from store") for acc, amt in by_inventory.items()],
    )


async def step_jobwork_addons(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    """Supplier-less extras stores added to the job-work stock value (e.g. covered-van trips), paid by bank."""
    if (v := await _find_voucher(db, ctx, "PAYMENT", REF_JW_ADDONS)) is not None:
        ctx.log(f"{REF_JW_ADDONS}: job-work extras already booked ({v.voucher_number})")
        return
    jw = await require_one(db, ProcessOrder, tenant_id=ctx.tenant_id, process_number=JOBWORK_CODE)
    wip_acc = await _absorbed_wip_account(db, ctx, jw.id)
    extras = list((await db.execute(select(ProcessOrderCostLine).where(
        ProcessOrderCostLine.tenant_id == ctx.tenant_id, ProcessOrderCostLine.process_order_id == jw.id,
        ProcessOrderCostLine.cost_type == "ADD_ON", ProcessOrderCostLine.vendor_id.is_(None)))).scalars().all())
    if wip_acc is None or not extras:
        ctx.log(f"{REF_JW_ADDONS}: no extra job-work costs in stock value – nothing to pay")
        return
    lines = [_dr(_cost_line_bdt(cl), wip_acc, cl.description or "Job-work extra cost") for cl in extras]
    total = sum((ln.amount for ln in lines), ZERO)
    await _book(
        db, ctx, books, vtype="PAYMENT", vdate=D["jobwork_received"], reference=REF_JW_ADDONS,
        narration=f"Being {'; '.join(cl.description or 'extra cost' for cl in extras)} for job work {JOBWORK_CODE} "
                  f"– {ORDER_CODE}",
        lines=lines + [_cr(total, books.acc["bank"], "Paid by EBL cheque")], instrument="EBL-CHQ-0042101",
    )


async def step_cm_absorption(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    """Production labour (CM) for the order, owed to workers through the payroll run.

    If stores already added CM to the finished-goods value (process-order cost lines), the labour is
    debited to that WIP ledger; otherwise it is an expense (Direct Wages) on the order cost centre.
    """
    if (v := await _find_voucher(db, ctx, "JOURNAL", REF_CM)) is not None:
        ctx.log(f"{REF_CM}: CM absorption already booked ({v.voucher_number})")
        return
    absorbed: list[tuple[ProcessOrderCostLine, int]] = []
    for po in await _order_process_orders(db, ctx, books):
        if po.process_number == JOBWORK_CODE:
            continue
        wip_acc = await _absorbed_wip_account(db, ctx, po.id)
        if wip_acc is None:
            continue
        for cl in (await db.execute(select(ProcessOrderCostLine).where(
                ProcessOrderCostLine.tenant_id == ctx.tenant_id, ProcessOrderCostLine.process_order_id == po.id,
                ProcessOrderCostLine.cost_type == "ADD_ON"))).scalars().all():
            absorbed.append((cl, wip_acc))

    if absorbed:
        lines = [_dr(_cost_line_bdt(cl), wip, cl.description or "CM labour") for cl, wip in absorbed]
        total = sum((ln.amount for ln in lines), ZERO)
        narration = (f"Being production labour absorbed into finished goods of {ORDER_CODE}: "
                     f"{'; '.join(cl.description or 'CM' for cl, _ in absorbed)} (paid via August payroll)")
        ctx.log(f"{REF_CM}: stores added CM to finished-goods value – labour debited to WIP")
    else:
        q = await find_one(db, Quotation, tenant_id=ctx.tenant_id, quotation_code=QUOTATION_CODE)
        cm_usd = _d(q.manufacturing_cost) if q is not None and _d(q.manufacturing_cost) > 0 else CM_FALLBACK_USD
        total = _bdt(cm_usd)
        per_pc = (cm_usd / ORDER_QTY).quantize(Decimal("0.0001"))
        lines = [_dr(total, books.acc["wages"], f"CM labour {ORDER_CODE}", books.cost_center_id)]
        narration = (f"Being cutting, sewing and finishing labour of {ORDER_CODE}: {ORDER_QTY:,} pcs × CM USD "
                     f"{per_pc} = USD {_fmt(cm_usd)} @ {USD_TO_BDT} (paid via August payroll)")
    await _book(
        db, ctx, books, vtype="JOURNAL", vdate=D["finishing_end"], reference=REF_CM, narration=narration,
        lines=lines + [_cr(total, books.acc["wages_payable"], "August payroll – production wages")],
    )


async def step_cogs_cost_centre(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    """Stores posted COGS for the challan without a cost centre – allocate it to the order cost centre.

    Dr COGS (cost centre PRM-ORD-001) / Cr COGS (no cost centre): the ledger total does not change, only the
    cost-centre view, so the order P&L shows sales minus the real cost of the goods shipped.
    """
    if (v := await _find_voucher(db, ctx, "JOURNAL", REF_COGS_CC)) is not None:
        ctx.log(f"{REF_COGS_CC}: COGS cost-centre allocation already booked ({v.voucher_number})")
        return
    dc = await require_one(db, DeliveryChallan, tenant_id=ctx.tenant_id, challan_code=DELIVERY_CHALLAN_CODE)
    cogs_vouchers = await _inventory_gl_vouchers(db, ctx, "DELIVERY_CHALLAN", [dc.id])
    lines: list[AutoPostingLine] = []
    for cv in cogs_vouchers:
        for ln in await _voucher_lines(db, cv.id):
            if ln.entry_type == "DEBIT" and ln.cost_center_id is None:
                lines.append(_dr(_d(ln.amount), ln.account_id, f"{cv.voucher_number} → {COST_CENTER_CODE}",
                                 books.cost_center_id))
                lines.append(_cr(_d(ln.amount), ln.account_id, f"{cv.voucher_number} unallocated"))
    if not lines:
        ctx.log(f"{REF_COGS_CC}: no unallocated COGS from {DELIVERY_CHALLAN_CODE} – nothing to allocate")
        return
    await _book(
        db, ctx, books, vtype="JOURNAL", vdate=cogs_vouchers[0].voucher_date, reference=REF_COGS_CC,
        narration=f"Being cost of goods sold of delivery challan {DELIVERY_CHALLAN_CODE} "
                  f"({', '.join(v.voucher_number for v in cogs_vouchers)}) allocated to cost centre {COST_CENTER_CODE}",
        lines=lines,
    )


async def step_export_sales(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    """Export sales invoice PRM-CI-001: Dr Primark / Cr Sales Revenue - Export (cost centre)."""
    ci = await require_one(db, CommercialInvoice, tenant_id=ctx.tenant_id, invoice_code=COMMERCIAL_INVOICE_NO)
    app_draft: Voucher | None = None
    if ci.ar_voucher_id:
        linked = await db.get(Voucher, ci.ar_voucher_id)
        if linked is not None and linked.status == "POSTED":
            ctx.log(f"{COMMERCIAL_INVOICE_NO}: sales voucher already posted ({linked.voucher_number})")
            return
        if linked is not None and linked.status not in DEAD_STATUSES:
            app_draft = linked
    if app_draft is None and (v := await _find_voucher(db, ctx, "JOURNAL", COMMERCIAL_INVOICE_NO)) is not None:
        ctx.log(f"{COMMERCIAL_INVOICE_NO}: sales voucher already booked ({v.voucher_number})")
        return

    usd = _d(ci.total_amount) if _d(ci.total_amount) > 0 else ORDER_VALUE_USD
    rate = _d(ci.exchange_rate_to_base) if _d(ci.exchange_rate_to_base) > 1 else USD_TO_BDT
    bdt = _bdt(usd, rate)
    vdate = ci.invoice_date or D["ex_factory"]
    narration = (f"Being export sales to {ctx.customer.legal_entity_name or ctx.customer.name} under commercial "
                 f"invoice {COMMERCIAL_INVOICE_NO}, {ORDER_QTY:,} pcs, USD {_fmt(usd)} @ {rate} "
                 f"(sales contract {SALES_CONTRACT_REF}) – {ORDER_CODE}")
    lines = [_dr(bdt, books.acc["primark"], f"Receivable CI {COMMERCIAL_INVOICE_NO} USD {_fmt(usd)}"),
             _cr(bdt, books.acc["export_sales"], f"Export sales CI {COMMERCIAL_INVOICE_NO}", books.cost_center_id)]

    if app_draft is not None:
        # The CI "Issue" step created a DRAFT AR journal in USD – the accountant reviews it and posts in BDT.
        await _replace_lines(db, ctx, app_draft, lines)
        app_draft.voucher_date, app_draft.description, app_draft.order_id = vdate, narration, books.order.id
        await _post(db, ctx, books, app_draft)
        await _name_party_bills(db, ctx, app_draft, COMMERCIAL_INVOICE_NO)
        await _log_voucher(db, ctx, app_draft, " (CI draft reviewed + posted)")
        books.booked.append(app_draft)
        return
    v = await _book(db, ctx, books, vtype="JOURNAL", vdate=vdate, reference=COMMERCIAL_INVOICE_NO,
                    narration=narration, lines=lines, source_module=SOURCE_CI, source_ref=str(ci.id),
                    bill_number=COMMERCIAL_INVOICE_NO)
    if (ci.status or "").upper() == "ISSUED":
        ci.ar_voucher_id = v.id
    else:
        ctx.log(f"   note: {COMMERCIAL_INVOICE_NO} status is {ci.status} – voucher not linked as its AR voucher")
    await db.flush()


async def step_other_costs(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    """Inland transport to Chattogram + third-party inspection, paid from Eastern Bank."""
    if (v := await _find_voucher(db, ctx, "PAYMENT", REF_OTHER_COSTS)) is not None:
        ctx.log(f"{REF_OTHER_COSTS}: order expenses already booked ({v.voucher_number})")
        return
    transport, inspection = _bdt(INLAND_TRANSPORT_USD), _bdt(INSPECTION_USD)
    await _book(
        db, ctx, books, vtype="PAYMENT", vdate=D["ex_factory"], reference=REF_OTHER_COSTS,
        narration=f"Being covered-van hire to Chattogram port (USD {INLAND_TRANSPORT_USD}) and final inspection / "
                  f"lab test fees (USD {INSPECTION_USD}) for {ORDER_CODE}",
        lines=[_dr(transport, books.acc["transport"], "Inland transport to Chattogram", books.cost_center_id),
               _dr(inspection, books.acc["inspection"], "Third-party inspection & lab test", books.cost_center_id),
               _cr(transport + inspection, books.acc["bank"], "Paid by EBL cheque")],
        instrument="EBL-CHQ-0042116",
    )


async def step_vendor_payment(db: AsyncSession, ctx: DemoContext, books: Books, vendor_code: str, bill_ref: str,
                              reference: str, cheque: str) -> None:
    """Pay a local supplier ~30 days after the bill, settled bill-wise against its reference."""
    if (v := await _find_voucher(db, ctx, "PAYMENT", reference)) is not None:
        ctx.log(f"{reference}: payment already booked ({v.voucher_number})")
        return
    vendor = await require_one(db, Vendor, tenant_id=ctx.tenant_id, vendor_code=vendor_code)
    liability_acc, amount = await _bill_liability(db, ctx, bill_ref)
    v = await _book(
        db, ctx, books, vtype="PAYMENT", vdate=D["vessel_departure"], reference=reference,
        narration=f"Being payment to {vendor.name} against bill {bill_ref} by Eastern Bank cheque {cheque} – {ORDER_CODE}",
        lines=[_dr(amount, liability_acc, f"Against ref {bill_ref}"), _cr(amount, books.acc["bank"], f"Cheque {cheque}")],
        instrument=cheque,
    )
    await _ensure_settled(db, ctx, books, v, vendor.id, "VENDOR", amount)


async def step_btb_maturity(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    """BTB LC matured: Eastern Bank paid the fabric supplier (Dr supplier / Cr Bank-Financed BTB Settlement)."""
    if (v := await _find_voucher(db, ctx, "PAYMENT", BTB_LC_REF)) is not None:
        ctx.log(f"{BTB_LC_REF}: BTB maturity payment already booked ({v.voucher_number})")
        return
    btb = await require_one(db, BtbLc, tenant_id=ctx.tenant_id, reference=BTB_LC_REF)
    acc_row = await find_one(db, BtbLcAccounting, tenant_id=ctx.tenant_id, btb_lc_id=btb.id)
    if acc_row is not None and acc_row.realization_voucher_id:
        ctx.log(f"{BTB_LC_REF}: SKIPPED – BTB LC realisation already recorded (voucher id {acc_row.realization_voucher_id})")
        return
    vendor = await require_one(db, Vendor, tenant_id=ctx.tenant_id, vendor_code=VENDOR_FABRIC_CODE)
    liability_acc, amount = await _bill_liability(db, ctx, GRN_FABRIC_CODE)
    vdate = btb.maturity_date or D["btb_maturity"]
    v = await _book(
        db, ctx, books, vtype="PAYMENT", vdate=vdate, reference=BTB_LC_REF,
        narration=f"Being BTB LC {BTB_LC_REF} matured – Eastern Bank paid {vendor.name} for {GRN_FABRIC_CODE} "
                  f"(bank-financed until export proceeds of {COMMERCIAL_INVOICE_NO}) – {ORDER_CODE}",
        lines=[_dr(amount, liability_acc, f"Against ref {GRN_FABRIC_CODE}"),
               _cr(amount, books.acc["btb_finance"], f"BTB {BTB_LC_REF} paid by bank at maturity")],
        btb_lc_id=btb.id, instrument=f"BTB {BTB_LC_REF} maturity",
    )
    await _ensure_settled(db, ctx, books, v, vendor.id, "VENDOR", amount)
    tranche = await find_one(db, BtbMaturityTranche, tenant_id=ctx.tenant_id, btb_lc_id=btb.id)
    if tranche is not None and tranche.payment_voucher_id is None:
        tranche.payment_voucher_id, tranche.status = v.id, "PAID"
    if acc_row is not None and acc_row.import_bill_voucher_id:
        acc_row.realization_voucher_id, acc_row.status, btb.status = v.id, "REALIZED", "CLOSED"
    await db.flush()


async def step_export_realisation(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    """Primark paid: Dr Eastern Bank + Bank Charges / Cr Primark (at 122) + Exchange Gain (paid at 122.50)."""
    ci = await require_one(db, CommercialInvoice, tenant_id=ctx.tenant_id, invoice_code=COMMERCIAL_INVOICE_NO)
    allocs = list((await db.execute(select(CommercialInvoiceReceiptAllocation).where(
        CommercialInvoiceReceiptAllocation.tenant_id == ctx.tenant_id,
        CommercialInvoiceReceiptAllocation.commercial_invoice_id == ci.id))).scalars().all())
    app_draft: Voucher | None = None
    for alloc in allocs:
        rv = await db.get(Voucher, alloc.voucher_id)
        if rv is not None and rv.status == "POSTED":
            ctx.log(f"{COMMERCIAL_INVOICE_NO}: realisation already posted ({rv.voucher_number})")
            return
        if rv is not None and rv.status not in DEAD_STATUSES:
            app_draft = rv
    if app_draft is None and (v := await _find_voucher(db, ctx, "RECEIPT", COMMERCIAL_INVOICE_NO)) is not None:
        ctx.log(f"{COMMERCIAL_INVOICE_NO}: realisation already booked ({v.voucher_number})")
        return

    # Receivable to clear = what the sales voucher debited (ledger + BDT amount at the invoice rate).
    sales_v = await db.get(Voucher, ci.ar_voucher_id) if ci.ar_voucher_id else None
    if sales_v is None or sales_v.status != "POSTED":
        sales_v = await _find_voucher(db, ctx, "JOURNAL", COMMERCIAL_INVOICE_NO)
    if sales_v is None or sales_v.status != "POSTED":
        raise RuntimeError(f"Prerequisite missing: posted sales voucher for {COMMERCIAL_INVOICE_NO}")
    ar_line = next(ln for ln in await _voucher_lines(db, sales_v.id) if ln.entry_type == "DEBIT")
    receivable_acc, receivable_bdt = ar_line.account_id, _d(ar_line.amount)

    usd = _d(ci.total_amount) if _d(ci.total_amount) > 0 else ORDER_VALUE_USD
    gross_bdt = _bdt(usd, REALISATION_RATE)
    charges_bdt = _bdt(BANK_CHARGES_USD, REALISATION_RATE)
    net_bdt = gross_bdt - charges_bdt
    fx = gross_bdt - receivable_bdt
    vdate = D["payment_received"]
    narration = (f"Being export proceeds of {COMMERCIAL_INVOICE_NO} received from Primark Limited by T/T: "
                 f"USD {_fmt(usd)} @ {REALISATION_RATE} less bank charges USD {BANK_CHARGES_USD} "
                 f"(booked @ {USD_TO_BDT}, exchange gain BDT {_fmt(fx)}) – {ORDER_CODE}")
    lines = [_dr(net_bdt, books.acc["bank"], f"T/T credit USD {_fmt(usd - BANK_CHARGES_USD)}"),
             _dr(charges_bdt, books.acc["bank_charges"], "Foreign + local bank charges", books.cost_center_id),
             _cr(receivable_bdt, receivable_acc, f"Against ref {COMMERCIAL_INVOICE_NO}")]
    if fx > 0:
        lines.append(_cr(fx, books.acc["fx_gain"], "Realisation rate 122.50 vs invoice rate", books.cost_center_id))
    elif fx < 0:
        lines.append(_dr(-fx, books.acc["fx_gain"], "Realisation rate below invoice rate", books.cost_center_id))

    if app_draft is None and (ci.status or "").upper() == "ISSUED":
        # Same service as Commercial → Invoice → "Record payment": allocation row + DRAFT receipt voucher.
        from app.modules.commercial.commercial_invoice_service import create_receipt_from_commercial_invoice

        _alloc, app_draft, _out, _new = await create_receipt_from_commercial_invoice(
            db, tenant_id=ctx.tenant_id, user_id=books.user.id, invoice=ci, amount=usd, receipt_date=vdate,
            bank_ledger_id=books.acc["bank"], receivable_ledger_id=receivable_acc, currency="USD",
            exchange_rate_to_base=REALISATION_RATE, idempotency_key=CI_RECEIPT_KEY,
        )
    if app_draft is None:
        v = await _book(db, ctx, books, vtype="RECEIPT", vdate=vdate, reference=COMMERCIAL_INVOICE_NO,
                        narration=narration, lines=lines, instrument="EBL-TT-IN-231026")
        await _ensure_settled(db, ctx, books, v, ctx.customer.id, "CUSTOMER", receivable_bdt)
    else:
        await _replace_lines(db, ctx, app_draft, lines)
        app_draft.voucher_date, app_draft.description, app_draft.order_id = vdate, narration, books.order.id
        app_draft.instrument_reference = "EBL-TT-IN-231026"
        await record_voucher_event(db, tenant_id=ctx.tenant_id, user_id=books.user.id, voucher_id=app_draft.id,
                                   event="created", to_status="DRAFT", summary=f"Receipt {app_draft.voucher_number}")
        await _post(db, ctx, books, app_draft, party_hook_by_account=True)
        await _ensure_settled(db, ctx, books, app_draft, ctx.customer.id, "CUSTOMER", receivable_bdt)
        await _log_voucher(db, ctx, app_draft, " (linked to CI payment)")
        books.booked.append(app_draft)
    if books.order.payment_received_at is None:  # keep the historical date (the refresh would stamp "now")
        books.order.payment_received_at = datetime.combine(vdate, datetime.min.time()).replace(hour=15)
    try:
        from app.modules.orders.pipeline_service import auto_advance_order_pipeline

        async with db.begin_nested():
            stage = await auto_advance_order_pipeline(db, tenant_id=ctx.tenant_id, order_id=books.order.id)
        ctx.log(f"   order pipeline after realisation: {stage}")
    except Exception as exc:
        ctx.log(f"   (order pipeline refresh skipped: {exc})")


async def step_proceeds_distribution(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    """Bank adjusts proceeds: repays BTB finance + packing credit with interest from the CD account."""
    if (v := await _find_voucher(db, ctx, "PAYMENT", REF_DISTRIBUTION)) is not None:
        ctx.log(f"{REF_DISTRIBUTION}: proceeds distribution already booked ({v.voucher_number})")
        return
    receipt = await _find_voucher(db, ctx, "RECEIPT", COMMERCIAL_INVOICE_NO)
    if receipt is None or receipt.status != "POSTED":
        raise RuntimeError(f"Prerequisite missing: posted realisation of {COMMERCIAL_INVOICE_NO}")
    lines: list[AutoPostingLine] = []
    btb_v = await _find_voucher(db, ctx, "PAYMENT", BTB_LC_REF)
    if btb_v is not None:
        btb_amt = sum((_d(ln.amount) for ln in await _voucher_lines(db, btb_v.id)
                       if ln.entry_type == "CREDIT" and ln.account_id == books.acc["btb_finance"]), ZERO)
        if btb_amt > 0:
            lines.append(_dr(btb_amt, books.acc["btb_finance"], f"Adjust BTB {BTB_LC_REF} finance"))
    pc_v = await _find_voucher(db, ctx, "RECEIPT", REF_PC_LOAN)
    days = (D["payment_received"] - PC_LOAN_DATE).days
    interest = (PC_LOAN_BDT * PC_INTEREST_RATE * days / 365).quantize(TWO)
    if pc_v is not None:
        lines.append(_dr(PC_LOAN_BDT, books.acc["pc_loan"], f"Repay packing credit {REF_PC_LOAN}"))
        lines.append(_dr(interest, books.acc["interest"], f"PC interest {days} days @ {PC_INTEREST_RATE * 100:.0f}%",
                         books.cost_center_id))
    if not lines:
        raise RuntimeError("Nothing to distribute (no BTB finance or packing-credit vouchers)")
    total = sum((ln.amount for ln in lines), ZERO)
    await _book(
        db, ctx, books, vtype="PAYMENT", vdate=D["payment_received"], reference=REF_DISTRIBUTION,
        narration=f"Being export proceeds of {COMMERCIAL_INVOICE_NO} distributed by Eastern Bank: BTB LC {BTB_LC_REF} "
                  f"finance and packing credit {REF_PC_LOAN} with {days} days interest – {ORDER_CODE}",
        lines=lines + [_cr(total, books.acc["bank"], "Debited by bank – proceeds distribution")],
        instrument="EBL-PRD-231026",
    )


# ---------------------------------------------------------------------------
# Order profit (income − expense lines carrying the order cost centre)
# ---------------------------------------------------------------------------
async def _report_order_profit(db: AsyncSession, ctx: DemoContext, books: Books) -> None:
    rows = (
        await db.execute(
            select(AccountGroup.nature, ChartOfAccount.name, VoucherLine.entry_type, func.sum(VoucherLine.amount))
            .join(Voucher, Voucher.id == VoucherLine.voucher_id)
            .join(ChartOfAccount, ChartOfAccount.id == VoucherLine.account_id)
            .join(AccountGroup, AccountGroup.id == ChartOfAccount.group_id)
            .where(VoucherLine.tenant_id == ctx.tenant_id, VoucherLine.cost_center_id == books.cost_center_id,
                   Voucher.status == "POSTED")
            .group_by(AccountGroup.nature, ChartOfAccount.name, VoucherLine.entry_type)
        )
    ).all()
    per_ledger: dict[tuple[str, str], Decimal] = {}
    for nature, name, entry, amount in rows:
        sign = 1 if (entry == "CREDIT") == (nature == "Income") else -1
        per_ledger[(nature, name)] = per_ledger.get((nature, name), ZERO) + sign * _d(amount)
    income = sum((v for (n, _), v in per_ledger.items() if n == "Income"), ZERO)
    expense = sum((v for (n, _), v in per_ledger.items() if n == "Expense"), ZERO)
    profit = income - expense
    ctx.log(f"Order P&L by cost centre {COST_CENTER_CODE} (BDT):")
    for (nature, name), value in sorted(per_ledger.items(), key=lambda kv: (kv[0][0] != "Income", kv[0][1])):
        ctx.log(f"   {nature:<7} {name:<45} {_fmt(value):>15}")
    margin = (profit / income * 100).quantize(TWO) if income else ZERO
    ctx.log(f"   Income {_fmt(income)} − Expenses {_fmt(expense)} = PROFIT BDT {_fmt(profit)} "
            f"(≈ USD {_fmt((profit / USD_TO_BDT).quantize(TWO))}, {margin}% of income)")


# ---------------------------------------------------------------------------
# Stage entry point
# ---------------------------------------------------------------------------
async def run(db: AsyncSession, ctx: DemoContext) -> None:
    books = await _prepare(db, ctx)

    steps: list[tuple[str, Callable[[], Awaitable[None]]]] = []
    for grn_code, po_code, vendor_code, days, fallback in PURCHASES:
        steps.append((f"Purchase bill {grn_code}",
                      lambda g=grn_code, p=po_code, v=vendor_code, d=days, f=fallback:
                      step_purchase_bill(db, ctx, books, g, p, v, d, f)))
    steps += [
        ("Material consumption", lambda: step_material_consumption(db, ctx, books)),
        ("Packing-credit loan", lambda: step_pc_loan(db, ctx, books)),
        ("Job-work bill", lambda: step_jobwork_bill(db, ctx, books)),
        ("Job-work extras", lambda: step_jobwork_addons(db, ctx, books)),
        ("CM labour", lambda: step_cm_absorption(db, ctx, books)),
        ("Export sales invoice", lambda: step_export_sales(db, ctx, books)),
        ("COGS cost-centre allocation", lambda: step_cogs_cost_centre(db, ctx, books)),
        ("Order expenses", lambda: step_other_costs(db, ctx, books)),
    ]
    for vendor_code, bill_ref, reference, cheque in LOCAL_PAYMENTS:
        steps.append((f"Payment {reference}",
                      lambda v=vendor_code, b=bill_ref, r=reference, c=cheque:
                      step_vendor_payment(db, ctx, books, v, b, r, c)))
    steps += [
        ("BTB LC maturity", lambda: step_btb_maturity(db, ctx, books)),
        ("Export realisation", lambda: step_export_realisation(db, ctx, books)),
        ("Proceeds distribution", lambda: step_proceeds_distribution(db, ctx, books)),
    ]

    failed: list[str] = []
    for title, step in steps:
        try:
            async with db.begin_nested():  # one savepoint per voucher
                await step()
        except Exception as exc:
            detail = getattr(exc, "detail", None) or str(exc) or type(exc).__name__
            failed.append(title)
            ctx.log(f"SKIPPED {title}: {detail}")

    await _report_order_profit(db, ctx, books)
    ctx.log(f"Vouchers posted this run: {len(books.booked)}; skipped/failed steps: {len(failed)}"
            + (f" ({', '.join(failed)})" if failed else ""))
