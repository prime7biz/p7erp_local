"""Resolve each account group's effective statement class (PLAN 2A).

Rules: a group's own `statement_class` wins; otherwise the nearest ancestor's applies; if none, the group is
Unclassified (None). `parent_group_id` has no database loop protection, so the walk is capped at
MAX_GROUP_DEPTH and the Python tree walks use a visited set.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import AccountGroup, ChartOfAccount
from app.modules.finance.statements.constants import MAX_GROUP_DEPTH


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