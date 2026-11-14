"""Setup for Management Performance: category map, warning %, monthly targets, cost-centre owners.

Writes need admin / manager or `finance.mgmt_performance.setup` (checked in the router). Every id from the client is
checked against the tenant (`ensure_owned`, 404 for another tenant's id); every change is audited.
"""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.models import Tenant, User
from app.models.finance import AccountGroup, ChartOfAccount, CostCenter
from app.models.mgmt_performance import (
    ALL_CATEGORIES,
    OPERATING_CATEGORIES,
    MgmtCategoryThreshold,
    MgmtExpenseCategoryMap,
    MgmtMonthlyTarget,
)
from app.modules.audit.service import log_action
from app.modules.finance.budget_analytics.common import q4
from app.modules.finance.mgmt_performance.category_map import load_resolver
from app.modules.finance.mgmt_performance.constants import CATEGORY_LABELS, DEFAULT_WARNING_PCT

_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
MAX_ITEMS = 500


def _m(v: Decimal | None) -> str | None:
    return format(q4(v), "f") if v is not None else None


def _dec(value: Any, label: str, *, low: Decimal, high: Decimal) -> Decimal:
    try:
        d = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        raise HTTPException(status_code=422, detail=f"{label} must be a decimal number") from None
    if not d.is_finite() or d < low or d > high:
        raise HTTPException(status_code=422, detail=f"{label} must be between {low} and {high}")
    return q4(d)


def categories_out() -> list[dict[str, Any]]:
    return [{"code": c, "label": CATEGORY_LABELS.get(c, c), "operating": c in OPERATING_CATEGORIES} for c in ALL_CATEGORIES]


