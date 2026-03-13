"""
Finance parity seed (idempotent) for P7 ERP.

Run from backend dir:
  python scripts/seed_finance_demo.py
"""

from __future__ import annotations

import asyncio
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import (
    AccountGroup,
    AccountingPeriod,
    BankAccount,
    BankReconciliation,
    BankStatementLine,
    BankStatementMatchLog,
    Budget,
    BudgetLine,
    ChartOfAccount,
    CostCenter,
    Currency,
    CurrencyExchangeRate,
    OutstandingBill,
    PaymentRun,
    PaymentRunItem,
    Tenant,
    User,
    Voucher,
    VoucherLine,
    VoucherType,
)


def _to_float(value: str | None) -> float:
    try:
        return float(value or "0")
    except (TypeError, ValueError):
        return 0.0


async def _get_tenant(db: AsyncSession) -> Tenant:
    by_code = (
        await db.execute(
            select(Tenant).where(Tenant.company_code.is_not(None)).order_by(Tenant.id.asc())
        )
    ).scalars().all()
    for tenant in by_code:
        code = (tenant.company_code or "").upper()
        if "LAKHSMA" in code:
            return tenant
    first = (await db.execute(select(Tenant).order_by(Tenant.id.asc()))).scalars().first()
    if not first:
        raise RuntimeError("No tenant found. Run scripts/seed_lakhsma.py first.")
    return first


async def _get_seed_user_id(db: AsyncSession, tenant_id: int) -> int | None:
    user = (
        await db.execute(
            select(User)
            .where(User.tenant_id == tenant_id)
            .order_by(User.id.asc())
        )
    ).scalars().first()
    return user.id if user else None


async def _upsert_voucher_type(
    db: AsyncSession, tenant_id: int, code: str, name: str, is_system: bool = True
) -> VoucherType:
    code = code.upper()
    row = (
        await db.execute(
            select(VoucherType).where(
                VoucherType.tenant_id == tenant_id,
                VoucherType.code == code,
            )
        )
    ).scalars().first()
    if row:
        row.name = name
        row.is_active = True
        row.is_system = is_system
        return row
    row = VoucherType(
        tenant_id=tenant_id,
        code=code,
        name=name,
        is_active=True,
        is_system=is_system,
    )
    db.add(row)
    await db.flush()
    return row


async def _upsert_account_group(
    db: AsyncSession,
    tenant_id: int,
    code: str,
    name: str,
    nature: str,
    is_bank_group: bool = False,
    sort_order: int = 0,
) -> AccountGroup:
    row = (
        await db.execute(
            select(AccountGroup).where(
                AccountGroup.tenant_id == tenant_id,
                AccountGroup.code == code,
            )
        )
    ).scalars().first()
    if row:
        row.name = name
        row.nature = nature
        row.is_bank_group = is_bank_group
        row.sort_order = sort_order
        row.is_active = True
        return row
    row = AccountGroup(
        tenant_id=tenant_id,
        code=code,
        name=name,
        nature=nature,
        parent_group_id=None,
        affects_gross_profit=False,
        is_bank_group=is_bank_group,
        sort_order=sort_order,
        is_active=True,
    )
    db.add(row)
    await db.flush()
    return row


async def _upsert_coa(
    db: AsyncSession,
    tenant_id: int,
    account_number: str,
    name: str,
    group_id: int,
    normal_balance: str,
    opening_balance: str = "0",
    account_currency: str | None = "BDT",
    is_bank_account: bool = False,
) -> ChartOfAccount:
    row = (
        await db.execute(
            select(ChartOfAccount).where(
                ChartOfAccount.tenant_id == tenant_id,
                ChartOfAccount.account_number == account_number,
            )
        )
    ).scalars().first()
    if row:
        row.name = name
        row.group_id = group_id
        row.normal_balance = normal_balance
        row.opening_balance = opening_balance
        row.account_currency = account_currency
        row.maintain_fc_balance = bool(account_currency)
        row.is_bank_account = is_bank_account
        row.is_active = True
        return row
    row = ChartOfAccount(
        tenant_id=tenant_id,
        account_number=account_number,
        name=name,
        group_id=group_id,
        normal_balance=normal_balance,
        opening_balance=opening_balance,
        balance=opening_balance,
        account_currency=account_currency,
        maintain_fc_balance=bool(account_currency),
        is_bank_account=is_bank_account,
        is_active=True,
    )
    db.add(row)
    await db.flush()
    return row


