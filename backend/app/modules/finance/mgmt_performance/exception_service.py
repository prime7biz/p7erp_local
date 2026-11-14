"""Budget exceptions: scan (creates / escalates rows) and the owner -> finance -> manager workflow (02 "Exceptions").

One row per month x cost centre x category (x account for UNMAPPED), key `dedupe_key`. Severity only rises
(WARNING < AT_RISK < FAILED); a higher severity re-opens an answered row. Workflow:
    OPEN / REJECTED --RESPOND (cost-centre owner; no owner: finance.budget.exception.respond)--> RESPONDED
    RESPONDED --REVIEW (finance.budget.exception.review, not the responder)--> REVIEWED
    REVIEWED --APPROVE / REJECT (finance.budget.exception.approve, not responder or reviewer)--> APPROVED / REJECTED
Every action: row lock, status guard, unique request id (a double submit replays), audit log, notification.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.permissions import (
    MANAGER_ONLY_ROLES,
    PERMISSION_BUDGET_EXCEPTION_APPROVE,
    PERMISSION_BUDGET_EXCEPTION_RESPOND,
    PERMISSION_BUDGET_EXCEPTION_REVIEW,
)
from app.database import safe_async_session_rollback
from app.models import Role, Tenant, User
from app.models.finance import CostCenter
from app.models.mgmt_performance import BudgetException, BudgetExceptionAction
from app.modules.audit.service import log_action
from app.modules.finance.budget_analytics.common import month_key, q4
from app.modules.finance.mgmt_performance.access import ViewerScope, has_action
from app.modules.finance.mgmt_performance.constants import (
    CATEGORY_LABELS,
    STATUS_AT_RISK,
    STATUS_FAILED,
    STATUS_UNBUDGETED,
    STATUS_WARNING,
)
from app.modules.finance.mgmt_performance.expense_forecast_service import compute_forecast, evaluate_row
from app.modules.finance.mgmt_performance.periods import parse_period
from app.modules.notifications.service import notify_user

SCAN_LOCK_KEY = 730302
SEVERITY_RANK = {"WARNING": 1, "AT_RISK": 2, "FAILED": 3}
ANSWERED = ("RESPONDED", "REVIEWED", "APPROVED", "REJECTED")
HREF = "/app/finance/management-performance?view=exceptions"
MAX_NOTIFY = 20
MAX_TEXT = 2000


def dedupe_key(month: str, cost_center_id: int | None, category: str | None, account_id: int | None, family: str) -> str:
    return f"{month}|{cost_center_id or 0}|{category or '-'}|{account_id or 0}|{family}"


async def _manager_user_ids(db: AsyncSession, tenant_id: int) -> list[int]:
    rows = await db.execute(
        select(User.id)
        .join(Role, Role.id == User.role_id)
        .where(User.tenant_id == tenant_id, User.is_active.is_(True), func.lower(Role.name).in_(tuple(MANAGER_ONLY_ROLES)))
        .order_by(User.id)
        .limit(MAX_NOTIFY)
    )
    return [int(r[0]) for r in rows.all()]


async def _upsert(db: AsyncSession, tenant_id: int, *, month: str, cc: int | None, category: str | None,
                  account_id: int | None, family: str, severity: str, budget: Decimal | None, actual: Decimal | None,
                  forecast: Decimal | None, now: datetime) -> str:
    key = dedupe_key(month, cc, category, account_id, family)
    inserted = (
        await db.execute(
            pg_insert(BudgetException)
            .values(
                tenant_id=tenant_id, period_month=month, cost_center_id=cc, category=category, account_id=account_id,
                family=family, severity=severity, status="OPEN", dedupe_key=key, budget_amount=budget,
                actual_amount=actual, forecast_amount=forecast, detected_at=now, last_scanned_at=now,
                created_at=now, updated_at=now,
            )
            .on_conflict_do_nothing(index_elements=["tenant_id", "dedupe_key"])
            .returning(BudgetException.id)
        )
    ).scalar_one_or_none()
    if inserted is not None:
        return "created"
    row = (
        await db.execute(
            select(BudgetException).where(BudgetException.tenant_id == tenant_id, BudgetException.dedupe_key == key).with_for_update()
        )
    ).scalar_one()
    row.budget_amount, row.actual_amount, row.forecast_amount, row.last_scanned_at = budget, actual, forecast, now
    if SEVERITY_RANK[severity] > SEVERITY_RANK.get(row.severity, 0):
        row.severity = severity
        if row.status in ANSWERED:
            row.status = "OPEN"
            row.escalated_at = now
        return "escalated"
    return "updated"


async def scan_tenant(db: AsyncSession, tenant: Tenant, *, today: date | None = None, actor_user_id: int | None = None) -> dict[str, int]:
    """Current month only. Caller commits. A per-tenant advisory lock serialises the daily job and the button."""
    await db.execute(text("SELECT pg_advisory_xact_lock(:k, :t)"), {"k": SCAN_LOCK_KEY, "t": tenant.id})
    period = parse_period(None, tenant, today=today)
    month = month_key(period.start)
    forecast = await compute_forecast(db, tenant, period)
    now = datetime.utcnow()
    counts = {"created": 0, "escalated": 0, "updated": 0}
    created_cc: list[int | None] = []
    for (cc, category), r in forecast.rows.items():
        fig = evaluate_row(forecast, r)
        if fig.status in (STATUS_WARNING, STATUS_AT_RISK, STATUS_FAILED):
            family, severity = "BUDGET", fig.status
        elif fig.status == STATUS_UNBUDGETED:
            family, severity = "UNBUDGETED", STATUS_WARNING
        else:
            continue
        outcome = await _upsert(
            db, tenant.id, month=month, cc=cc, category=category, account_id=None, family=family, severity=severity,
            budget=fig.budget, actual=fig.actual, forecast=fig.forecast, now=now,
        )
        counts[outcome] += 1
        if outcome in ("created", "escalated"):
            created_cc.append(cc)
    for account_id, amount in forecast.unmapped_actual.items():
        if amount == 0:
            continue
        outcome = await _upsert(
            db, tenant.id, month=month, cc=None, category=None, account_id=account_id, family="UNMAPPED",
            severity=STATUS_WARNING, budget=None, actual=q4(amount), forecast=q4(amount), now=now,
        )
        counts[outcome] += 1
        if outcome in ("created", "escalated"):
            created_cc.append(None)
    if created_cc:
        owners = {
            int(c.owner_user_id)
            for c in (
                await db.execute(select(CostCenter).where(CostCenter.tenant_id == tenant.id, CostCenter.id.in_([c for c in created_cc if c])))
            ).scalars()
            if c.owner_user_id
        } if any(created_cc) else set()
        recipients = set(owners)
        if None in created_cc or len(owners) < len({c for c in created_cc if c}):
            recipients |= set(await _manager_user_ids(db, tenant.id))
        for uid in sorted(recipients)[:MAX_NOTIFY]:
            notify_user(
                db, tenant_id=tenant.id, user_id=uid, kind="budget_exception",
                title="Budget warning: please review", body=f"{counts['created'] + counts['escalated']} budget item(s) need attention for {month}.",
                href=HREF, actor_user_id=actor_user_id,
            )
    await log_action(db, tenant.id, "MGMT_BUDGET_SCAN", user_id=actor_user_id, resource="budget_exceptions",
                     details=f"month={month} created={counts['created']} escalated={counts['escalated']}")
    return counts


# ------------------------------------------------------------------ workflow


def _clean(text_value: str | None, label: str, *, required: bool) -> str | None:
    value = (text_value or "").strip()
    if required and len(value) < 3:
        raise HTTPException(status_code=422, detail=f"{label} must be at least 3 characters")
    if len(value) > MAX_TEXT:
        raise HTTPException(status_code=422, detail=f"{label} must be at most {MAX_TEXT} characters")
    return value or None


def _amount(value: str | None) -> Decimal | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        amount = Decimal(str(value).strip())
    except InvalidOperation:
        raise HTTPException(status_code=422, detail="revised_forecast must be a decimal number") from None
    if not amount.is_finite() or amount < 0 or amount > Decimal("99999999999999"):
        raise HTTPException(status_code=422, detail="revised_forecast must be zero or more")
    return q4(amount)


async def _replay(db: AsyncSession, tenant_id: int, request_id: str, exception_id: int, action: str,
                  actor_user_id: int) -> BudgetException | None:
    prior = (
        await db.execute(
            select(BudgetExceptionAction).where(
                BudgetExceptionAction.tenant_id == tenant_id, BudgetExceptionAction.request_id == request_id
            )
        )
    ).scalar_one_or_none()
    if prior is None:
        return None
    if prior.exception_id != exception_id or prior.action != action or prior.actor_user_id != actor_user_id:
        raise HTTPException(status_code=409, detail="request_id was already used for another action")
    return await db.get(BudgetException, exception_id)


async def act(db: AsyncSession, tenant: Tenant, user: User, exception_id: int, action: str, *, request_id: str,
              reason: str | None = None, corrective_action: str | None = None, revised_forecast: str | None = None,
              note: str | None = None) -> tuple[BudgetException, bool]:
    """(exception, replayed). 404 for another tenant's id."""
    replay = await _replay(db, tenant.id, request_id, exception_id, action, user.id)
    if replay is not None and replay.tenant_id == tenant.id:
        return replay, True
    row = (
        await db.execute(
            select(BudgetException).where(BudgetException.id == exception_id, BudgetException.tenant_id == tenant.id).with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    cc = await db.get(CostCenter, row.cost_center_id) if row.cost_center_id else None
    if cc is not None and cc.tenant_id != tenant.id:
        cc = None
    now = datetime.utcnow()
    notify_ids: list[int] = []
    if action == "RESPOND":
        if row.status not in ("OPEN", "REJECTED"):
            raise HTTPException(status_code=409, detail=f"Only an open or rejected item can be answered (now {row.status})")
        if cc is not None and cc.owner_user_id:
            if cc.owner_user_id != user.id:
                raise HTTPException(status_code=403, detail="Only the cost-centre owner can answer this item")
        elif not await has_action(db, user, tenant, PERMISSION_BUDGET_EXCEPTION_RESPOND):
            raise HTTPException(status_code=403, detail=f"Requires permission '{PERMISSION_BUDGET_EXCEPTION_RESPOND}'")
        row.reason = _clean(reason, "Reason", required=True)
        row.corrective_action = _clean(corrective_action, "Corrective action", required=True)
        row.revised_forecast = _amount(revised_forecast)
        row.responded_by, row.responded_at = user.id, now
        row.reviewed_by = row.reviewed_at = row.review_note = None
        row.decided_by = row.decided_at = row.decision_note = None
        row.status = "RESPONDED"
        notify_ids = await _manager_user_ids(db, tenant.id)
    elif action == "REVIEW":
        if row.status != "RESPONDED":
            raise HTTPException(status_code=409, detail=f"Only an answered item can be reviewed (now {row.status})")
        if not await has_action(db, user, tenant, PERMISSION_BUDGET_EXCEPTION_REVIEW):
            raise HTTPException(status_code=403, detail=f"Requires permission '{PERMISSION_BUDGET_EXCEPTION_REVIEW}'")
        if row.responded_by == user.id:
            raise HTTPException(status_code=403, detail="Four-eyes rule: you answered this item, someone else must review it")
        row.review_note = _clean(note, "Note", required=False)
        row.reviewed_by, row.reviewed_at = user.id, now
        row.status = "REVIEWED"
        notify_ids = await _manager_user_ids(db, tenant.id)
    elif action in ("APPROVE", "REJECT"):
        if row.status != "REVIEWED":
            raise HTTPException(status_code=409, detail=f"Only a reviewed item can be approved or rejected (now {row.status})")
        if not await has_action(db, user, tenant, PERMISSION_BUDGET_EXCEPTION_APPROVE):
            raise HTTPException(status_code=403, detail=f"Requires permission '{PERMISSION_BUDGET_EXCEPTION_APPROVE}'")
        if user.id in (row.responded_by, row.reviewed_by):
            raise HTTPException(status_code=403, detail="Four-eyes rule: the person who answered or reviewed cannot decide")
        row.decision_note = _clean(note, "Note", required=action == "REJECT")
        row.decided_by, row.decided_at = user.id, now
        row.status = "APPROVED" if action == "APPROVE" else "REJECTED"
        notify_ids = [i for i in (row.responded_by,) if i]
    else:
        raise HTTPException(status_code=422, detail="Unknown action")

    db.add(BudgetExceptionAction(
        tenant_id=tenant.id, exception_id=row.id, action=action, request_id=request_id, actor_user_id=user.id,
        note=row.review_note if action == "REVIEW" else row.decision_note if action in ("APPROVE", "REJECT") else row.reason,
        created_at=now,
    ))
    try:
        await db.flush()
    except IntegrityError:
        await safe_async_session_rollback(db)
        replay = await _replay(db, tenant.id, request_id, exception_id, action, user.id)
        if replay is None:
            raise HTTPException(status_code=409, detail="Could not save the action, please retry") from None
        return replay, True
    await log_action(db, tenant.id, f"MGMT_BUDGET_EXCEPTION_{action}", user_id=user.id, resource=f"budget_exception:{row.id}",
                     details=f"status={row.status} month={row.period_month}")
    for uid in notify_ids[:MAX_NOTIFY]:
        notify_user(db, tenant_id=tenant.id, user_id=uid, kind="budget_exception",
                    title=f"Budget item {row.status.lower()}", body=f"{row.period_month}: {CATEGORY_LABELS.get(row.category or '', row.family)}",
                    href=HREF, actor_user_id=user.id)
    await db.commit()
    await db.refresh(row)
    return row, False


# ------------------------------------------------------------------ list / output


def _m(v: Decimal | None) -> str | None:
    return format(q4(v), "f") if v is not None else None


async def list_exceptions(db: AsyncSession, tenant: Tenant, user: User, scope: ViewerScope, *, month: str | None,
                          status: str | None, family: str | None, limit: int, offset: int) -> dict[str, Any]:
    stmt = select(BudgetException).where(BudgetException.tenant_id == tenant.id)
    if month:
        stmt = stmt.where(BudgetException.period_month == month)
    if status:
        stmt = stmt.where(BudgetException.status == status)
    if family:
        stmt = stmt.where(BudgetException.family == family)
    if not scope.company:
        stmt = stmt.where(BudgetException.cost_center_id.in_(list(scope.cost_center_ids)))
    total = int((await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0)
    rows = list((await db.execute(stmt.order_by(BudgetException.id.desc()).limit(limit).offset(offset))).scalars())
    cc_ids = {r.cost_center_id for r in rows if r.cost_center_id}
    ccs = {c.id: c for c in (await db.execute(select(CostCenter).where(CostCenter.tenant_id == tenant.id, CostCenter.id.in_(cc_ids)))).scalars()} if cc_ids else {}
    can_respond_any = await has_action(db, user, tenant, PERMISSION_BUDGET_EXCEPTION_RESPOND)
    can_review = await has_action(db, user, tenant, PERMISSION_BUDGET_EXCEPTION_REVIEW)
    can_decide = await has_action(db, user, tenant, PERMISSION_BUDGET_EXCEPTION_APPROVE)
    items = []
    for r in rows:
        cc = ccs.get(r.cost_center_id) if r.cost_center_id else None
        owner = cc.owner_user_id if cc else None
        restricted = r.category == "PAYROLL" and not scope.payroll_visible
        money = (lambda v: None) if restricted else _m
        respond_ok = r.status in ("OPEN", "REJECTED") and (owner == user.id if owner else can_respond_any)
        items.append({
            "id": r.id, "period_month": r.period_month, "cost_center_id": r.cost_center_id,
            "cost_center_label": (f"{cc.center_code} - {cc.name}" if cc else "(Company level)"),
            "owner_user_id": owner, "category": r.category,
            "category_label": CATEGORY_LABELS.get(r.category or "", "Unmapped account" if r.family == "UNMAPPED" else r.category),
            "account_id": r.account_id, "family": r.family, "severity": r.severity, "status": r.status,
            "budget_amount": money(r.budget_amount), "actual_amount": money(r.actual_amount),
            "forecast_amount": money(r.forecast_amount), "revised_forecast": money(r.revised_forecast),
            "reason": r.reason, "corrective_action": r.corrective_action, "review_note": r.review_note,
            "decision_note": r.decision_note, "responded_by": r.responded_by, "reviewed_by": r.reviewed_by,
            "decided_by": r.decided_by, "detected_at": r.detected_at, "escalated_at": r.escalated_at,
            "restricted": restricted,
            "can_respond": respond_ok,
            "can_review": r.status == "RESPONDED" and can_review and r.responded_by != user.id,
            "can_decide": r.status == "REVIEWED" and can_decide and user.id not in (r.responded_by, r.reviewed_by),
        })
    return {"items": items, "total": total, "limit": limit, "offset": offset}