async def category_map_view(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    r = await load_resolver(db, tenant_id)
    expense_groups = {a.group_id for a in r.expense_accounts.values() if a.group_id is not None}
    # include parents so a mapping on a parent group is visible
    pending = list(expense_groups)
    while pending:
        gid = pending.pop()
        parent = r.group_parent.get(gid)
        if parent is not None and parent not in expense_groups:
            expense_groups.add(parent)
            pending.append(parent)
    groups = [
        {"id": gid, "name": r.group_names.get(gid, f"Group #{gid}"), "parent_group_id": r.group_parent.get(gid),
         "category": r.group_map.get(gid)}
        for gid in sorted(expense_groups, key=lambda g: r.group_names.get(g, ""))
    ]
    accounts = [
        {"id": a.id, "label": r.account_label(a.id), "group_id": a.group_id, "category": r.account_map.get(a.id),
         "effective_category": r.category_for(a.id)}
        for a in sorted(r.expense_accounts.values(), key=lambda x: (x.number or "", x.name))
    ]
    return {
        "categories": categories_out(),
        "groups": groups,
        "accounts": accounts,
        "unmapped_accounts": sum(1 for a in accounts if a["effective_category"] is None),
    }


async def save_category_map(db: AsyncSession, tenant: Tenant, user: User, items: list[dict[str, Any]]) -> None:
    if len(items) > MAX_ITEMS:
        raise HTTPException(status_code=422, detail=f"At most {MAX_ITEMS} changes at once")
    now = datetime.utcnow()
    changed = 0
    for it in items:
        account_id, group_id, category = it.get("account_id"), it.get("account_group_id"), it.get("category")
        if (account_id is None) == (group_id is None):
            raise HTTPException(status_code=422, detail="Each item needs exactly one of account_id or account_group_id")
        if category is not None and category not in ALL_CATEGORIES:
            raise HTTPException(status_code=422, detail=f"Unknown category {category}")
        if account_id is not None:
            await ensure_owned(db, ChartOfAccount, account_id, tenant.id, "Ledger account", status_code=404)
            cond = MgmtExpenseCategoryMap.account_id == int(account_id)
        else:
            await ensure_owned(db, AccountGroup, group_id, tenant.id, "Account group", status_code=404)
            cond = MgmtExpenseCategoryMap.account_group_id == int(group_id)
        row = (
            await db.execute(select(MgmtExpenseCategoryMap).where(MgmtExpenseCategoryMap.tenant_id == tenant.id, cond).with_for_update())
        ).scalar_one_or_none()
        if category is None:
            if row is not None:
                await db.delete(row)
                changed += 1
            continue
        if row is None:
            db.add(MgmtExpenseCategoryMap(
                tenant_id=tenant.id, account_id=account_id, account_group_id=group_id, category=category,
                updated_by=user.id, created_at=now, updated_at=now,
            ))
            changed += 1
        elif row.category != category:
            row.category, row.updated_by, row.updated_at = category, user.id, now
            changed += 1
    await db.flush()
    await log_action(db, tenant.id, "MGMT_CATEGORY_MAP_SAVE", user_id=user.id, resource="mgmt_expense_category_map",
                     details=f"changes={changed}")
    await db.commit()


async def thresholds_view(db: AsyncSession, tenant_id: int) -> list[dict[str, Any]]:
    stored = {
        c: p for c, p in (
            await db.execute(select(MgmtCategoryThreshold.category, MgmtCategoryThreshold.warning_pct).where(MgmtCategoryThreshold.tenant_id == tenant_id))
        ).all()
    }
    return [
        {"category": c, "label": CATEGORY_LABELS[c], "warning_pct": _m(Decimal(str(stored.get(c, DEFAULT_WARNING_PCT)))),
         "is_default": c not in stored}
        for c in OPERATING_CATEGORIES
    ]


async def save_thresholds(db: AsyncSession, tenant: Tenant, user: User, items: list[dict[str, Any]]) -> None:
    now = datetime.utcnow()
    for it in items[:len(OPERATING_CATEGORIES)]:
        cat = it.get("category")
        if cat not in OPERATING_CATEGORIES:
            raise HTTPException(status_code=422, detail=f"Unknown operating category {cat}")
        pct = _dec(it.get("warning_pct"), "warning_pct", low=Decimal("0"), high=Decimal("100"))
        row = (
            await db.execute(select(MgmtCategoryThreshold).where(MgmtCategoryThreshold.tenant_id == tenant.id, MgmtCategoryThreshold.category == cat).with_for_update())
        ).scalar_one_or_none()
        if row is None:
            db.add(MgmtCategoryThreshold(tenant_id=tenant.id, category=cat, warning_pct=pct, updated_by=user.id, created_at=now, updated_at=now))
        else:
            row.warning_pct, row.updated_by, row.updated_at = pct, user.id, now
    await db.flush()
    await log_action(db, tenant.id, "MGMT_THRESHOLDS_SAVE", user_id=user.id, resource="mgmt_category_thresholds",
                     details=";".join(f"{i.get('category')}={i.get('warning_pct')}" for i in items)[:500])
    await db.commit()


async def targets_view(db: AsyncSession, tenant_id: int, months: list[str]) -> list[dict[str, Any]]:
    stored = {
        r.period_month: r
        for r in (await db.execute(select(MgmtMonthlyTarget).where(MgmtMonthlyTarget.tenant_id == tenant_id, MgmtMonthlyTarget.period_month.in_(months)))).scalars()
    }
    out = []
    for m in months:
        r = stored.get(m)
        out.append({
            "period_month": m,
            "target_profit_amount": _m(Decimal(str(r.target_profit_amount))) if r else None,
            "contingency_pct": _m(Decimal(str(r.contingency_pct))) if r else None,
            "notes": r.notes if r else None,
            "updated_at": r.updated_at if r else None,
        })
    return out


async def save_target(db: AsyncSession, tenant: Tenant, user: User, body: dict[str, Any]) -> None:
    month = str(body.get("period_month") or "").strip()
    if not _MONTH.match(month):
        raise HTTPException(status_code=422, detail="period_month must look like 2026-11")
    profit = _dec(body.get("target_profit_amount"), "target_profit_amount", low=Decimal("0"), high=Decimal("99999999999999"))
    pct = _dec(body.get("contingency_pct"), "contingency_pct", low=Decimal("0"), high=Decimal("100"))
    notes = (str(body.get("notes") or "").strip()[:1000]) or None
    now = datetime.utcnow()
    row = (
        await db.execute(select(MgmtMonthlyTarget).where(MgmtMonthlyTarget.tenant_id == tenant.id, MgmtMonthlyTarget.period_month == month).with_for_update())
    ).scalar_one_or_none()
    if row is None:
        db.add(MgmtMonthlyTarget(tenant_id=tenant.id, period_month=month, target_profit_amount=profit, contingency_pct=pct,
                                 notes=notes, updated_by=user.id, created_at=now, updated_at=now))
    else:
        row.target_profit_amount, row.contingency_pct, row.notes, row.updated_by, row.updated_at = profit, pct, notes, user.id, now
    await db.flush()
    await log_action(db, tenant.id, "MGMT_TARGET_SAVE", user_id=user.id, resource=f"mgmt_monthly_target:{month}",
                     details=f"profit={profit} contingency={pct}")
    await db.commit()


async def owners_view(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    centers = (
        await db.execute(select(CostCenter).where(CostCenter.tenant_id == tenant_id).order_by(CostCenter.center_code).limit(MAX_ITEMS))
    ).scalars().all()
    users = (
        await db.execute(
            select(User.id, User.first_name, User.last_name, User.username, User.email)
            .where(User.tenant_id == tenant_id, User.is_active.is_(True)).order_by(User.first_name, User.id).limit(MAX_ITEMS)
        )
    ).all()
    return {
        "cost_centers": [
            {"id": c.id, "code": c.center_code, "name": c.name, "department": c.department, "is_active": c.is_active,
             "owner_user_id": c.owner_user_id}
            for c in centers
        ],
        "users": [
            {"id": uid, "label": " ".join(p for p in (first, last) if p) or uname or email}
            for uid, first, last, uname, email in users
        ],
    }


async def save_owner(db: AsyncSession, tenant: Tenant, user: User, cost_center_id: int, owner_user_id: int | None) -> None:
    cc = (
        await db.execute(select(CostCenter).where(CostCenter.id == cost_center_id, CostCenter.tenant_id == tenant.id).with_for_update())
    ).scalar_one_or_none()
    if cc is None:
        raise HTTPException(status_code=404, detail="Cost center not found")
    if owner_user_id is not None:
        owner = (
            await db.execute(select(User).where(User.id == owner_user_id, User.tenant_id == tenant.id, User.is_active.is_(True)))
        ).scalar_one_or_none()
        if owner is None:
            raise HTTPException(status_code=404, detail="User not found")
    old = cc.owner_user_id
    cc.owner_user_id = owner_user_id
    await db.flush()
    await log_action(db, tenant.id, "MGMT_COST_CENTER_OWNER", user_id=user.id, resource=f"cost_center:{cc.id}",
                     details=f"owner {old} -> {owner_user_id}")
    await db.commit()


async def count_unmapped(db: AsyncSession, tenant_id: int) -> int:
    r = await load_resolver(db, tenant_id)
    return sum(1 for a in r.expense_accounts if r.category_for(a) is None)