async def _upsert_currency(db: AsyncSession, code: str, name: str) -> Currency:
    row = (await db.execute(select(Currency).where(Currency.code == code))).scalars().first()
    if row:
        row.name = name
        row.is_active = True
        return row
    row = Currency(code=code, name=name, is_active=True)
    db.add(row)
    await db.flush()
    return row


async def _upsert_exchange_rate(
    db: AsyncSession,
    tenant_id: int,
    from_currency: str,
    to_currency: str,
    rate: str,
    effective_date: date,
) -> CurrencyExchangeRate:
    row = (
        await db.execute(
            select(CurrencyExchangeRate).where(
                CurrencyExchangeRate.tenant_id == tenant_id,
                CurrencyExchangeRate.from_currency == from_currency,
                CurrencyExchangeRate.to_currency == to_currency,
                CurrencyExchangeRate.effective_date == effective_date,
            )
        )
    ).scalars().first()
    if row:
        row.exchange_rate = rate
        row.is_active = True
        row.source = "seed"
        return row
    row = CurrencyExchangeRate(
        tenant_id=tenant_id,
        from_currency=from_currency,
        to_currency=to_currency,
        exchange_rate=rate,
        effective_date=effective_date,
        source="seed",
        is_active=True,
    )
    db.add(row)
    await db.flush()
    return row


async def _upsert_voucher(
    db: AsyncSession,
    tenant_id: int,
    voucher_number: str,
    voucher_type: str,
    voucher_date: date,
    status: str,
    created_by: int | None,
    description: str,
    reference: str,
) -> Voucher:
    row = (
        await db.execute(
            select(Voucher).where(
                Voucher.tenant_id == tenant_id,
                Voucher.voucher_number == voucher_number,
            )
        )
    ).scalars().first()
    if row:
        row.voucher_type = voucher_type
        row.voucher_date = voucher_date
        row.status = status
        row.description = description
        row.reference = reference
        return row
    row = Voucher(
        tenant_id=tenant_id,
        voucher_number=voucher_number,
        voucher_type=voucher_type,
        voucher_date=voucher_date,
        status=status,
        description=description,
        reference=reference,
        created_by=created_by,
    )
    db.add(row)
    await db.flush()
    return row


async def _upsert_voucher_line(
    db: AsyncSession,
    tenant_id: int,
    voucher_id: int,
    account_id: int,
    entry_type: str,
    amount: str,
    cost_center_id: int | None = None,
    notes: str | None = None,
) -> VoucherLine:
    row = (
        await db.execute(
            select(VoucherLine).where(
                VoucherLine.tenant_id == tenant_id,
                VoucherLine.voucher_id == voucher_id,
                VoucherLine.account_id == account_id,
                VoucherLine.entry_type == entry_type,
                VoucherLine.notes == notes,
            )
        )
    ).scalars().first()
    if row:
        row.amount = amount
        row.cost_center_id = cost_center_id
        return row
    row = VoucherLine(
        tenant_id=tenant_id,
        voucher_id=voucher_id,
        account_id=account_id,
        cost_center_id=cost_center_id,
        entry_type=entry_type,
        amount=amount,
        notes=notes,
    )
    db.add(row)
    await db.flush()
    return row


