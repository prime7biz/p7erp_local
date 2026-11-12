"""Tiffin / lunch / dinner / night bills, Friday (weekly holiday) allowance, production bonus and
festival bonus. Per-employee switches and own amounts: ``pay_benefits.py``.

All three are company benefits (never labelled statutory). Approved rows reach the employee through
exactly one payroll run line (``payroll_extras``) when the matching strict flag is ON:
``hr_meal_night_bills_enabled``, ``hr_production_bonus_enabled``, ``hr_festival_bonus_enabled``.

Allowance rules      GET/POST /hr/allowances/rules, POST /hr/allowances/rules/{id}/approve
Allowance entries    POST /hr/allowances/preview|generate, GET /hr/allowances/entries,
                     POST /hr/allowances/entries/{id}/correct|reject, POST /hr/allowances/entries/approve
Production bonus     GET/POST /hr/production-bonus/schemes, POST /hr/production-bonus/schemes/{id}/approve,
                     POST /hr/production-bonus/generate, GET /hr/production-bonus/entries,
                     POST /hr/production-bonus/entries/approve
Festival bonus       POST /hr/festival-bonus/{declaration_id}/allocate, GET /hr/festival-bonus/{declaration_id}/lines,
                     POST /hr/festival-bonus/{declaration_id}/approve
Manage keys: hr.allowance.manage / hr.production_bonus.manage / hr.bonus.manage; approvals: manager/admin.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_HR_ALLOWANCE_MANAGE,
    PERMISSION_HR_BONUS_MANAGE,
    PERMISSION_HR_PRODUCTION_BONUS_MANAGE,
    assert_hr_manager_or_permission,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import _flag_true
from app.database import get_db
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_allowance import (
    HrAllowanceEntry,
    HrAllowanceRule,
    HrBonusAllocationLine,
    HrProductionBonusEntry,
    HrProductionBonusScheme,
)
from app.models.hr_attendance import AttendanceEntry, AttendanceRoster, AttendanceShift
from app.models.hr_payroll import BonusDeclaration
from app.modules.audit.service import log_action
from app.modules.hr_allowances.pay_benefits import benefits_by_employee
from app.modules.hr_leave.leave_days import load_weekend_weekdays
from app.modules.hr_localization import bd_calculations as calc
from app.modules.hr_localization.employee_pay import pay_snapshot
from app.modules.hr_localization.payroll_extras import (
    HR_FESTIVAL_BONUS_ENABLED,
    HR_MEAL_NIGHT_BILLS_ENABLED,
    HR_PRODUCTION_BONUS_ENABLED,
)
from app.modules.hr_localization.rules_router import require_manager_admin
from app.modules.hr_localization.rules_service import effective_rates, effective_rules, lock_tenant
from app.modules.hr_payroll.payroll_calculation_service import piece_output_in_period

router = APIRouter(prefix="/hr", tags=["hr-allowances"])

MAX_RANGE_DAYS = 62


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _perm(db, user, tenant, key):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=key)


def _flag(tenant: Tenant, key: str, label: str) -> None:
    if not _flag_true(tenant.feature_flags, key):
        raise HTTPException(status_code=409, detail=f"{label} is switched off for this company (Settings > Configuration)")


def _iso(v: Any) -> Any:
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    return v


def _row(obj, fields) -> dict:
    return {f: _iso(getattr(obj, f)) for f in fields}


async def _locked(db, model, tenant_id, row_id, label):
    row = (
        await db.execute(
            select(model).where(model.id == row_id, model.tenant_id == tenant_id).with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


def _range(start: date, end: date) -> None:
    if end < start or (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(status_code=400, detail=f"Choose a valid date range of at most {MAX_RANGE_DAYS} days")


# --- Allowance rules ----------------------------------------------------------------------------

RULE_FIELDS = ("id", "code", "name", "bill_type", "eligibility_basis", "threshold_minutes", "amount", "effective_from", "effective_to", "status", "approved_by", "approved_at")
ENTRY_FIELDS = ("id", "employee_id", "work_date", "rule_id", "attendance_entry_id", "amount", "status", "correction_reason", "approved_by", "approved_at", "payroll_run_line_id", "final_settlement_id")


class RuleCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=24)
    name: str = Field(..., min_length=1, max_length=128)
    bill_type: str = Field(..., pattern="^(TIFFIN|LUNCH|DINNER|NIGHT|FRIDAY)$")
    eligibility_basis: str = Field(..., pattern="^(PRESENT|NIGHT_SHIFT|MIN_WORK_MINUTES|MIN_OT_MINUTES|WEEKLY_HOLIDAY)$")
    threshold_minutes: int = Field(default=0, ge=0, le=1440)
    amount: Decimal = Field(..., ge=0, le=Decimal("100000"))
    effective_from: date
    effective_to: date | None = None


@router.get("/allowances/rules")
async def list_rules(tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _perm(db, user, tenant, PERMISSION_HR_ALLOWANCE_MANAGE)
    rows = (await db.execute(select(HrAllowanceRule).where(HrAllowanceRule.tenant_id == tenant.id).order_by(HrAllowanceRule.code))).scalars().all()
    return [_row(r, RULE_FIELDS) for r in rows]


@router.post("/allowances/rules", status_code=status.HTTP_201_CREATED)
async def create_rule(body: RuleCreate, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _perm(db, user, tenant, PERMISSION_HR_ALLOWANCE_MANAGE)
    if body.effective_to and body.effective_to < body.effective_from:
        raise HTTPException(status_code=400, detail="effective_to must be on or after effective_from")
    dup = (await db.execute(select(HrAllowanceRule.id).where(HrAllowanceRule.tenant_id == tenant.id, HrAllowanceRule.code == body.code.strip().upper()))).first()
    if dup:
        raise HTTPException(status_code=409, detail="Rule code already exists")
    row = HrAllowanceRule(tenant_id=tenant.id, code=body.code.strip().upper(), name=body.name.strip(), bill_type=body.bill_type,
                          eligibility_basis=body.eligibility_basis, threshold_minutes=body.threshold_minutes, amount=body.amount,
                          effective_from=body.effective_from, effective_to=body.effective_to, status="DRAFT", created_by=user.id)
    db.add(row)
    await db.flush()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_ALLOWANCE_RULE_CREATED", resource=f"hr.allowance_rule:{row.id}", details=f"{row.code} {row.amount}")
    await db.commit()
    await db.refresh(row)
    return _row(row, RULE_FIELDS)


@router.post("/allowances/rules/{rule_id}/approve")
async def approve_rule(rule_id: int, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    row = await _locked(db, HrAllowanceRule, tenant.id, rule_id, "Allowance rule")
    if row.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Rule is {row.status}")
    row.status, row.approved_by, row.approved_at = "APPROVED", user.id, datetime.utcnow()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_ALLOWANCE_RULE_APPROVED", resource=f"hr.allowance_rule:{row.id}")
    await db.commit()
    await db.refresh(row)
    return _row(row, RULE_FIELDS)


# --- Allowance entries ---------------------------------------------------------------------------


class RangeBody(BaseModel):
    from_date: date
    to_date: date


async def _night_shift_days(db: AsyncSession, tenant_id: int, start: date, end: date) -> set[tuple[int, date]]:
    rows = (
        await db.execute(
            select(AttendanceRoster.employee_id, AttendanceRoster.roster_date)
            .join(AttendanceShift, AttendanceShift.id == AttendanceRoster.shift_id)
            .where(AttendanceRoster.tenant_id == tenant_id, AttendanceRoster.roster_date >= start, AttendanceRoster.roster_date <= end,
                   AttendanceShift.is_night_shift.is_(True), AttendanceRoster.is_week_off.is_(False))
        )
    ).all()
    return {(e, d) for e, d in rows}


def _worked_minutes(entry: AttendanceEntry) -> int:
    start = datetime.combine(entry.attendance_date, entry.in_time)
    end = datetime.combine(entry.attendance_date, entry.out_time)
    if end <= start:
        end += timedelta(days=1)
    return int((end - start).total_seconds() // 60)


async def _eligible(
    db: AsyncSession, tenant: Tenant, start: date, end: date
) -> list[tuple[AttendanceEntry, HrAllowanceRule, Decimal]]:
    """(attendance day, rule, amount) pairs that earn a bill.

    Per-employee switches (``hr_employee_pay_benefits``): a bill switched off is skipped; an own
    amount replaces the rule amount and is paid once per employee, day and bill type even when
    several approved rules of that type match. In / out times are needed only to measure worked
    minutes (MIN_WORK_MINUTES).
    """
    rules = (
        await db.execute(
            select(HrAllowanceRule).where(
                HrAllowanceRule.tenant_id == tenant.id, HrAllowanceRule.status == "APPROVED",
                HrAllowanceRule.effective_from <= end, or_(HrAllowanceRule.effective_to.is_(None), HrAllowanceRule.effective_to >= start),
            ).order_by(HrAllowanceRule.code)
        )
    ).scalars().all()
    if not rules:
        return []
    entries = (
        await db.execute(
            select(AttendanceEntry).where(
                AttendanceEntry.tenant_id == tenant.id, AttendanceEntry.attendance_date >= start, AttendanceEntry.attendance_date <= end,
                AttendanceEntry.status.in_(("PRESENT", "LATE", "HALF_DAY")),
            ).order_by(AttendanceEntry.attendance_date, AttendanceEntry.employee_id).limit(20000)
        )
    ).scalars().all()
    night = await _night_shift_days(db, tenant.id, start, end) if any(r.eligibility_basis == "NIGHT_SHIFT" for r in rules) else set()
    weekend = await load_weekend_weekdays(db, tenant) if any(r.eligibility_basis == "WEEKLY_HOLIDAY" for r in rules) else set()
    switches = await benefits_by_employee(db, tenant.id, {e.employee_id for e in entries})
    out: list[tuple[AttendanceEntry, HrAllowanceRule, Decimal]] = []
    own_amount_paid: set[tuple[int, date, str]] = set()
    for e in entries:
        own = switches.get(e.employee_id, {})
        for r in rules:
            if not (r.effective_from <= e.attendance_date and (r.effective_to is None or e.attendance_date <= r.effective_to)):
                continue
            switch = own.get(r.bill_type)
            if switch is not None and not switch.enabled:
                continue
            basis = r.eligibility_basis
            has_times = e.in_time is not None and e.out_time is not None
            ok = (
                basis == "PRESENT"
                or (basis == "NIGHT_SHIFT" and (e.employee_id, e.attendance_date) in night)
                or (basis == "MIN_WORK_MINUTES" and has_times and _worked_minutes(e) >= r.threshold_minutes)
                or (basis == "MIN_OT_MINUTES" and (e.overtime_minutes or 0) >= r.threshold_minutes)
                or (basis == "WEEKLY_HOLIDAY" and e.attendance_date.weekday() in weekend)
            )
            if not ok:
                continue
            if switch is not None and switch.amount_override is not None:
                key = (e.employee_id, e.attendance_date, r.bill_type)
                if key in own_amount_paid:
                    continue
                own_amount_paid.add(key)
                out.append((e, r, Decimal(switch.amount_override)))
            else:
                out.append((e, r, Decimal(r.amount)))
    return out


@router.post("/allowances/preview")
async def preview_allowances(body: RangeBody, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _perm(db, user, tenant, PERMISSION_HR_ALLOWANCE_MANAGE)
    _range(body.from_date, body.to_date)
    rows = await _eligible(db, tenant, body.from_date, body.to_date)
    totals: dict[str, Decimal] = {}
    for _e, r, amount in rows:
        totals[r.bill_type] = totals.get(r.bill_type, Decimal("0")) + amount
    return {"eligible": len(rows), "totals": {k: str(v) for k, v in totals.items()}}


@router.post("/allowances/generate")
async def generate_allowances(body: RangeBody, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _perm(db, user, tenant, PERMISSION_HR_ALLOWANCE_MANAGE)
    _flag(tenant, HR_MEAL_NIGHT_BILLS_ENABLED, "Tiffin / lunch / dinner / night bills and Friday allowance")
    _range(body.from_date, body.to_date)
    await lock_tenant(db, tenant.id)
    existing_rows = (
        await db.execute(
            select(HrAllowanceEntry.employee_id, HrAllowanceEntry.work_date, HrAllowanceEntry.rule_id, HrAllowanceRule.bill_type)
            .join(HrAllowanceRule, HrAllowanceRule.id == HrAllowanceEntry.rule_id)
            .where(HrAllowanceEntry.tenant_id == tenant.id, HrAllowanceEntry.work_date >= body.from_date,
                   HrAllowanceEntry.work_date <= body.to_date, HrAllowanceEntry.status != "REJECTED")
        )
    ).all()
    existing = {(emp, day, rule_id) for emp, day, rule_id, _t in existing_rows}
    existing_types = {(emp, day, bill_type) for emp, day, _r, bill_type in existing_rows}
    rejected = set(
        (await db.execute(select(HrAllowanceEntry.employee_id, HrAllowanceEntry.work_date, HrAllowanceEntry.rule_id).where(
            HrAllowanceEntry.tenant_id == tenant.id, HrAllowanceEntry.work_date >= body.from_date,
            HrAllowanceEntry.work_date <= body.to_date, HrAllowanceEntry.status == "REJECTED"))).all()
    )
    switches = await benefits_by_employee(db, tenant.id, {emp for emp, _d, _r, _t in existing_rows})
    created = 0
    for e, r, amount in await _eligible(db, tenant, body.from_date, body.to_date):
        if (e.employee_id, e.attendance_date, r.id) in existing or (e.employee_id, e.attendance_date, r.id) in rejected:
            continue
        own = switches.get(e.employee_id, {}).get(r.bill_type)
        if own is not None and own.amount_override is not None and (e.employee_id, e.attendance_date, r.bill_type) in existing_types:
            continue
        db.add(HrAllowanceEntry(tenant_id=tenant.id, employee_id=e.employee_id, work_date=e.attendance_date, rule_id=r.id,
                                attendance_entry_id=e.id, amount=amount, status="PENDING", created_by=user.id))
        created += 1
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_ALLOWANCES_GENERATED", resource="hr.allowances", details=f"{body.from_date}..{body.to_date}: {created}")
    await db.commit()
    return {"created": created}


@router.get("/allowances/entries")
async def list_allowance_entries(
    status_filter: str | None = Query(default=None, alias="status"),
    from_date: date | None = None,
    to_date: date | None = None,
    tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _perm(db, user, tenant, PERMISSION_HR_ALLOWANCE_MANAGE)
    stmt = select(HrAllowanceEntry).where(HrAllowanceEntry.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(HrAllowanceEntry.status == status_filter.upper())
    if from_date:
        stmt = stmt.where(HrAllowanceEntry.work_date >= from_date)
    if to_date:
        stmt = stmt.where(HrAllowanceEntry.work_date <= to_date)
    rows = (await db.execute(stmt.order_by(HrAllowanceEntry.work_date.desc(), HrAllowanceEntry.id).limit(2000))).scalars().all()
    return [_row(r, ENTRY_FIELDS) for r in rows]


class CorrectBody(BaseModel):
    amount: Decimal = Field(..., ge=0, le=Decimal("100000"))
    reason: str = Field(..., min_length=3, max_length=500)


@router.post("/allowances/entries/{entry_id}/correct")
async def correct_allowance(entry_id: int, body: CorrectBody, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _perm(db, user, tenant, PERMISSION_HR_ALLOWANCE_MANAGE)
    row = await _locked(db, HrAllowanceEntry, tenant.id, entry_id, "Allowance entry")
    if row.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"Entry is {row.status}")
    before = row.amount
    row.amount, row.correction_reason = body.amount, body.reason.strip()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_ALLOWANCE_CORRECTED", resource=f"hr.allowance:{row.id}", details=f"{before} -> {body.amount}: {row.correction_reason}")
    await db.commit()
    await db.refresh(row)
    return _row(row, ENTRY_FIELDS)


class IdsBody(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=5000)


async def _approve_many(db, model, tenant, user, ids, action):
    rows = (await db.execute(select(model).where(model.tenant_id == tenant.id, model.id.in_(ids)).with_for_update())).scalars().all()
    if len(rows) != len(set(ids)):
        raise HTTPException(status_code=404, detail="Some entries were not found")
    approved = 0
    for r in rows:
        if r.status == "PENDING":
            r.status, r.approved_by, r.approved_at = "APPROVED", user.id, datetime.utcnow()
            approved += 1
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action=action, resource=model.__tablename__, details=f"{approved} approved")
    await db.commit()
    return {"approved": approved}


@router.post("/allowances/entries/approve")
async def approve_allowances(body: IdsBody, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    return await _approve_many(db, HrAllowanceEntry, tenant, user, body.ids, "HR_ALLOWANCES_APPROVED")


@router.post("/allowances/entries/{entry_id}/reject")
async def reject_allowance(entry_id: int, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _perm(db, user, tenant, PERMISSION_HR_ALLOWANCE_MANAGE)
    row = await _locked(db, HrAllowanceEntry, tenant.id, entry_id, "Allowance entry")
    if row.payroll_run_line_id is not None or row.final_settlement_id is not None or row.status == "PAID":
        raise HTTPException(status_code=409, detail="Entry is already in payroll or a settlement")
    row.status = "REJECTED"
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_ALLOWANCE_REJECTED", resource=f"hr.allowance:{row.id}")
    await db.commit()
    return {"id": row.id, "status": row.status}


# --- Production bonus ----------------------------------------------------------------------------

SCHEME_FIELDS = ("id", "code", "name", "basis", "params", "cap_amount", "effective_from", "effective_to", "status", "approved_by", "approved_at")
PB_FIELDS = ("id", "employee_id", "scheme_id", "period_code", "period_start", "period_end", "source_ref", "quantity", "efficiency_pct", "amount", "trace_json", "status", "payroll_run_line_id", "final_settlement_id")


class SchemeCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=24)
    name: str = Field(..., min_length=1, max_length=128)
    basis: str = Field(..., pattern="^(PIECE|EFFICIENCY|TARGET)$")
    rate_per_piece: Decimal | None = Field(None, ge=0, le=Decimal("1000"))
    target_pieces: int | None = Field(None, ge=1, le=10_000_000)
    efficiency_threshold_pct: Decimal | None = Field(None, gt=0, le=Decimal("300"))
    bonus_amount: Decimal | None = Field(None, ge=0, le=Decimal("1000000"))
    cap_amount: Decimal | None = Field(None, ge=0, le=Decimal("1000000"))
    effective_from: date
    effective_to: date | None = None


@router.get("/production-bonus/schemes")
async def list_schemes(tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _perm(db, user, tenant, PERMISSION_HR_PRODUCTION_BONUS_MANAGE)
    rows = (await db.execute(select(HrProductionBonusScheme).where(HrProductionBonusScheme.tenant_id == tenant.id).order_by(HrProductionBonusScheme.code))).scalars().all()
    return [_row(r, SCHEME_FIELDS) for r in rows]


@router.post("/production-bonus/schemes", status_code=status.HTTP_201_CREATED)
async def create_scheme(body: SchemeCreate, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _perm(db, user, tenant, PERMISSION_HR_PRODUCTION_BONUS_MANAGE)
    need = {"PIECE": ("rate_per_piece",), "TARGET": ("target_pieces", "bonus_amount"), "EFFICIENCY": ("efficiency_threshold_pct", "bonus_amount")}[body.basis]
    missing = [k for k in need if getattr(body, k) is None]
    if missing:
        raise HTTPException(status_code=400, detail=f"{body.basis} scheme needs: {', '.join(missing)}")
    code = body.code.strip().upper()
    if (await db.execute(select(HrProductionBonusScheme.id).where(HrProductionBonusScheme.tenant_id == tenant.id, HrProductionBonusScheme.code == code))).first():
        raise HTTPException(status_code=409, detail="Scheme code already exists")
    params = {k: str(getattr(body, k)) for k in ("rate_per_piece", "target_pieces", "efficiency_threshold_pct", "bonus_amount") if getattr(body, k) is not None}
    row = HrProductionBonusScheme(tenant_id=tenant.id, code=code, name=body.name.strip(), basis=body.basis, params=params,
                                  cap_amount=body.cap_amount, effective_from=body.effective_from, effective_to=body.effective_to,
                                  status="DRAFT", created_by=user.id)
    db.add(row)
    await db.flush()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_PRODUCTION_SCHEME_CREATED", resource=f"hr.production_scheme:{row.id}", details=f"{code} {body.basis}")
    await db.commit()
    await db.refresh(row)
    return _row(row, SCHEME_FIELDS)


@router.post("/production-bonus/schemes/{scheme_id}/approve")
async def approve_scheme(scheme_id: int, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    row = await _locked(db, HrProductionBonusScheme, tenant.id, scheme_id, "Scheme")
    if row.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Scheme is {row.status}")
    row.status, row.approved_by, row.approved_at = "APPROVED", user.id, datetime.utcnow()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_PRODUCTION_SCHEME_APPROVED", resource=f"hr.production_scheme:{row.id}")
    await db.commit()
    await db.refresh(row)
    return _row(row, SCHEME_FIELDS)


def scheme_amount(scheme: HrProductionBonusScheme, pieces: Decimal, efficiency: Decimal | None) -> tuple[Decimal, dict]:
    p = scheme.params or {}
    if scheme.basis == "PIECE":
        amount = pieces * Decimal(p["rate_per_piece"])
        why = f"{pieces} pieces x {p['rate_per_piece']}"
    elif scheme.basis == "TARGET":
        hit = pieces >= Decimal(p["target_pieces"])
        amount = Decimal(p["bonus_amount"]) if hit else Decimal("0")
        why = f"{pieces} pieces vs target {p['target_pieces']}"
    else:
        hit = efficiency is not None and efficiency >= Decimal(p["efficiency_threshold_pct"])
        amount = Decimal(p["bonus_amount"]) if hit else Decimal("0")
        why = f"efficiency {efficiency}% vs {p['efficiency_threshold_pct']}%"
    if scheme.cap_amount is not None:
        amount = min(amount, Decimal(scheme.cap_amount))
    return calc.money(amount), {"rule": why, "basis": scheme.basis}


class ProductionGenerate(BaseModel):
    scheme_id: int
    period_code: str = Field(..., min_length=1, max_length=16)
    period_start: date
    period_end: date


@router.post("/production-bonus/generate")
async def generate_production_bonus(body: ProductionGenerate, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _perm(db, user, tenant, PERMISSION_HR_PRODUCTION_BONUS_MANAGE)
    _flag(tenant, HR_PRODUCTION_BONUS_ENABLED, "Production bonus")
    _range(body.period_start, body.period_end)
    scheme = await db.get(HrProductionBonusScheme, body.scheme_id)
    if scheme is None or scheme.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Scheme not found")
    if scheme.status != "APPROVED":
        raise HTTPException(status_code=409, detail="Approve the scheme first")
    await lock_tenant(db, tenant.id)
    done = set((await db.execute(select(HrProductionBonusEntry.employee_id).where(
        HrProductionBonusEntry.tenant_id == tenant.id, HrProductionBonusEntry.scheme_id == scheme.id,
        HrProductionBonusEntry.period_code == body.period_code))).scalars())
    employees = (await db.execute(select(Employee).where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True)).limit(5000))).scalars().all()
    created = 0
    for emp in employees:
        if emp.id in done:
            continue
        pieces, earned_minutes = await piece_output_in_period(db, tenant_id=tenant.id, employee_code=emp.employee_code, start=body.period_start, end=body.period_end)
        if pieces <= 0:
            continue
        efficiency = None
        if scheme.basis == "EFFICIENCY":
            entries = (await db.execute(select(AttendanceEntry).where(
                AttendanceEntry.tenant_id == tenant.id, AttendanceEntry.employee_id == emp.id,
                AttendanceEntry.attendance_date >= body.period_start, AttendanceEntry.attendance_date <= body.period_end,
                AttendanceEntry.in_time.is_not(None), AttendanceEntry.out_time.is_not(None)))).scalars().all()
            worked = sum(_worked_minutes(e) for e in entries)
            efficiency = calc.money(earned_minutes / Decimal(worked) * 100) if worked else Decimal("0")
        amount, why = scheme_amount(scheme, pieces, efficiency)
        db.add(HrProductionBonusEntry(
            tenant_id=tenant.id, employee_id=emp.id, scheme_id=scheme.id, period_code=body.period_code,
            period_start=body.period_start, period_end=body.period_end, source_ref=f"scan:{body.period_start}:{body.period_end}",
            quantity=pieces, efficiency_pct=efficiency, amount=amount,
            trace_json={**why, "pieces": str(pieces), "earned_minutes": str(earned_minutes)}, status="PENDING", created_by=user.id,
        ))
        created += 1
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_PRODUCTION_BONUS_GENERATED", resource=f"hr.production_scheme:{scheme.id}", details=f"{body.period_code}: {created}")
    await db.commit()
    return {"created": created}


@router.get("/production-bonus/entries")
async def list_production_entries(
    period_code: str | None = None,
    tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _perm(db, user, tenant, PERMISSION_HR_PRODUCTION_BONUS_MANAGE)
    stmt = select(HrProductionBonusEntry).where(HrProductionBonusEntry.tenant_id == tenant.id)
    if period_code:
        stmt = stmt.where(HrProductionBonusEntry.period_code == period_code)
    rows = (await db.execute(stmt.order_by(HrProductionBonusEntry.id.desc()).limit(2000))).scalars().all()
    return [_row(r, PB_FIELDS) for r in rows]


@router.post("/production-bonus/entries/approve")
async def approve_production_entries(body: IdsBody, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    return await _approve_many(db, HrProductionBonusEntry, tenant, user, body.ids, "HR_PRODUCTION_BONUS_APPROVED")


# --- Festival bonus ------------------------------------------------------------------------------

LINE_FIELDS = ("id", "bonus_declaration_id", "employee_id", "eligible", "eligibility_reason", "basis_amount", "amount", "status", "payroll_run_line_id", "final_settlement_id")


class AllocateBody(BaseModel):
    cutoff_date: date
    percent_of_basic: Decimal = Field(default=Decimal("100"), gt=0, le=Decimal("100"))


async def _declaration(db, tenant_id, declaration_id, *, lock=False) -> BonusDeclaration:
    if lock:
        return await _locked(db, BonusDeclaration, tenant_id, declaration_id, "Bonus declaration")
    row = await db.get(BonusDeclaration, declaration_id)
    if row is None or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Bonus declaration not found")
    return row


@router.post("/festival-bonus/{declaration_id}/allocate")
async def allocate_festival_bonus(declaration_id: int, body: AllocateBody, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Company festival bonus: workers with at least one year of service at the cut-off get a share of
    monthly basic (default 100%). Rule 111(5) is pending official verification, so this is company policy."""
    await _perm(db, user, tenant, PERMISSION_HR_BONUS_MANAGE)
    _flag(tenant, HR_FESTIVAL_BONUS_ENABLED, "Festival bonus")
    dec = await _declaration(db, tenant.id, declaration_id, lock=True)
    if dec.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Declaration is {dec.status}")
    eff = await effective_rules(db, tenant.id, body.cutoff_date)
    rates = {r.rate_code: r for r in await effective_rates(db, tenant.id, eff.rule_set.id if eff.rule_set else None, body.cutoff_date)}
    existing = {l.employee_id: l for l in (await db.execute(select(HrBonusAllocationLine).where(
        HrBonusAllocationLine.tenant_id == tenant.id, HrBonusAllocationLine.bonus_declaration_id == dec.id).with_for_update())).scalars()}
    employees = (await db.execute(select(Employee).where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True)).limit(5000))).scalars().all()
    eligible_count = 0
    for emp in employees:
        snap = await pay_snapshot(db, tenant.id, emp, body.cutoff_date, rates)
        one_year = emp.joining_date is not None and calc.add_months(emp.joining_date, 12) <= body.cutoff_date
        amount = calc.money(snap.basic * body.percent_of_basic / 100) if one_year and snap.basic > 0 else Decimal("0")
        reason = None if one_year else "Less than one year of continuous service at the cut-off date"
        if one_year and snap.basic <= 0:
            reason = "No basic wage on the cut-off date"
        line = existing.get(emp.id)
        if line is None:
            line = HrBonusAllocationLine(tenant_id=tenant.id, bonus_declaration_id=dec.id, employee_id=emp.id, created_by=user.id)
            db.add(line)
        line.eligible, line.eligibility_reason, line.basis_amount, line.amount = amount > 0, reason, snap.basic, amount
        line.status = "PENDING" if amount > 0 else "EXCLUDED"
        eligible_count += 1 if amount > 0 else 0
    dec.eligibility_criteria = {"cutoff_date": body.cutoff_date.isoformat(), "percent_of_basic": str(body.percent_of_basic), "min_service_months": 12}
    dec.amount_or_pct = str(body.percent_of_basic)
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_FESTIVAL_BONUS_ALLOCATED", resource=f"hr.bonus_declaration:{dec.id}", details=f"{eligible_count} eligible")
    await db.commit()
    return {"eligible": eligible_count, "employees": len(employees)}


