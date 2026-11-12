"""Resolve each account group's effective statement class (PLAN 2A).

Rules: a group's own `statement_class` wins; otherwise the nearest ancestor's applies; if none, the group is
Unclassified (None). `parent_group_id` has no database loop protection, so the walk is capped at
MAX_GROUP_DEPTH and the Python tree walks use a visited set.

Ledger level (deterministic, never by name; `resolve_ledger_class`), applied after the group class:
- a bank ledger (`chart_of_accounts.is_bank_account`, or the GL ledger of one of the tenant's `bank_accounts`) in a
  CURRENT_ASSETS or CASH_IN_HAND class becomes BANK_ACCOUNTS;
- the tenant's system cash ledger (system code / mapping key CASH_IN_HAND) in a CURRENT_ASSETS or BANK_ACCOUNTS
  class becomes CASH_IN_HAND.
Every other class (BANK_OD, loans, ...) and Unclassified are never changed. The two flags are SQL expressions
(`ledger_is_bank_sql` / `ledger_is_cash_sql`) added to the caller's existing ledger query, so no extra statement.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import and_, exists, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import AccountGroup, AccountingSystemMapping, BankAccount, ChartOfAccount
from app.modules.finance.statements.constants import BANK_ACCOUNTS, CASH_IN_HAND, CURRENT_ASSETS, MAX_GROUP_DEPTH

CASH_SYSTEM_CODE = "CASH_IN_HAND"
BANK_LEDGER_CLASSES = frozenset({CURRENT_ASSETS, CASH_IN_HAND})
CASH_LEDGER_CLASSES = frozenset({CURRENT_ASSETS, BANK_ACCOUNTS})


def ledger_is_bank_sql(tenant_id: int):
    """True for a bank ledger: flagged on the ledger, or linked from one of the SAME tenant's bank accounts."""
    linked = exists(
        select(BankAccount.id).where(BankAccount.tenant_id == tenant_id, BankAccount.gl_account_id == ChartOfAccount.id)
    )
    return or_(ChartOfAccount.is_bank_account.is_(True), linked)


def ledger_is_cash_sql(tenant_id: int):
    """True for the tenant's system cash ledger (system code, or the CASH_IN_HAND posting mapping)."""
    mapped = exists(
        select(AccountingSystemMapping.id).where(
            AccountingSystemMapping.tenant_id == tenant_id,
            AccountingSystemMapping.mapping_key == CASH_SYSTEM_CODE,
            AccountingSystemMapping.ledger_id == ChartOfAccount.id,
        )
    )
    return or_(ChartOfAccount.system_code == CASH_SYSTEM_CODE, mapped)


def resolve_ledger_class(group_class: str | None, *, is_bank: bool, is_cash: bool) -> str | None:
    if group_class is None:
        return None
    if is_bank and group_class in BANK_LEDGER_CLASSES:
        return BANK_ACCOUNTS
    if is_cash and group_class in CASH_LEDGER_CLASSES:
        return CASH_IN_HAND
    return group_class


def ledger_rule_sql(tenant_id: int):
    """SQL truth of "the ledger rule can move this ledger" (bank or system cash); used to widen a group filter."""
    return or_(ledger_is_bank_sql(tenant_id), ledger_is_cash_sql(tenant_id))


def pool_ledgers_sql(groups: dict[int, "GroupInfo"], tenant_id: int, pool_classes: frozenset[str]):
    """WHERE clause on ChartOfAccount: ledgers whose resolved class is in a pool that holds BOTH CASH_IN_HAND and
    BANK_ACCOUNTS (the cash pool). None when no ledger can match.

    Exact for such a pool: the ledger rule only moves ledgers between CASH_IN_HAND / BANK_ACCOUNTS (both inside) or out
    of CURRENT_ASSETS (into the pool), so the pool = pool-class groups + bank / system cash ledgers of CURRENT_ASSETS groups.
    """
    if not {CASH_IN_HAND, BANK_ACCOUNTS} <= pool_classes or CURRENT_ASSETS in pool_classes:
        raise ValueError("pool_ledgers_sql needs a pool with CASH_IN_HAND and BANK_ACCOUNTS but not CURRENT_ASSETS")
    direct = [gid for gid, info in groups.items() if info.effective_class in pool_classes]
    via_rule = [gid for gid, info in groups.items() if info.effective_class == CURRENT_ASSETS]
    clauses = []
    if direct:
        clauses.append(ChartOfAccount.group_id.in_(direct))
    if via_rule:
        clauses.append(and_(ChartOfAccount.group_id.in_(via_rule), ledger_rule_sql(tenant_id)))
    return or_(*clauses) if clauses else None