async def _recompute_coa_balances(db: AsyncSession, tenant_id: int) -> None:
    accounts = list(
        (await db.execute(select(ChartOfAccount).where(ChartOfAccount.tenant_id == tenant_id))).scalars().all()
    )
    acc_map = {a.id: a for a in accounts}
    for account in accounts:
        account.balance = str(round(_to_float(account.opening_balance), 4))

    posted_vouchers = list(
        (
            await db.execute(
                select(Voucher).where(
                    Voucher.tenant_id == tenant_id,
                    Voucher.status == "POSTED",
                )
            )
        ).scalars().all()
    )
    for voucher in posted_vouchers:
        lines = list(
            (
                await db.execute(
                    select(VoucherLine).where(
                        VoucherLine.tenant_id == tenant_id,
                        VoucherLine.voucher_id == voucher.id,
                    )
                )
            ).scalars().all()
        )
        for line in lines:
            account = acc_map.get(line.account_id)
            if not account:
                continue
            amount = _to_float(line.amount)
            current = _to_float(account.balance)
            if account.normal_balance == "debit":
                current += amount if line.entry_type == "DEBIT" else -amount
            else:
                current += amount if line.entry_type == "CREDIT" else -amount
            account.balance = str(round(current, 4))


async def main() -> None:
    async with AsyncSessionLocal() as db:
        tenant = await _get_tenant(db)
        user_id = await _get_seed_user_id(db, tenant.id)

        # Voucher types
        for code, name in [
            ("PAYMENT", "Payment"),
            ("RECEIPT", "Receipt"),
            ("JOURNAL", "Journal"),
            ("CONTRA", "Contra"),
            ("MJ", "Material Journal"),
        ]:
            await _upsert_voucher_type(db, tenant.id, code, name, is_system=True)

        # Account groups
        ast = await _upsert_account_group(db, tenant.id, "AST", "Current Assets", "Asset", sort_order=1)
        lia = await _upsert_account_group(db, tenant.id, "LIA", "Current Liabilities", "Liability", sort_order=2)
        eqt = await _upsert_account_group(db, tenant.id, "EQT", "Equity", "Equity", sort_order=3)
        inc = await _upsert_account_group(db, tenant.id, "INC", "Sales Income", "Income", sort_order=4)
        exp = await _upsert_account_group(db, tenant.id, "EXP", "Operating Expense", "Expense", sort_order=5)

        # Chart of accounts
        cash = await _upsert_coa(db, tenant.id, "1001", "Cash In Hand", ast.id, "debit", "50000")
        bank_gl = await _upsert_coa(
            db,
            tenant.id,
            "1010",
            "Bank - Main",
            ast.id,
            "debit",
            "250000",
            "BDT",
            is_bank_account=True,
        )
        ap = await _upsert_coa(db, tenant.id, "2001", "Accounts Payable", lia.id, "credit", "0")
        equity = await _upsert_coa(db, tenant.id, "3001", "Owner Equity", eqt.id, "credit", "0")
        sales = await _upsert_coa(db, tenant.id, "4001", "Sales Revenue", inc.id, "credit", "0")
        office_exp = await _upsert_coa(db, tenant.id, "5001", "Office Expense", exp.id, "debit", "0")

        # Currency + exchange rates
        await _upsert_currency(db, "BDT", "Bangladeshi Taka")
        await _upsert_currency(db, "USD", "US Dollar")
        await _upsert_currency(db, "EUR", "Euro")
        rate_day = date(2026, 1, 1)
        await _upsert_exchange_rate(db, tenant.id, "USD", "BDT", "118.50", rate_day)
        await _upsert_exchange_rate(db, tenant.id, "EUR", "BDT", "128.20", rate_day)
        await _upsert_exchange_rate(db, tenant.id, "BDT", "USD", "0.00844", rate_day)
        await _upsert_exchange_rate(db, tenant.id, "BDT", "EUR", "0.00780", rate_day)

        # Cost centers
        cc_admin = (
            await db.execute(
                select(CostCenter).where(CostCenter.tenant_id == tenant.id, CostCenter.center_code == "ADM")
            )
        ).scalars().first()
        if not cc_admin:
            cc_admin = CostCenter(tenant_id=tenant.id, center_code="ADM", name="Admin", department="Administration")
            db.add(cc_admin)
            await db.flush()
        cc_prod = (
            await db.execute(
                select(CostCenter).where(CostCenter.tenant_id == tenant.id, CostCenter.center_code == "PRD")
            )
        ).scalars().first()
        if not cc_prod:
            cc_prod = CostCenter(tenant_id=tenant.id, center_code="PRD", name="Production", department="Operations")
            db.add(cc_prod)
            await db.flush()

        # Accounting periods
        for name, start_d, end_d in [
            ("FY26-M01", date(2026, 1, 1), date(2026, 1, 31)),
            ("FY26-M02", date(2026, 2, 1), date(2026, 2, 28)),
            ("FY26-M03", date(2026, 3, 1), date(2026, 3, 31)),
        ]:
            row = (
                await db.execute(
                    select(AccountingPeriod).where(
                        AccountingPeriod.tenant_id == tenant.id,
                        AccountingPeriod.period_name == name,
                    )
                )
            ).scalars().first()
            if not row:
                db.add(
                    AccountingPeriod(
                        tenant_id=tenant.id,
                        period_name=name,
                        start_date=start_d,
                        end_date=end_d,
                        is_closed=False,
                    )
                )

        # Vouchers + lines
        v1 = await _upsert_voucher(
            db,
            tenant.id,
            "VCH-9001",
            "JOURNAL",
            date(2026, 1, 2),
            "POSTED",
            user_id,
            "Opening owner capital injection",
            "SEED-OPENING",
        )
        await _upsert_voucher_line(db, tenant.id, v1.id, bank_gl.id, "DEBIT", "120000", notes="Seed opening")
        await _upsert_voucher_line(db, tenant.id, v1.id, equity.id, "CREDIT", "120000", notes="Seed opening")

        v2 = await _upsert_voucher(
            db,
            tenant.id,
            "VCH-9002",
            "JOURNAL",
            date(2026, 1, 10),
            "POSTED",
            user_id,
            "Office rent expense booked",
            "SEED-EXP-01",
        )
        await _upsert_voucher_line(
            db, tenant.id, v2.id, office_exp.id, "DEBIT", "18000", cost_center_id=cc_admin.id, notes="Rent Jan"
        )
        await _upsert_voucher_line(db, tenant.id, v2.id, cash.id, "CREDIT", "18000", notes="Rent Jan")

        # Outstanding bills
        bills_data = [
            ("AP-9001", "Sakura Trims Ltd", "PAYABLE", date(2026, 1, 8), date(2026, 2, 7), "32000", "5000", "OPEN"),
            ("AP-9002", "Global Fabrics", "PAYABLE", date(2026, 1, 12), date(2026, 2, 11), "48000", "0", "OPEN"),
            ("AR-9001", "Metro Retail", "RECEIVABLE", date(2026, 1, 15), date(2026, 2, 14), "55000", "10000", "OPEN"),
            ("AR-9002", "Fashion Hub", "RECEIVABLE", date(2026, 1, 20), date(2026, 2, 19), "24000", "24000", "PAID"),
        ]
        bill_map: dict[str, OutstandingBill] = {}
        for bill_no, party, bill_type, bill_date, due_date, amount, paid, status in bills_data:
            row = (
                await db.execute(
                    select(OutstandingBill).where(
                        OutstandingBill.tenant_id == tenant.id,
                        OutstandingBill.bill_no == bill_no,
                    )
                )
            ).scalars().first()
            if not row:
                row = OutstandingBill(
                    tenant_id=tenant.id,
                    bill_no=bill_no,
                    party_name=party,
                    bill_type=bill_type,
                    bill_date=bill_date,
                    due_date=due_date,
                    amount=amount,
                    paid_amount=paid,
                    currency="BDT",
                    status=status,
                    notes="Seed finance parity data",
                )
                db.add(row)
                await db.flush()
            else:
                row.party_name = party
                row.bill_type = bill_type
                row.bill_date = bill_date
                row.due_date = due_date
                row.amount = amount
                row.paid_amount = paid
                row.status = status
            bill_map[bill_no] = row

        # Bank account
        bank = (
            await db.execute(
                select(BankAccount).where(
                    BankAccount.tenant_id == tenant.id,
                    BankAccount.account_number == "0171234567890",
                )
            )
        ).scalars().first()
        if not bank:
            bank = BankAccount(
                tenant_id=tenant.id,
                account_name="Main Collection A/C",
                bank_name="Prime Bank",
                account_number="0171234567890",
                branch_name="Gulshan",
                swift_code="PRBLBDDH",
                routing_number="123456789",
                currency="BDT",
                gl_account_id=bank_gl.id,
                opening_balance="250000",
                current_balance="252000",
                is_active=True,
            )
            db.add(bank)
            await db.flush()
        else:
            bank.gl_account_id = bank_gl.id
            bank.is_active = True

        # Payment run + items
        run = (
            await db.execute(
                select(PaymentRun).where(
                    PaymentRun.tenant_id == tenant.id,
                    PaymentRun.run_code == "PR-9001",
                )
            )
        ).scalars().first()
        if not run:
            run = PaymentRun(
                tenant_id=tenant.id,
                run_code="PR-9001",
                run_date=date(2026, 1, 22),
                bank_account_id=bank.id,
                status="EXECUTED",
                total_amount="22000",
                remarks="Seed payment run",
                created_by=user_id,
            )
            db.add(run)
            await db.flush()
        else:
            run.bank_account_id = bank.id
            run.status = "EXECUTED"
            run.total_amount = "22000"

        for bill_no, amount in [("AP-9001", "12000"), ("AP-9002", "10000")]:
            bill = bill_map[bill_no]
            item = (
                await db.execute(
                    select(PaymentRunItem).where(
                        PaymentRunItem.tenant_id == tenant.id,
                        PaymentRunItem.payment_run_id == run.id,
                        PaymentRunItem.bill_id == bill.id,
                    )
                )
            ).scalars().first()
            if not item:
                item = PaymentRunItem(
                    tenant_id=tenant.id,
                    payment_run_id=run.id,
                    bill_id=bill.id,
                    party_name=bill.party_name,
                    amount=amount,
                    status="PAID",
                    reference=bill.bill_no,
                )
                db.add(item)
            else:
                item.party_name = bill.party_name
                item.amount = amount
                item.status = "PAID"
                item.reference = bill.bill_no

        # Optional executed voucher for payment run
        payment_voucher = await _upsert_voucher(
            db,
            tenant.id,
            "VCH-9003",
            "PAYMENT",
            date(2026, 1, 22),
            "POSTED",
            user_id,
            "Payment run PR-9001 settlement",
            "PR-9001",
        )
        await _upsert_voucher_line(db, tenant.id, payment_voucher.id, ap.id, "DEBIT", "22000", notes="Vendor settlement")
        await _upsert_voucher_line(
            db, tenant.id, payment_voucher.id, bank_gl.id, "CREDIT", "22000", notes="Bank disbursement"
        )
        run.executed_voucher_id = payment_voucher.id

        # Bank reconciliation + lines + logs
        recon = (
            await db.execute(
                select(BankReconciliation).where(
                    BankReconciliation.tenant_id == tenant.id,
                    BankReconciliation.bank_account_id == bank.id,
                    BankReconciliation.statement_date == date(2026, 1, 31),
                )
            )
        ).scalars().first()
        if not recon:
            recon = BankReconciliation(
                tenant_id=tenant.id,
                bank_account_id=bank.id,
                statement_date=date(2026, 1, 31),
                statement_balance="252000",
                book_balance="252000",
                difference_amount="0",
                status="MATCHED",
                notes="Seed month-end reconciliation",
                is_finalized=False,
                created_by=user_id,
            )
            db.add(recon)
            await db.flush()
        else:
            recon.statement_balance = "252000"
            recon.book_balance = "252000"
            recon.difference_amount = "0"
            recon.status = "MATCHED"

        line1 = (
            await db.execute(
                select(BankStatementLine).where(
                    BankStatementLine.tenant_id == tenant.id,
                    BankStatementLine.reconciliation_id == recon.id,
                    BankStatementLine.reference == "PR-9001",
                )
            )
        ).scalars().first()
        if not line1:
            line1 = BankStatementLine(
                tenant_id=tenant.id,
                reconciliation_id=recon.id,
                transaction_date=date(2026, 1, 22),
                description="Vendor payment batch",
                reference="PR-9001",
                debit_amount="22000",
                credit_amount="0",
                running_balance="252000",
                matched_payment_run_id=run.id,
                matched_status="MATCHED",
            )
            db.add(line1)
            await db.flush()
        else:
            line1.matched_payment_run_id = run.id
            line1.matched_status = "MATCHED"

        line2 = (
            await db.execute(
                select(BankStatementLine).where(
                    BankStatementLine.tenant_id == tenant.id,
                    BankStatementLine.reconciliation_id == recon.id,
                    BankStatementLine.reference == "DEP-9001",
                )
            )
        ).scalars().first()
        if not line2:
            line2 = BankStatementLine(
                tenant_id=tenant.id,
                reconciliation_id=recon.id,
                transaction_date=date(2026, 1, 25),
                description="Customer deposit",
                reference="DEP-9001",
                debit_amount="0",
                credit_amount="30000",
                running_balance="282000",
                matched_payment_run_id=None,
                matched_status="UNMATCHED",
            )
            db.add(line2)
            await db.flush()

        match_log = (
            await db.execute(
                select(BankStatementMatchLog).where(
                    BankStatementMatchLog.tenant_id == tenant.id,
                    BankStatementMatchLog.reconciliation_id == recon.id,
                    BankStatementMatchLog.statement_line_id == line1.id,
                    BankStatementMatchLog.action == "MATCH",
                )
            )
        ).scalars().first()
        if not match_log:
            db.add(
                BankStatementMatchLog(
                    tenant_id=tenant.id,
                    reconciliation_id=recon.id,
                    statement_line_id=line1.id,
                    action="MATCH",
                    payment_run_id=run.id,
                    note="Seeded match log",
                    created_by=user_id,
                )
            )

        # Budget + lines
        budget = (
            await db.execute(
                select(Budget).where(
                    Budget.tenant_id == tenant.id,
                    Budget.budget_name == "FY26 Operations Budget",
                    Budget.fiscal_year == "FY2026",
                )
            )
        ).scalars().first()
        if not budget:
            budget = Budget(
                tenant_id=tenant.id,
                budget_name="FY26 Operations Budget",
                fiscal_year="FY2026",
                status="FINAL",
                created_by=user_id,
            )
            db.add(budget)
            await db.flush()
        else:
            budget.status = "FINAL"

        for period_month, amount, cc_id, account_id in [
            ("2026-01", "15000", cc_admin.id, office_exp.id),
            ("2026-02", "17000", cc_admin.id, office_exp.id),
            ("2026-03", "16000", cc_admin.id, office_exp.id),
            ("2026-03", "8000", cc_prod.id, office_exp.id),
        ]:
            line = (
                await db.execute(
                    select(BudgetLine).where(
                        and_(
                            BudgetLine.tenant_id == tenant.id,
                            BudgetLine.budget_id == budget.id,
                            BudgetLine.period_month == period_month,
                            BudgetLine.cost_center_id == cc_id,
                            BudgetLine.account_id == account_id,
                        )
                    )
                )
            ).scalars().first()
            if not line:
                db.add(
                    BudgetLine(
                        tenant_id=tenant.id,
                        budget_id=budget.id,
                        cost_center_id=cc_id,
                        account_id=account_id,
                        period_month=period_month,
                        amount=amount,
                        notes="Seed budget line",
                    )
                )
            else:
                line.amount = amount
                line.notes = "Seed budget line"

        await _recompute_coa_balances(db, tenant.id)
        await db.commit()

        company_code = tenant.company_code or f"TENANT-{tenant.id}"
        print("Finance seed complete.")
        print(f"Tenant: {tenant.name} ({company_code})")
        print("Seeded entities:")
        print("- voucher_types")
        print("- account_groups")
        print("- chart_of_accounts")
        print("- currencies + currency_exchange_rates")
        print("- vouchers + voucher_lines")
        print("- outstanding_bills")
        print("- bank_accounts")
        print("- payment_runs + payment_run_items")
        print("- bank_reconciliations + bank_statement_lines + bank_statement_match_logs")
        print("- cost_centers")
        print("- budgets + budget_lines")
        print("- accounting_periods")


if __name__ == "__main__":
    asyncio.run(main())
