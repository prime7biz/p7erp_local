"""Shared seeds for Finance > Management Performance tests (built inside the test transaction only).

Run: docker compose exec -T backend sh -c "pytest tests/test_mgmt_performance_*.py -q -p no:warnings"
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from app.models import Budget, BudgetLine
from app.models.finance import CostCenter
from app.models.mgmt_performance import MgmtCategoryThreshold, MgmtExpenseCategoryMap, MgmtMonthlyTarget
from tests.mfg_alloc_fixtures import add_user_with_role
from tests.mfg_finance_fixtures import add_account, add_voucher
from tests.mfg_intel_fixtures import client_for, new_tenant

FLAG = "mgmt_performance_v1"
API = "/api/v1/finance/mgmt-performance"
VIEW = {"finance.mgmt_performance.view": True}
TODAY = date(2030, 3, 16)  # 15 days of March 2030 are left after today (31-day month)


async def mp_tenant(db, *, flags: dict | None = None, permissions: dict | None = None):
    """Tenant + a plain user (role 'merch_tester', no money key unless given)."""
    tenant, user, role = await new_tenant(db, flags={FLAG: True} if flags is None else flags, permissions=permissions or {})
    tenant.base_currency = "BDT"
    await db.flush()
    return tenant, user, role


async def add_manager(db, tenant):
    return await add_user_with_role(db, tenant, "manager", permissions={})


async def add_user(db, tenant, permissions: dict):
    return await add_user_with_role(db, tenant, f"staff{uuid.uuid4().hex[:4]}", permissions=permissions)


async def expense_account(db, tenant, category: str | None = None, *, by_group: bool = True):
    acct = await add_account(db, tenant, statement_class="INDIRECT_EXPENSES")
    if category is not None:
        if by_group:
            db.add(MgmtExpenseCategoryMap(tenant_id=tenant.id, account_group_id=acct.group_id, category=category))
        else:
            db.add(MgmtExpenseCategoryMap(tenant_id=tenant.id, account_id=acct.id, category=category))
        await db.flush()
    return acct


async def cash_account(db, tenant):
    return await add_account(db, tenant, statement_class="CASH_IN_HAND", nature="Asset")


async def cost_center(db, tenant, *, owner=None) -> CostCenter:
    slug = uuid.uuid4().hex[:6]
    cc = CostCenter(tenant_id=tenant.id, center_code=f"CC{slug}", name=f"Dept {slug}", department="Dept",
                    is_active=True, owner_user_id=owner.id if owner is not None else None)
    db.add(cc)
    await db.flush()
    return cc


async def budget(db, tenant, lines: list[tuple], *, fiscal_year="2030", status="FINAL") -> tuple[Budget, list[BudgetLine]]:
    """lines: (cost centre or None, account or None, period_month, amount)."""
    b = Budget(tenant_id=tenant.id, budget_name=f"B-{uuid.uuid4().hex[:6]}", fiscal_year=fiscal_year, status=status)
    db.add(b)
    await db.flush()
    out = []
    for cc, acct, period, amount in lines:
        ln = BudgetLine(tenant_id=tenant.id, budget_id=b.id, cost_center_id=cc.id if cc else None,
                        account_id=acct.id if acct else None, period_month=period, amount=Decimal(amount))
        db.add(ln)
        out.append(ln)
    await db.flush()
    return b, out


async def spend(db, tenant, expense, cash, vdate: date, amount: str, *, cc=None, status="POSTED"):
    v = await add_voucher(db, tenant, vdate, [(expense, "DEBIT", amount), (cash, "CREDIT", amount)], status=status)
    if cc is not None:
        from sqlalchemy import update

        from app.models.finance import VoucherLine

        await db.execute(
            update(VoucherLine).where(VoucherLine.voucher_id == v.id, VoucherLine.account_id == expense.id).values(cost_center_id=cc.id)
        )
        await db.flush()
    return v


async def threshold(db, tenant, category: str, pct: str) -> None:
    db.add(MgmtCategoryThreshold(tenant_id=tenant.id, category=category, warning_pct=Decimal(pct)))
    await db.flush()


async def target(db, tenant, month: str, profit: str, contingency: str) -> None:
    db.add(MgmtMonthlyTarget(tenant_id=tenant.id, period_month=month, target_profit_amount=Decimal(profit),
                             contingency_pct=Decimal(contingency)))
    await db.flush()


__all__ = [
    "API", "FLAG", "TODAY", "VIEW", "add_manager", "add_user", "budget", "cash_account", "client_for", "cost_center",
    "expense_account", "mp_tenant", "spend", "target", "threshold",
]
