"""Budget revisions: the only way to change a FINAL budget while `mgmt_performance_v1` is on (02 "Budget revisions").

Request (cost-centre owner of the line, or finance.mgmt_performance.setup) -> PENDING.
Approve / reject (finance.budget.revision.approve, never the requester): locks the revision and the budget line,
checks the line still has the amount the request saw, writes `budget_lines.amount` (CHANGE) or a new line
(ADD_LINE) in the same transaction, numbers the revision per line, audit log. The original amount stays in
`old_amount` of the first revision. A double submit with the same request id returns the stored revision.
"""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.common.permissions import PERMISSION_BUDGET_REVISION_APPROVE, PERMISSION_MGMT_PERFORMANCE_SETUP
from app.database import safe_async_session_rollback
from app.models import Tenant, User
from app.models.finance import Budget, BudgetLine, ChartOfAccount, CostCenter
from app.models.mgmt_performance import BudgetException, BudgetLineRevision
from app.modules.audit.service import log_action
from app.modules.finance.budget_analytics.common import q4
from app.modules.finance.budget_vs_actual_service import budget_line_period
from app.modules.finance.fiscal_year import fiscal_year_bounds_from_label, fy_start_month
from app.modules.finance.mgmt_performance.access import ViewerScope, has_action
from app.modules.finance.mgmt_performance.exception_service import HREF, _manager_user_ids
from app.modules.notifications.service import notify_user

_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
MAX_AMOUNT = Decimal("99999999999999")


def _amount(value: Any) -> Decimal:
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        raise HTTPException(status_code=422, detail="new_amount must be a decimal number") from None
    if not amount.is_finite() or amount < 0 or amount > MAX_AMOUNT:
        raise HTTPException(status_code=422, detail="new_amount must be zero or more")
    return q4(amount)


def _reason(value: str | None) -> str:
    text = (value or "").strip()
    if not 3 <= len(text) <= 2000:
        raise HTTPException(status_code=422, detail="reason must be 3 to 2000 characters")
    return text


async def _final_budget(db: AsyncSession, tenant_id: int, budget_id: int | None) -> Budget:
    budget = await db.get(Budget, budget_id) if budget_id else None
    if budget is None or budget.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Budget not found")
    if (budget.status or "").upper() != "FINAL":
        raise HTTPException(status_code=409, detail="Only a FINAL budget needs a revision; edit a DRAFT budget directly")
    return budget


async def _may_request(db: AsyncSession, tenant: Tenant, user: User, cost_center_id: int | None) -> None:
    if await has_action(db, user, tenant, PERMISSION_MGMT_PERFORMANCE_SETUP):
        return
    if cost_center_id is not None:
        cc = await db.get(CostCenter, cost_center_id)
        if cc is not None and cc.tenant_id == tenant.id and cc.owner_user_id == user.id:
            return
    raise HTTPException(status_code=403, detail=f"Requires the cost-centre owner or permission '{PERMISSION_MGMT_PERFORMANCE_SETUP}'")


async def _by_request(db: AsyncSession, tenant_id: int, request_id: str) -> BudgetLineRevision | None:
    return (
        await db.execute(
            select(BudgetLineRevision).where(BudgetLineRevision.tenant_id == tenant_id, BudgetLineRevision.request_id == request_id)
        )
    ).scalar_one_or_none()


