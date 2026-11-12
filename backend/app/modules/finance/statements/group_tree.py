"""Shared grouping step: arrange ledgers under their account groups, one primary group at a time.

A group is shown under its nearest ancestor that belongs to the same primary group, so an override deeper in
the hierarchy lands in its own primary group. The walks use a visited set (hierarchy loops are possible).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Callable, Iterable

from app.models.tenant import Tenant
from app.modules.finance.fiscal_year import fiscal_year_bounds, fiscal_year_label, fiscal_year_of, fy_start_month
from app.modules.finance.statements.classification_service import GroupInfo
from app.modules.finance.statements.constants import CLASS_TO_PRIMARY, PRIMARY_UNCLASSIFIED
from app.modules.finance.statements.ledger_aggregate_service import LedgerCalc
from app.modules.finance.statements.schemas import Company, Period, SheetNode, StatementWarning

ZERO = Decimal("0")


@dataclass
class GroupNode:
    group: GroupInfo
    children: list["GroupNode"] = field(default_factory=list)
    ledgers: list[LedgerCalc] = field(default_factory=list)


def group_primary(group: GroupInfo) -> str:
    return CLASS_TO_PRIMARY[group.effective_class] if group.effective_class else PRIMARY_UNCLASSIFIED


def _display_parent(groups: dict[int, GroupInfo], group: GroupInfo) -> int | None:
    primary = group_primary(group)
    seen = {group.id}
    cur = group.parent_id
    while cur is not None and cur not in seen:
        seen.add(cur)
        node = groups.get(cur)
        if node is None:
            return None
        if group_primary(node) == primary:
            return node.id
        cur = node.parent_id
    return None


def assemble(
    groups: dict[int, GroupInfo],
    calcs: Iterable[LedgerCalc],
    *,
    primary: str,
    include_empty_groups: bool = False,
) -> list[GroupNode]:
    """Top-level group nodes (with nested groups and ledgers) for one primary group."""
    order = {gid: i for i, gid in enumerate(groups)}  # `groups` is already sorted by sort_order, name
    parent_of: dict[int, int | None] = {}  # display parent per group that appears in the tree
    nodes: dict[int, GroupNode] = {}

    def ensure(gid: int) -> GroupNode:
        if gid in nodes:
            return nodes[gid]
        nodes[gid] = GroupNode(groups[gid])
        parent_of[gid] = _display_parent(groups, groups[gid])
        pid = parent_of[gid]
        if pid is not None:
            ensure(pid)  # ancestors always appear so the tree stays connected
        return nodes[gid]

    for calc in calcs:
        if calc.group is not None and group_primary(calc.group) == primary:
            ensure(calc.group_id).ledgers.append(calc)
    if include_empty_groups:
        for gid, info in groups.items():
            if group_primary(info) == primary:
                ensure(gid)

    # A looping hierarchy (A -> B -> A) would leave no root: cut the loop at its first group in display order.
    for gid in list(nodes):
        seen: list[int] = []
        cur: int | None = gid
        while cur is not None and cur not in seen:
            seen.append(cur)
            cur = parent_of.get(cur)
        if cur is not None:
            loop = seen[seen.index(cur):]
            parent_of[min(loop, key=lambda x: order[x])] = None

    roots: list[GroupNode] = []
    for gid, node in nodes.items():
        pid = parent_of[gid]
        if pid is None:
            roots.append(node)
        else:
            nodes[pid].children.append(node)
    roots.sort(key=lambda n: order[n.group.id])
    for n in nodes.values():
        n.children.sort(key=lambda c: order[c.group.id])
        n.ledgers.sort(key=lambda c: (c.account_number, c.account_id))
    return roots


# ---- two-sided statement lines (Balance Sheet, Trading, P&L) -------------------------------------------
def _sheet_group(
    node: GroupNode, value_fn: Callable[[LedgerCalc], Decimal], keep_fn: Callable[[LedgerCalc], bool]
) -> tuple[SheetNode | None, Decimal]:
    children: list[SheetNode] = []
    total = ZERO
    for ledger in node.ledgers:
        if not keep_fn(ledger):
            continue
        amount = value_fn(ledger)
        children.append(SheetNode(name=ledger.name, row_type="ledger", id=ledger.account_id, inner_amount=amount))
        total += amount
    for child in node.children:
        child_node, child_total = _sheet_group(child, value_fn, keep_fn)
        if child_node is not None:
            children.append(child_node)
            total += child_total
    if not children:
        return None, ZERO
    return SheetNode(name=node.group.name, row_type="group", id=node.group.id, outer_amount=total, children=children), total


def sheet_primary(
    groups: dict[int, GroupInfo],
    calcs: Iterable[LedgerCalc],
    *,
    primary: str,
    value_fn: Callable[[LedgerCalc], Decimal],
    keep_fn: Callable[[LedgerCalc], bool],
) -> tuple[SheetNode | None, Decimal]:
    """One primary-group line with its nested groups and ledgers; None when nothing is shown."""
    children: list[SheetNode] = []
    total = ZERO
    for root in assemble(groups, calcs, primary=primary):
        node, amount = _sheet_group(root, value_fn, keep_fn)
        if node is not None:
            children.append(node)
            total += amount
    if not children:
        return None, ZERO
    return SheetNode(name=primary, row_type="primary", outer_amount=total, children=children), total


# ---- period / envelope helpers -------------------------------------------------------------------------
def company_from(tenant: Tenant) -> Company:
    return Company(name=tenant.name, address=tenant.address, email=None)


def fiscal_period(
    tenant: Tenant,
    *,
    from_date: date | None,
    to_date: date | None,
    as_of_date: date | None = None,
) -> Period:
    start_month = fy_start_month(tenant.feature_flags)
    anchor = as_of_date or from_date or to_date
    assert anchor is not None
    fy_start, fy_end = fiscal_year_bounds(anchor, start_month)
    return Period(
        from_date=from_date,
        to_date=to_date,
        as_of_date=as_of_date,
        fiscal_year=fiscal_year_label(fiscal_year_of(anchor, start_month), start_month),
        fiscal_year_start=fy_start,
        fiscal_year_end=fy_end,
    )


def unclassified_warning(unclassified: list[tuple[int, Decimal]]) -> list[StatementWarning]:
    """`unclassified` holds (group_id, absolute amount) per ledger that sits in an Unclassified group."""
    if not unclassified:
        return []
    amount = sum((a for _g, a in unclassified), ZERO).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return [
        StatementWarning(code="UNCLASSIFIED_GROUPS", count=len({g for g, _a in unclassified}), amount=amount)
    ]