@router.get("/festival-bonus/{declaration_id}/lines")
async def list_bonus_lines(declaration_id: int, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _perm(db, user, tenant, PERMISSION_HR_BONUS_MANAGE)
    dec = await _declaration(db, tenant.id, declaration_id)
    rows = (await db.execute(select(HrBonusAllocationLine).where(HrBonusAllocationLine.tenant_id == tenant.id, HrBonusAllocationLine.bonus_declaration_id == dec.id).order_by(HrBonusAllocationLine.employee_id))).scalars().all()
    return [_row(r, LINE_FIELDS) for r in rows]


@router.post("/festival-bonus/{declaration_id}/approve")
async def approve_festival_bonus(declaration_id: int, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    _flag(tenant, HR_FESTIVAL_BONUS_ENABLED, "Festival bonus")
    dec = await _declaration(db, tenant.id, declaration_id, lock=True)
    if dec.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Declaration is {dec.status}")
    lines = (await db.execute(select(HrBonusAllocationLine).where(HrBonusAllocationLine.tenant_id == tenant.id, HrBonusAllocationLine.bonus_declaration_id == dec.id).with_for_update())).scalars().all()
    if not lines:
        raise HTTPException(status_code=409, detail="Allocate the bonus first")
    approved = 0
    for line in lines:
        if line.status == "PENDING":
            line.status, line.approved_by, line.approved_at = "APPROVED", user.id, datetime.utcnow()
            approved += 1
    dec.status = "APPROVED"
    total = sum((Decimal(l.amount) for l in lines if l.status == "APPROVED"), Decimal("0"))
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_FESTIVAL_BONUS_APPROVED", resource=f"hr.bonus_declaration:{dec.id}", details=f"{approved} lines, total {total}")
    await db.commit()
    return {"approved": approved, "total": str(calc.money(total))}