async def request_revision(db: AsyncSession, tenant: Tenant, user: User, *, request_id: str, kind: str,
                           budget_line_id: int | None, budget_id: int | None, cost_center_id: int | None,
                           account_id: int | None, period_month: str | None, new_amount: Any, reason: str | None,
                           exception_id: int | None) -> tuple[BudgetLineRevision, bool]:
    prior = await _by_request(db, tenant.id, request_id)
    if prior is not None:
        if prior.requested_by != user.id:
            raise HTTPException(status_code=409, detail="request_id was already used")
        return prior, True
    amount = _amount(new_amount)
    text_reason = _reason(reason)
    if exception_id is not None:
        await ensure_owned(db, BudgetException, exception_id, tenant.id, "Budget exception", status_code=404)
    if kind == "CHANGE":
        line = await db.get(BudgetLine, budget_line_id) if budget_line_id else None
        if line is None or line.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Budget line not found")
        budget = await _final_budget(db, tenant.id, line.budget_id)
        await _may_request(db, tenant, user, line.cost_center_id)
        row = BudgetLineRevision(
            tenant_id=tenant.id, budget_id=budget.id, budget_line_id=line.id, kind="CHANGE",
            cost_center_id=line.cost_center_id, account_id=line.account_id, period_month=line.period_month,
            old_amount=q4(Decimal(str(line.amount or 0))), new_amount=amount,
        )
    elif kind == "ADD_LINE":
        budget = await _final_budget(db, tenant.id, budget_id)
        await ensure_owned(db, CostCenter, cost_center_id, tenant.id, "Cost center", status_code=404)
        if account_id is None:
            raise HTTPException(status_code=422, detail="account_id is required for a new budget line")
        await ensure_owned(db, ChartOfAccount, account_id, tenant.id, "Ledger account", status_code=404)
        month = (period_month or "").strip()
        if not _MONTH.match(month):
            raise HTTPException(status_code=422, detail="period_month must look like 2026-11")
        sm = fy_start_month(tenant.feature_flags)
        _kind, start, _end = budget_line_period(month, fiscal_year_bounds_from_label(budget.fiscal_year, sm), sm)
        bounds = fiscal_year_bounds_from_label(budget.fiscal_year, sm)
        if bounds is None or start is None or not (bounds[0] <= start <= bounds[1]):
            raise HTTPException(status_code=422, detail="period_month is outside the budget's financial year")
        await _may_request(db, tenant, user, cost_center_id)
        row = BudgetLineRevision(
            tenant_id=tenant.id, budget_id=budget.id, budget_line_id=None, kind="ADD_LINE",
            cost_center_id=cost_center_id, account_id=account_id, period_month=month, old_amount=None, new_amount=amount,
        )
    else:
        raise HTTPException(status_code=422, detail="kind must be CHANGE or ADD_LINE")
    now = datetime.utcnow()
    row.reason, row.status, row.exception_id, row.request_id = text_reason, "PENDING", exception_id, request_id
    row.requested_by, row.requested_at, row.created_at = user.id, now, now
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await safe_async_session_rollback(db)
        prior = await _by_request(db, tenant.id, request_id)
        if prior is None:
            raise HTTPException(status_code=409, detail="Could not save the request, please retry") from None
        return prior, True
    await log_action(db, tenant.id, "MGMT_BUDGET_REVISION_REQUEST", user_id=user.id, resource=f"budget_line_revision:{row.id}",
                     details=f"kind={row.kind} budget={row.budget_id} line={row.budget_line_id} new={row.new_amount}")
    for uid in await _manager_user_ids(db, tenant.id):
        notify_user(db, tenant_id=tenant.id, user_id=uid, kind="budget_revision", title="Budget revision waiting for approval",
                    body=f"{row.period_month}: new amount {row.new_amount}", href=HREF.replace("exceptions", "revisions"),
                    actor_user_id=user.id)
    await db.commit()
    await db.refresh(row)
    return row, False


