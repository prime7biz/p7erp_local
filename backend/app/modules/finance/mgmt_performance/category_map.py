"""Ledger account -> management category. An account mapping beats a group mapping; a child group beats its parent.

Only expense-nature accounts (account group nature "expense") are in the management expense universe.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import AccountGroup, ChartOfAccount
from app.models.mgmt_performance import MgmtExpenseCategoryMap

MAX_GROUP_DEPTH = 32


@dataclass
class AccountInfo:
    id: int
    number: str | None
    name: str
    group_id: int | None


@dataclass
class CategoryResolver:
    account_map: dict[int, str] = field(default_factory=dict)
    group_map: dict[int, str] = field(default_factory=dict)
    group_parent: dict[int, int | None] = field(default_factory=dict)
    group_names: dict[int, str] = field(default_factory=dict)
    expense_accounts: dict[int, AccountInfo] = field(default_factory=dict)

    def category_for(self, account_id: int | None) -> str | None:
        if account_id is None:
            return None
        if account_id in self.account_map:
            return self.account_map[account_id]
        info = self.expense_accounts.get(account_id)
        gid = info.group_id if info is not None else None
        seen: set[int] = set()
        while gid is not None and gid not in seen and len(seen) < MAX_GROUP_DEPTH:
            if gid in self.group_map:
                return self.group_map[gid]
            seen.add(gid)
            gid = self.group_parent.get(gid)
        return None

    def account_label(self, account_id: int | None) -> str:
        info = self.expense_accounts.get(account_id) if account_id is not None else None
        if info is None:
            return f"Account #{account_id}" if account_id is not None else "(No account)"
        return f"{info.number} - {info.name}" if info.number else info.name


async def load_resolver(db: AsyncSession, tenant_id: int) -> CategoryResolver:
    r = CategoryResolver()
    for account_id, group_id, category in (
        await db.execute(
            select(MgmtExpenseCategoryMap.account_id, MgmtExpenseCategoryMap.account_group_id, MgmtExpenseCategoryMap.category)
            .where(MgmtExpenseCategoryMap.tenant_id == tenant_id)
        )
    ).all():
        if account_id is not None:
            r.account_map[int(account_id)] = category
        elif group_id is not None:
            r.group_map[int(group_id)] = category
    for gid, parent, name in (
        await db.execute(
            select(AccountGroup.id, AccountGroup.parent_group_id, AccountGroup.name).where(AccountGroup.tenant_id == tenant_id)
        )
    ).all():
        r.group_parent[int(gid)] = int(parent) if parent is not None else None
        r.group_names[int(gid)] = name
    for aid, number, name, gid in (
        await db.execute(
            select(ChartOfAccount.id, ChartOfAccount.account_number, ChartOfAccount.name, ChartOfAccount.group_id)
            .join(AccountGroup, (AccountGroup.id == ChartOfAccount.group_id) & (AccountGroup.tenant_id == tenant_id))
            .where(ChartOfAccount.tenant_id == tenant_id, func.lower(func.coalesce(AccountGroup.nature, "")) == "expense")
        )
    ).all():
        r.expense_accounts[int(aid)] = AccountInfo(int(aid), number, name, int(gid) if gid is not None else None)
    return r
