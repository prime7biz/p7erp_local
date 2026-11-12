"""Propose (and optionally apply) statement classes for a tenant's Unclassified account groups.

Used by `scripts/finance_classify_groups.py`. Deterministic standard (Tally-style) rules only, never by name:

1. The group (or an ancestor) already has a class -> nothing to do (a descendant inherits; it is listed as "inherits").
2. system_code: the frozen migration-293 map plus SYSTEM_GROUP_STATEMENT_CLASS_STANDARD (CASH_AND_BANK -> BANK_ACCOUNTS,
   TRADE_FINANCE_LIABILITIES / DEFERRED_LIABILITIES -> CURRENT_LIABILITIES, SERVICE_REVENUE_GROUP -> SALES_ACCOUNTS).
   CONTROL_ACCOUNTS (memorandum) stays Unclassified for review, unless its ledgers net to exactly zero
   (all posted movement + stored openings) -> CURRENT_ASSETS.
3. Top-level legacy codes (code + nature): AST Asset, LIA Liability, EQT Equity, INC Income, EXP Expense, plus the
   codes of POST /finance/account-groups/seed (same list as migration 293).
4. Nature defaults: Equity -> CAPITAL_ACCOUNT; Income -> SALES_ACCOUNTS when it affects gross profit, else
   INDIRECT_INCOMES; Expense -> DIRECT_EXPENSES when it affects gross profit, else INDIRECT_EXPENSES.
   Asset / Liability without a rule stay Unclassified ("needs review").

Groups are walked parents first, so a child of a group that gets a class here inherits it and is skipped.
`apply_group_classes` writes only rows that are still NULL (row lock), tenant-scoped, one `log_action` per change, and
never commits: the caller owns the single transaction.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import AccountGroup, ChartOfAccount, Voucher, VoucherLine
from app.modules.audit.service import log_action
from app.modules.finance.advanced_voucher_service import (
    voucher_counts_in_books_status_clause,
    voucher_in_books_clause,
)
from app.modules.finance.posting_core import line_base_amount_sql
from app.modules.finance.statements.constants import (
    CAPITAL_ACCOUNT,
    CURRENT_ASSETS,
    CURRENT_LIABILITIES,
    DIRECT_EXPENSES,
    DIRECT_INCOMES,
    FIXED_ASSETS,
    INDIRECT_EXPENSES,
    INDIRECT_INCOMES,
    INVESTMENTS,
    MAX_GROUP_DEPTH,
    SALES_ACCOUNTS,
    STATEMENT_CLASS_SET,
)
from app.modules.finance.system_coa_templates import (
    CONTROL_ACCOUNTS_SYSTEM_CODE,
    SYSTEM_GROUP_STATEMENT_CLASS,
    SYSTEM_GROUP_STATEMENT_CLASS_STANDARD,
)

ZERO = Decimal("0")
AUDIT_ACTION = "finance.account_group.statement_class.update"  # same action as the Setup API
AUDIT_SOURCE = "scripts/finance_classify_groups.py"

ACTION_SET = "set"
ACTION_INHERITS = "inherits"
ACTION_REVIEW = "review"

SYSTEM_CODE_RULES: dict[str, str] = {**SYSTEM_GROUP_STATEMENT_CLASS, **SYSTEM_GROUP_STATEMENT_CLASS_STANDARD}

# (code upper-case, nature lower-case) -> class, top-level groups only.
LEGACY_TOP_LEVEL_CODE_CLASS: dict[tuple[str, str], str] = {
    ("AST", "asset"): CURRENT_ASSETS,
    ("LIA", "liability"): CURRENT_LIABILITIES,
    ("EQT", "equity"): CAPITAL_ACCOUNT,
    ("INC", "income"): SALES_ACCOUNTS,
    ("EXP", "expense"): INDIRECT_EXPENSES,
    ("CAPITAL", "equity"): CAPITAL_ACCOUNT,
    ("CURRENT_LIABILITIES", "liability"): CURRENT_LIABILITIES,
    ("CURRENT_ASSETS", "asset"): CURRENT_ASSETS,
    ("FIXED_ASSETS", "asset"): FIXED_ASSETS,
    ("INVESTMENTS", "asset"): INVESTMENTS,
    ("DIRECT_EXPENSES", "expense"): DIRECT_EXPENSES,
    ("INDIRECT_EXPENSES", "expense"): INDIRECT_EXPENSES,
    ("DIRECT_INCOME", "income"): DIRECT_INCOMES,
    ("INDIRECT_INCOME", "income"): INDIRECT_INCOMES,
}


@dataclass
class GroupProposal:
    group_id: int
    code: str
    name: str
    nature: str
    proposed_class: str | None
    action: str  # set | inherits | review
    reason: str


@dataclass
class _Row:
    id: int
    code: str
    name: str
    nature: str
    parent_id: int | None
    system_code: str | None
    explicit: str | None
    agp: bool
    sort_order: int


def _nature_rule(nature: str, agp: bool) -> tuple[str | None, str]:
    n = nature.strip().lower()
    if n == "equity":
        return CAPITAL_ACCOUNT, "nature Equity"
    if n == "income":
        return (SALES_ACCOUNTS, "nature Income, affects gross profit") if agp else (INDIRECT_INCOMES, "nature Income")
    if n == "expense":
        return (DIRECT_EXPENSES, "nature Expense, affects gross profit") if agp else (INDIRECT_EXPENSES, "nature Expense")
    return None, f"needs review: nature {nature or '(blank)'} has no standard rule"


def _depth(rows: dict[int, _Row], gid: int) -> int:
    depth, seen, cur = 0, {gid}, rows[gid].parent_id
    while cur in rows and cur not in seen and depth < MAX_GROUP_DEPTH:
        seen.add(cur)
        depth += 1
        cur = rows[cur].parent_id
    return depth


def _class_from_ancestors(rows: dict[int, _Row], decided: dict[int, str], gid: int) -> tuple[int, str] | None:
    seen, cur, steps = {gid}, rows[gid].parent_id, 0
    while cur in rows and cur not in seen and steps < MAX_GROUP_DEPTH:
        cls = rows[cur].explicit or decided.get(cur)
        if cls:
            return cur, cls
        seen.add(cur)
        steps += 1
        cur = rows[cur].parent_id
    return None


def _subtree(rows: dict[int, _Row], gid: int) -> set[int]:
    children: dict[int, list[int]] = {}
    for r in rows.values():
        if r.parent_id is not None and r.parent_id != r.id:
            children.setdefault(r.parent_id, []).append(r.id)
    out, stack = set(), [gid]
    while stack:
        cur = stack.pop()
        if cur in out:
            continue
        out.add(cur)
        stack.extend(c for c in children.get(cur, []) if rows[c].explicit is None)
    return out


async def _group_nets(db: AsyncSession, tenant_id: int, group_ids: set[int]) -> dict[int, Decimal]:
    """All-time net (debit minus credit, stored opening + posted in-books movement) per group. 1 statement."""
    if not group_ids:
        return {}
    amount = line_base_amount_sql()
    signed = case((func.upper(VoucherLine.entry_type) == "DEBIT", amount), else_=-amount)
    lines = (
        select(VoucherLine.account_id.label("account_id"), func.coalesce(func.sum(signed), 0).label("net"))
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(
            VoucherLine.tenant_id == tenant_id,
            Voucher.tenant_id == tenant_id,
            voucher_counts_in_books_status_clause(),
            voucher_in_books_clause(),
        )
        .group_by(VoucherLine.account_id)
        .subquery()
    )
    opening = case(
        (func.lower(ChartOfAccount.normal_balance) == "debit", ChartOfAccount.opening_balance),
        else_=-ChartOfAccount.opening_balance,
    )
    rows = (
        await db.execute(
            select(ChartOfAccount.group_id, func.coalesce(func.sum(opening + func.coalesce(lines.c.net, 0)), 0))
            .outerjoin(lines, lines.c.account_id == ChartOfAccount.id)
            .where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.group_id.in_(sorted(group_ids)))
            .group_by(ChartOfAccount.group_id)
        )
    ).all()
    return {int(gid): Decimal(str(net or 0)) for gid, net in rows}


async def propose_group_classes(db: AsyncSession, tenant_id: int) -> list[GroupProposal]:
    """One proposal per Unclassified group of the tenant (read-only; 1-2 statements)."""
    g = AccountGroup
    result = await db.execute(
        select(g.id, g.code, g.name, g.nature, g.parent_group_id, g.system_code, g.statement_class, g.affects_gross_profit, g.sort_order)
        .where(g.tenant_id == tenant_id)
    )
    rows = {
        r[0]: _Row(r[0], r[1] or "", r[2] or "", r[3] or "", r[4], r[5], r[6], bool(r[7]), r[8] or 0)
        for r in result.all()
    }
    pending = [r for r in rows.values() if r.explicit is None]
    pending.sort(key=lambda r: (_depth(rows, r.id), r.sort_order, r.id))

    control_ids = [r.id for r in pending if (r.system_code or "").upper() == CONTROL_ACCOUNTS_SYSTEM_CODE]
    subtrees = {cid: _subtree(rows, cid) for cid in control_ids}
    nets = await _group_nets(db, tenant_id, set().union(*subtrees.values())) if subtrees else {}

    decided: dict[int, str] = {}
    proposals: list[GroupProposal] = []
    for r in pending:
        inherited = _class_from_ancestors(rows, decided, r.id)
        if inherited is not None:
            parent_id, cls = inherited
            proposals.append(
                GroupProposal(r.id, r.code, r.name, r.nature, None, ACTION_INHERITS, f"inherits {cls} from group {parent_id}")
            )
            continue
        cls, reason = _rule_for(r, rows, subtrees, nets)
        if cls is not None and cls in STATEMENT_CLASS_SET:
            decided[r.id] = cls
            proposals.append(GroupProposal(r.id, r.code, r.name, r.nature, cls, ACTION_SET, reason))
        else:
            proposals.append(GroupProposal(r.id, r.code, r.name, r.nature, None, ACTION_REVIEW, reason))
    return proposals


def _rule_for(r: _Row, rows: dict[int, _Row], subtrees: dict[int, set[int]], nets: dict[int, Decimal]) -> tuple[str | None, str]:
    code = (r.system_code or "").upper()
    if code == CONTROL_ACCOUNTS_SYSTEM_CODE:
        net = sum((nets.get(gid, ZERO) for gid in subtrees.get(r.id, {r.id})), ZERO)
        if net == ZERO:
            return CURRENT_ASSETS, "system_code CONTROL_ACCOUNTS; ledgers net to exactly zero"
        return None, f"memorandum control accounts: review (ledgers net {format(net, 'f')}, not zero)"
    if code in SYSTEM_CODE_RULES:
        return SYSTEM_CODE_RULES[code], f"system_code {code}"
    if code:
        return None, f"needs review: system_code {code} has no standard rule"
    nature = r.nature.strip().lower()
    if r.parent_id is None or r.parent_id not in rows:
        legacy = LEGACY_TOP_LEVEL_CODE_CLASS.get((r.code.strip().upper(), nature))
        if legacy is not None:
            return legacy, f"top-level code {r.code.strip().upper()} + nature {r.nature}"
    return _nature_rule(r.nature, r.agp)


async def apply_group_classes(db: AsyncSession, tenant_id: int, *, user_id: int | None = None) -> list[GroupProposal]:
    """Write every `set` proposal (still-NULL rows only, locked) with one audit row each. Does NOT commit."""
    proposals = [p for p in await propose_group_classes(db, tenant_id) if p.action == ACTION_SET]
    if not proposals:
        return []
    by_id = {p.group_id: p for p in proposals}
    locked = (
        await db.execute(
            select(AccountGroup)
            .where(AccountGroup.tenant_id == tenant_id, AccountGroup.id.in_(sorted(by_id)))
            .order_by(AccountGroup.id)
            .with_for_update()
        )
    ).scalars().all()
    applied: list[GroupProposal] = []
    for row in locked:
        p = by_id[row.id]
        if row.tenant_id != tenant_id or row.statement_class is not None:
            continue
        row.statement_class = p.proposed_class
        await log_action(
            db,
            tenant_id,
            AUDIT_ACTION,
            user_id=user_id,
            resource=f"account_group:{row.id}",
            details=json.dumps(
                {"from": None, "to": p.proposed_class, "group": row.name, "rule": p.reason, "source": AUDIT_SOURCE}
            ),
        )
        applied.append(p)
    await db.flush()
    return applied
