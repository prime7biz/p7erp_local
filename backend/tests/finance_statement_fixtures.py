"""Seeds for the finance statements tests (docs/finance-modernization/PLAN.md Phase 2).

`seed_world` builds one tenant with classified account groups, ledgers and vouchers whose expected statement
figures are worked out by hand in the test module (never by calling the service under test).

Run in Docker: docker compose exec -T backend pytest tests/test_finance_statements_core.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from app.models.finance import AccountGroup, ChartOfAccount, Voucher, VoucherLine
from tests.benchmark_fixtures import seed_tenant_admin

D = Decimal

STATEMENTS_FLAG = {"finance_statements_v2": True}


async def make_group(
    db, tenant_id: int, name: str, nature: str, cls: str | None = None, parent: AccountGroup | None = None
) -> AccountGroup:
    slug = uuid.uuid4().hex[:8]
    group = AccountGroup(
        tenant_id=tenant_id,
        name=name,
        code=f"G{slug}",
        parent_group_id=parent.id if parent else None,
        nature=nature,
        default_normal_balance="credit" if nature in ("Liability", "Equity", "Income") else "debit",
        statement_class=cls,
    )
    db.add(group)
    await db.flush()
    return group


async def make_ledger(
    db, tenant_id: int, group: AccountGroup, name: str, opening: str = "0", normal: str | None = None
) -> ChartOfAccount:
    slug = uuid.uuid4().hex[:8]
    acct = ChartOfAccount(
        tenant_id=tenant_id,
        account_number=f"A{slug}",
        name=name,
        group_id=group.id,
        normal_balance=normal or group.default_normal_balance,
        opening_balance=D(opening),
        balance=D("0"),
        is_active=True,
    )
    db.add(acct)
    await db.flush()
    return acct


async def post(
    db,
    tenant_id: int,
    vdate: date,
    lines: list[tuple],
    *,
    status: str = "POSTED",
    vtype: str = "JOURNAL",
    **flags,
) -> Voucher:
    """lines: (account, 'DEBIT'|'CREDIT', amount[, base_amount])."""
    voucher = Voucher(
        tenant_id=tenant_id,
        voucher_number=f"T-{uuid.uuid4().hex[:10]}",
        voucher_type=vtype,
        voucher_date=vdate,
        status=status,
        **flags,
    )
    db.add(voucher)
    await db.flush()
    for line in lines:
        account, entry, amount = line[0], line[1], D(line[2])
        base = D(line[3]) if len(line) > 3 else amount
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=voucher.id,
                account_id=account.id,
                entry_type=entry,
                amount=amount,
                base_amount=base,
            )
        )
    await db.flush()
    return voucher


async def seed_world(db, *, flags: dict | None = None, role_name: str = "admin", permissions: dict | None = None):
    """Tenant + user + the standard chart and vouchers. Returns (tenant, user, w) with w = SimpleNamespace-like dict."""
    tenant, user = await seed_tenant_admin(db, role_name=role_name, permissions=permissions)
    tenant.feature_flags = {**STATEMENTS_FLAG, **(flags or {})}
    await db.flush()
    t = tenant.id
    w: dict = {}

    capital_g = await make_group(db, t, "Capital Account", "Equity", "CAPITAL_ACCOUNT")
    ca_g = await make_group(db, t, "Current Assets", "Asset", "CURRENT_ASSETS")
    cash_g = await make_group(db, t, "Cash", "Asset", "CASH_IN_HAND", ca_g)
    stock_g = await make_group(db, t, "Stock", "Asset", "STOCK_IN_HAND", ca_g)
    debtors_g = await make_group(db, t, "Debtors", "Asset", None, ca_g)  # inherits CURRENT_ASSETS
    cl_g = await make_group(db, t, "Creditors", "Liability", "SUNDRY_CREDITORS")
    sales_g = await make_group(db, t, "Sales", "Income", "SALES_ACCOUNTS")
    cogs_g = await make_group(db, t, "Consumption", "Expense", "COGS")
    dexp_g = await make_group(db, t, "Direct Exp", "Expense", "DIRECT_EXPENSES")
    iexp_g = await make_group(db, t, "Indirect Exp", "Expense", "INDIRECT_EXPENSES")
    iinc_g = await make_group(db, t, "Indirect Inc", "Income", "INDIRECT_INCOMES")
    misc_asset_g = await make_group(db, t, "Misc Asset", "Asset", None)  # Unclassified
    misc_exp_g = await make_group(db, t, "Misc Expense", "Expense", None)  # Unclassified
    w["groups"] = dict(
        capital=capital_g, ca=ca_g, cash=cash_g, stock=stock_g, debtors=debtors_g, cl=cl_g, sales=sales_g,
        cogs=cogs_g, dexp=dexp_g, iexp=iexp_g, iinc=iinc_g, misc_asset=misc_asset_g, misc_exp=misc_exp_g,
    )

    capital = await make_ledger(db, t, capital_g, "Paid Up Capital", "100000")
    cash = await make_ledger(db, t, cash_g, "Cash in Hand", "60000")
    inventory = await make_ledger(db, t, stock_g, "Inventory", "40000")
    ar = await make_ledger(db, t, debtors_g, "Trade Receivable")
    ap = await make_ledger(db, t, cl_g, "Trade Payable")
    sales = await make_ledger(db, t, sales_g, "Sales")
    cogs = await make_ledger(db, t, cogs_g, "COGS")
    wages = await make_ledger(db, t, dexp_g, "Wages")
    rent = await make_ledger(db, t, iexp_g, "Rent")
    interest = await make_ledger(db, t, iinc_g, "Interest Income")
    misc_asset = await make_ledger(db, t, misc_asset_g, "Misc Asset A/c")
    misc_exp = await make_ledger(db, t, misc_exp_g, "Misc Expense A/c")
    w["ledgers"] = dict(
        capital=capital, cash=cash, inventory=inventory, ar=ar, ap=ap, sales=sales, cogs=cogs, wages=wages,
        rent=rent, interest=interest, misc_asset=misc_asset, misc_exp=misc_exp,
    )

    # Earlier year (2025): sale 50,000 and wages 20,000 -> profit 30,000 carried forward.
    await post(db, t, date(2025, 6, 1), [(cash, "DEBIT", "50000"), (sales, "CREDIT", "50000")])
    await post(db, t, date(2025, 9, 1), [(wages, "DEBIT", "20000"), (cash, "CREDIT", "20000")])
    # 2026
    await post(db, t, date(2026, 2, 10), [(ar, "DEBIT", "30000"), (sales, "CREDIT", "30000")])
    await post(db, t, date(2026, 3, 5), [(inventory, "DEBIT", "20000"), (ap, "CREDIT", "20000")])  # GRN
    await post(db, t, date(2026, 4, 10), [(cogs, "DEBIT", "12000"), (inventory, "CREDIT", "12000")])  # COGS
    await post(db, t, date(2026, 5, 2), [(rent, "DEBIT", "3000"), (cash, "CREDIT", "3000")])
    await post(db, t, date(2026, 6, 1), [(cash, "DEBIT", "1000"), (interest, "CREDIT", "1000")])
    await post(db, t, date(2026, 6, 15), [(wages, "DEBIT", "5000"), (cash, "CREDIT", "5000")])
    await post(
        db, t, date(2026, 6, 20),
        [(misc_exp, "DEBIT", "700"), (misc_asset, "DEBIT", "400"), (cash, "CREDIT", "1100")],
    )
    # Foreign currency: 100 USD at 110 -> base 11,000 is what the statements must use.
    await post(
        db, t, date(2026, 7, 1),
        [(ar, "DEBIT", "100", "11000"), (sales, "CREDIT", "100", "11000")],
    )
    # Reversed voucher + its reversal: net zero, and the original must still count.
    original = await post(
        db, t, date(2026, 8, 1), [(cash, "DEBIT", "777"), (sales, "CREDIT", "777")], status="REVERSED"
    )
    reversal = await post(
        db, t, date(2026, 8, 2), [(sales, "DEBIT", "777"), (cash, "CREDIT", "777")], reverses_voucher_id=original.id
    )
    original.reversed_by_voucher_id = reversal.id
    await db.flush()
    # Never counted: draft, cancelled, reversed-without-reversal, memorandum, optional, post-dated.
    big = [(cash, "DEBIT", "99999"), (sales, "CREDIT", "99999")]
    await post(db, t, date(2026, 9, 1), big, status="DRAFT")
    await post(db, t, date(2026, 9, 2), big, status="CANCELLED")
    await post(db, t, date(2026, 9, 3), big, status="REVERSED")
    await post(db, t, date(2026, 9, 4), big, vtype="MEMORANDUM", is_memorandum=True)
    await post(db, t, date(2026, 9, 5), big, vtype="OPTIONAL", is_optional=True, include_in_books=False)
    await post(db, t, date(2026, 9, 6), big, is_post_dated=True)
    return tenant, user, w


async def seed_noise_tenant(db):
    """A second tenant with huge postings; nothing here may ever reach the first tenant's statements."""
    tenant, user, w = await seed_world(db)
    cash, sales = w["ledgers"]["cash"], w["ledgers"]["sales"]
    await post(db, tenant.id, date(2026, 3, 1), [(cash, "DEBIT", "5000000"), (sales, "CREDIT", "5000000")])
    return tenant, user, w