async def decide_revision(db: AsyncSession, tenant: Tenant, user: User, revision_id: int, *, approve: bool,
                          note: str | None) -> tuple[BudgetLineRevision, bool]:
    wanted = "APPROVED" if approve else "REJECTED"
    row = (
        await db.execute(
            select(BudgetLineRevision)
            .where(BudgetLineRevision.id == revision_id, BudgetLineRevision.tenant_id == tenant.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    if not await has_action(db, user, tenant, PERMISSION_BUDGET_REVISION_APPROVE):
        raise HTTPException(status_code=403, detail=f"Requires permission '{PERMISSION_BUDGET_REVISION_APPROVE}'")
    if row.status == wanted and row.decided_by == user.id:
        return row, True
    if row.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"This revision is already {row.status}")
    if row.requested_by == user.id:
        raise HTTPException(status_code=403, detail="Four-eyes rule: you cannot decide your own revision request")
    clean_note = (note or "").strip()[:2000] or None
    if not approve and not clean_note:
        raise HTTPException(status_code=422, detail="A note is required to reject")
    now = datetime.utcnow()
    if approve:
        budget = (
            await db.execute(select(Budget).where(Budget.id == row.budget_id, Budget.tenant_id == tenant.id).with_for_update())
        ).scalar_one_or_none() if row.budget_id else None
        if budget is None or (budget.status or "").upper() != "FINAL":
            raise HTTPException(status_code=409, detail="The budget is no longer FINAL; the revision cannot be applied")
        if row.kind == "CHANGE":
            line = (
                await db.execute(
                    select(BudgetLine).where(BudgetLine.id == row.budget_line_id, BudgetLine.tenant_id == tenant.id).with_for_update()
                )
            ).scalar_one_or_none() if row.budget_line_id else None
            if line is None:
                raise HTTPException(status_code=409, detail="The budget line no longer exists")
            if q4(Decimal(str(line.amount or 0))) != row.old_amount:
                raise HTTPException(status_code=409, detail="The budget line changed after this request; ask for a new revision")
            line.amount = row.new_amount
        else:
            line = BudgetLine(
                tenant_id=tenant.id, budget_id=budget.id, cost_center_id=row.cost_center_id, account_id=row.account_id,
                period_month=row.period_month, amount=row.new_amount, notes=f"Added by budget revision #{row.id}",
            )
            db.add(line)
            await db.flush()
            row.budget_line_id = line.id
        done = int((await db.execute(
            select(func.count(BudgetLineRevision.id)).where(
                BudgetLineRevision.tenant_id == tenant.id, BudgetLineRevision.budget_line_id == line.id,
                BudgetLineRevision.status == "APPROVED",
            )
        )).scalar() or 0)
        row.revision_no = done + 1
    row.status, row.decided_by, row.decided_at, row.decision_note = wanted, user.id, now, clean_note
    await db.flush()
    await log_action(db, tenant.id, f"MGMT_BUDGET_REVISION_{wanted}", user_id=user.id, resource=f"budget_line_revision:{row.id}",
                     details=f"kind={row.kind} line={row.budget_line_id} old={row.old_amount} new={row.new_amount}")
    notify_user(db, tenant_id=tenant.id, user_id=row.requested_by, kind="budget_revision",
                title=f"Budget revision {wanted.lower()}", body=f"{row.period_month}: {row.new_amount}",
                href=HREF.replace("exceptions", "revisions"), actor_user_id=user.id)
    await db.commit()
    await db.refresh(row)
    return row, False


async def payroll_restricted_check(db: AsyncSession, tenant_id: int, payroll_visible: bool):
    """Function account_id -> True when its amounts must be hidden (PAYROLL category, viewer without payroll rights)."""
    if payroll_visible:
        return lambda _account_id: False
    from app.modules.finance.mgmt_performance.category_map import load_resolver

    resolver = await load_resolver(db, tenant_id)
    return lambda account_id: resolver.category_for(account_id) == "PAYROLL"


def revision_out(r: BudgetLineRevision, user: User | None = None, can_decide: bool = False, *, restricted: bool = False) -> dict[str, Any]:
    return {
        "id": r.id, "budget_id": r.budget_id, "budget_line_id": r.budget_line_id, "kind": r.kind,
        "revision_no": r.revision_no, "cost_center_id": r.cost_center_id, "account_id": r.account_id,
        "period_month": r.period_month,
        "restricted": restricted,
        "old_amount": format(r.old_amount, "f") if r.old_amount is not None and not restricted else None,
        "new_amount": None if restricted else format(r.new_amount, "f"), "reason": r.reason, "status": r.status,
        "exception_id": r.exception_id, "requested_by": r.requested_by, "requested_at": r.requested_at,
        "decided_by": r.decided_by, "decided_at": r.decided_at, "decision_note": r.decision_note,
        "can_decide": bool(can_decide and r.status == "PENDING" and user is not None and r.requested_by != user.id),
    }


async def list_revisions(db: AsyncSession, tenant: Tenant, user: User, scope: ViewerScope, *, status: str | None,
                         limit: int, offset: int) -> dict[str, Any]:
    stmt = select(BudgetLineRevision).where(BudgetLineRevision.tenant_id == tenant.id)
    if status:
        stmt = stmt.where(BudgetLineRevision.status == status)
    if not scope.company:
        stmt = stmt.where(BudgetLineRevision.cost_center_id.in_(list(scope.cost_center_ids)))
    total = int((await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0)
    rows = (await db.execute(stmt.order_by(BudgetLineRevision.id.desc()).limit(limit).offset(offset))).scalars()
    can_decide = await has_action(db, user, tenant, PERMISSION_BUDGET_REVISION_APPROVE)
    hidden = await payroll_restricted_check(db, tenant.id, scope.payroll_visible)
    return {
        "items": [revision_out(r, user, can_decide, restricted=hidden(r.account_id)) for r in rows],
        "total": total, "limit": limit, "offset": offset,
    }