@dataclass
class GroupInfo:
    id: int
    name: str
    parent_id: int | None
    nature: str
    sort_order: int
    explicit_class: str | None
    effective_class: str | None = None
    source_group_id: int | None = None  # the group the effective class comes from
    children: list[int] = field(default_factory=list)


async def load_group_classification(db: AsyncSession, tenant_id: int) -> dict[int, GroupInfo]:
    """All of the tenant's account groups with their effective class. Exactly 2 SQL statements."""
    g = AccountGroup.__table__
    walk = (
        select(
            g.c.id.label("group_id"),
            g.c.id.label("node_id"),
            g.c.parent_group_id.label("parent_id"),
            g.c.statement_class.label("cls"),
            literal(0).label("depth"),
        )
        .where(g.c.tenant_id == tenant_id)
        .cte("walk", recursive=True)
    )
    parent = g.alias("parent")
    walk = walk.union_all(
        select(
            walk.c.group_id,
            parent.c.id,
            parent.c.parent_group_id,
            parent.c.statement_class,
            walk.c.depth + 1,
        )
        .select_from(walk.join(parent, parent.c.id == walk.c.parent_id))
        .where(parent.c.tenant_id == tenant_id, walk.c.depth < MAX_GROUP_DEPTH)
    )
    nearest = (
        select(walk.c.group_id, walk.c.cls, walk.c.node_id)
        .where(walk.c.cls.is_not(None))
        .distinct(walk.c.group_id)
        .order_by(walk.c.group_id, walk.c.depth)
    )
    resolved = {gid: (cls, node) for gid, cls, node in (await db.execute(nearest)).all()}

    rows = (
        await db.execute(
            select(g.c.id, g.c.name, g.c.parent_group_id, g.c.nature, g.c.sort_order, g.c.statement_class)
            .where(g.c.tenant_id == tenant_id)
            .order_by(g.c.sort_order, g.c.name, g.c.id)
        )
    ).all()
    groups: dict[int, GroupInfo] = {}
    for gid, name, parent_id, nature, sort_order, explicit in rows:
        info = GroupInfo(gid, name, parent_id, nature or "", sort_order or 0, explicit)
        if gid in resolved:
            info.effective_class, info.source_group_id = resolved[gid]
        groups[gid] = info
    for info in groups.values():
        if info.parent_id in groups and info.parent_id != info.id:
            groups[info.parent_id].children.append(info.id)
    return groups


def descendants_inheriting_from(groups: dict[int, GroupInfo], group_id: int) -> list[int]:
    """The group itself plus every descendant whose class comes from it (no own value in between).

    Cycle-safe: a visited set stops the walk if the hierarchy loops.
    """
    out: list[int] = []
    seen: set[int] = set()
    stack = [group_id]
    while stack:
        gid = stack.pop()
        if gid in seen or gid not in groups:
            continue
        seen.add(gid)
        out.append(gid)
        for child_id in groups[gid].children:
            child = groups.get(child_id)
            if child is not None and child.explicit_class is None:
                stack.append(child_id)
    return out


async def count_ledgers_in_groups(db: AsyncSession, tenant_id: int, group_ids: list[int]) -> int:
    if not group_ids:
        return 0
    return int(
        (
            await db.execute(
                select(func.count(ChartOfAccount.id)).where(
                    ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.group_id.in_(group_ids)
                )
            )
        ).scalar()
        or 0
    )