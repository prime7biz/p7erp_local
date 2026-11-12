"""Separation, clearance and final settlement.

GET  /hr/separations                                  hr.final_settlement.manage
POST /hr/separations                                  hr.final_settlement.manage (deemed resignation only via an absence case)
POST /hr/separations/{id}/approve                     manager/admin (sets the employee's exit date)
POST /hr/separations/{id}/cancel                      hr.final_settlement.manage (before settlement)
GET  /hr/separations/{id}/clearance                   hr.final_settlement.manage
POST /hr/separations/{id}/clearance                   hr.final_settlement.manage
POST /hr/clearance-items/{id}/sign-off                hr.final_settlement.manage
POST /hr/separations/{id}/settlement/preview          hr.final_settlement.manage (no writes)
POST /hr/separations/{id}/settlement                  hr.final_settlement.manage (create / recalculate DRAFT)
GET  /hr/final-settlements/{id}                       hr.final_settlement.manage
POST /hr/final-settlements/{id}/approve               manager/admin (clearance must be complete)
POST /hr/final-settlements/{id}/post                  manager/admin (balanced voucher, once)
POST /hr/final-settlements/{id}/mark-paid             manager/admin
POST /hr/final-settlements/{id}/reverse               manager/admin (new reversal voucher via finance)

Voucher: Dr salary expense (gross - notice recovery - other recoveries); Cr salary payable (net);
Cr advance receivable (advance recovery). Debits always equal credits.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.permissions import PERMISSION_HR_FINAL_SETTLEMENT_MANAGE, assert_hr_manager_or_permission
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import AccountingPeriod, ChartOfAccount, Tenant, User, Voucher, VoucherLine
from app.models.hr import Employee
from app.models.hr_lifecycle import HrClearanceItem, HrFinalSettlement, HrSeparation
from app.models.hr_payroll import EmployeeAdvance, PayrollAccountingConfig
from app.modules.audit.service import log_action
from app.modules.hr_localization import bd_calculations as calc
from app.modules.hr_localization.payroll_extras import SOURCES
from app.modules.hr_localization.rules_router import require_manager_admin
from app.modules.hr_separation.settlement_service import apply_values, compute_settlement, link_settlement_extras

router = APIRouter(prefix="/hr", tags=["hr-separation"])

SEPARATION_TYPES = tuple(t for t in calc.SEPARATION_TYPES if t != "DEEMED_RESIGNATION")


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _guard(db: AsyncSession, user: User, tenant: Tenant) -> None:
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_FINAL_SETTLEMENT_MANAGE)


def _iso(v: Any) -> Any:
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    return v


SEP_FIELDS = (
    "id", "employee_id", "separation_type", "request_date", "last_working_date", "effective_date", "notice_days_required",
    "notice_days_served", "permanent", "monthly_rated", "misconduct_no_compensation", "death_at_work", "absence_case_id",
    "reason", "status", "approved_by", "approved_at", "created_at",
)
FS_FIELDS = (
    "id", "separation_id", "employee_id", "salary_from", "salary_to", "salary_days", "salary_amount", "overtime_amount",
    "allowances_amount", "leave_encashment_days", "leave_encashment_amount", "service_benefit_amount", "notice_pay_amount",
    "notice_recovery_amount", "advance_recovery_amount", "other_deductions_amount", "gross_amount", "deduction_amount",
    "net_amount", "calculation_trace", "status", "approved_by", "approved_at", "voucher_id", "reversal_voucher_id",
    "posted_at", "paid_at", "payment_reference",
)


def _out(obj, fields) -> dict:
    return {f: _iso(getattr(obj, f)) for f in fields}


async def _locked(db: AsyncSession, model, tenant_id: int, row_id: int, label: str):
    row = (
        await db.execute(
            select(model).where(model.id == row_id, model.tenant_id == tenant_id).with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


class SeparationCreate(BaseModel):
    employee_id: int
    separation_type: str
    request_date: date
    last_working_date: date
    effective_date: date
    notice_days_served: int = Field(default=0, ge=0, le=365)
    permanent: bool = True
    monthly_rated: bool = True
    misconduct_no_compensation: bool = False
    death_at_work: bool = False
    reason: str | None = Field(None, max_length=5000)


class ClearanceCreate(BaseModel):
    department: str = Field(..., min_length=1, max_length=64)
    item: str = Field(..., min_length=1, max_length=128)
    amount_recoverable: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("100000000"))


class ClearanceSignOff(BaseModel):
    status: str = Field(..., pattern="^(CLEARED|WAIVED)$")
    amount_recoverable: Decimal | None = Field(None, ge=0, le=Decimal("100000000"))
    evidence_ref: str | None = Field(None, max_length=255)


class PaidBody(BaseModel):
    payment_reference: str = Field(..., min_length=1, max_length=64)


class ReverseBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=2000)


@router.get("/separations")
async def list_separations(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    rows = (await db.execute(select(HrSeparation).where(HrSeparation.tenant_id == tenant.id).order_by(HrSeparation.id.desc()).limit(500))).scalars().all()
    settlements = {
        fs.separation_id: fs
        for fs in (
            await db.execute(
                select(HrFinalSettlement).where(
                    HrFinalSettlement.tenant_id == tenant.id,
                    HrFinalSettlement.separation_id.in_([r.id for r in rows] or [0]),
                )
            )
        ).scalars()
    }
    out = []
    for r in rows:
        fs = settlements.get(r.id)
        out.append({
            **_out(r, SEP_FIELDS),
            "settlement_id": fs.id if fs else None,
            "settlement_status": fs.status if fs else None,
            "settlement_net_amount": str(fs.net_amount) if fs and fs.net_amount is not None else None,
        })
    return out


@router.post("/separations", status_code=status.HTTP_201_CREATED)
async def create_separation(
    body: SeparationCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    if body.separation_type not in SEPARATION_TYPES:
        raise HTTPException(status_code=400, detail="Deemed resignation is recorded only through an absence case (s.27(3A)); "
                            f"otherwise use one of {', '.join(SEPARATION_TYPES)}")
    if body.effective_date < body.last_working_date:
        raise HTTPException(status_code=400, detail="The effective date must be on or after the last working day")
    emp = (
        await db.execute(
            select(Employee).where(Employee.id == body.employee_id, Employee.tenant_id == tenant.id)
            .with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    if emp.joining_date and body.last_working_date < emp.joining_date:
        raise HTTPException(status_code=400, detail="Last working day is before the joining date")
    open_sep = (
        await db.execute(
            select(HrSeparation.id).where(
                HrSeparation.tenant_id == tenant.id, HrSeparation.employee_id == emp.id, HrSeparation.status.in_(("DRAFT", "APPROVED"))
            )
        )
    ).first()
    if open_sep:
        raise HTTPException(status_code=409, detail=f"Employee already has an open separation #{open_sep[0]}")
    required = calc.notice_days(body.separation_type, permanent=body.permanent, monthly_rated=body.monthly_rated)
    sep = HrSeparation(
        tenant_id=tenant.id, employee_id=emp.id, separation_type=body.separation_type, request_date=body.request_date,
        last_working_date=body.last_working_date, effective_date=body.effective_date, notice_days_required=required,
        notice_days_served=body.notice_days_served, permanent=body.permanent, monthly_rated=body.monthly_rated,
        misconduct_no_compensation=body.misconduct_no_compensation, death_at_work=body.death_at_work,
        reason=(body.reason or "").strip() or None, status="DRAFT", created_by=user.id,
    )
    db.add(sep)
    await db.flush()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_SEPARATION_CREATED", resource=f"hr.separation:{sep.id}", details=body.separation_type)
    await db.commit()
    await db.refresh(sep)
    return _out(sep, SEP_FIELDS)


@router.post("/separations/{sep_id}/approve")
async def approve_separation(
    sep_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    sep = await _locked(db, HrSeparation, tenant.id, sep_id, "Separation")
    if sep.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Separation is {sep.status}")
    emp = await _locked(db, Employee, tenant.id, sep.employee_id, "Employee")
    sep.status, sep.approved_by, sep.approved_at = "APPROVED", user.id, datetime.utcnow()
    emp.exit_date = sep.effective_date
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_SEPARATION_APPROVED", resource=f"hr.separation:{sep.id}", details=f"exit {sep.effective_date}")
    await db.commit()
    await db.refresh(sep)
    return _out(sep, SEP_FIELDS)


@router.post("/separations/{sep_id}/cancel")
async def cancel_separation(
    sep_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    sep = await _locked(db, HrSeparation, tenant.id, sep_id, "Separation")
    fs = (await db.execute(select(HrFinalSettlement).where(HrFinalSettlement.tenant_id == tenant.id, HrFinalSettlement.separation_id == sep.id))).scalar_one_or_none()
    if sep.status in ("SETTLED", "CANCELLED") or (fs is not None and fs.status != "DRAFT"):
        raise HTTPException(status_code=409, detail="A separation with an approved or posted settlement cannot be cancelled")
    if fs is not None:
        await link_settlement_extras(db, tenant.id, fs.id, {})
        await db.delete(fs)
    if sep.status == "APPROVED":
        emp = await _locked(db, Employee, tenant.id, sep.employee_id, "Employee")
        if emp.exit_date == sep.effective_date:
            emp.exit_date = None
    sep.status = "CANCELLED"
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_SEPARATION_CANCELLED", resource=f"hr.separation:{sep.id}")
    await db.commit()
    await db.refresh(sep)
    return _out(sep, SEP_FIELDS)


# --- Clearance -----------------------------------------------------------------------------------


@router.get("/separations/{sep_id}/clearance")
async def list_clearance(
    sep_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    sep = await db.get(HrSeparation, sep_id)
    if sep is None or sep.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Separation not found")
    rows = (await db.execute(select(HrClearanceItem).where(HrClearanceItem.tenant_id == tenant.id, HrClearanceItem.separation_id == sep.id).order_by(HrClearanceItem.id))).scalars().all()
    return [{"id": r.id, "department": r.department, "item": r.item, "status": r.status, "amount_recoverable": str(r.amount_recoverable),
             "evidence_ref": r.evidence_ref, "signed_off_by": r.signed_off_by, "signed_off_at": _iso(r.signed_off_at)} for r in rows]


@router.post("/separations/{sep_id}/clearance", status_code=status.HTTP_201_CREATED)
async def add_clearance(
    sep_id: int,
    body: ClearanceCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    sep = await _locked(db, HrSeparation, tenant.id, sep_id, "Separation")
    if sep.status not in ("DRAFT", "APPROVED"):
        raise HTTPException(status_code=409, detail=f"Separation is {sep.status}")
    item = HrClearanceItem(tenant_id=tenant.id, separation_id=sep.id, department=body.department.strip(), item=body.item.strip(),
                           amount_recoverable=body.amount_recoverable, status="PENDING")
    db.add(item)
    await db.flush()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_CLEARANCE_ITEM_ADDED", resource=f"hr.separation:{sep.id}", details=item.item)
    await db.commit()
    return {"id": item.id, "status": item.status}


@router.post("/clearance-items/{item_id}/sign-off")
async def sign_off_clearance(
    item_id: int,
    body: ClearanceSignOff,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    item = await _locked(db, HrClearanceItem, tenant.id, item_id, "Clearance item")
    if item.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"Item is {item.status}")
    item.status, item.signed_off_by, item.signed_off_at = body.status, user.id, datetime.utcnow()
    if body.amount_recoverable is not None:
        item.amount_recoverable = body.amount_recoverable
    item.evidence_ref = (body.evidence_ref or "").strip() or None
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_CLEARANCE_SIGNED_OFF", resource=f"hr.clearance:{item.id}", details=body.status)
    await db.commit()
    return {"id": item.id, "status": item.status}


# --- Final settlement ----------------------------------------------------------------------------


async def _sep_emp(db: AsyncSession, tenant: Tenant, sep_id: int, *, lock: bool):
    sep = await _locked(db, HrSeparation, tenant.id, sep_id, "Separation") if lock else await db.get(HrSeparation, sep_id)
    if sep is None or sep.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Separation not found")
    emp = await db.get(Employee, sep.employee_id)
    if emp is None or emp.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Employee not found")
    return sep, emp


@router.post("/separations/{sep_id}/settlement/preview")
async def preview_settlement(
    sep_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    sep, emp = await _sep_emp(db, tenant, sep_id, lock=False)
    existing = (await db.execute(select(HrFinalSettlement.id).where(HrFinalSettlement.tenant_id == tenant.id, HrFinalSettlement.separation_id == sep.id))).scalar_one_or_none()
    comp = await compute_settlement(db, tenant, sep, emp, settlement_id=existing)
    return {**{k: _iso(v) for k, v in comp.values.items()}, "calculation_trace": comp.trace, "included_extras": comp.extra_ids}


@router.post("/separations/{sep_id}/settlement")
async def create_or_recalculate_settlement(
    sep_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    sep, emp = await _sep_emp(db, tenant, sep_id, lock=True)
    if sep.status != "APPROVED":
        raise HTTPException(status_code=409, detail="Approve the separation first")
    await _locked(db, Employee, tenant.id, emp.id, "Employee")
    from app.common.tenant_feature_keys import is_hr_bd_salary_tds_enabled
    from app.modules.hr_localization import bd_salary_tds as tds_engine

    if is_hr_bd_salary_tds_enabled(tenant.feature_flags) and tds_engine.SETTLEMENT_CLASSIFICATION_VERSION is None:
        # Fail closed: settlement salary tax needs an approved taxable / exempt classification of each earning.
        raise HTTPException(
            status_code=409,
            detail="Final-settlement income tax rules are not approved yet; the settlement cannot be calculated while salary TDS is on",
        )
    fs = (
        await db.execute(
            select(HrFinalSettlement).where(HrFinalSettlement.tenant_id == tenant.id, HrFinalSettlement.separation_id == sep.id)
            .with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if fs is not None and fs.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Settlement is {fs.status}; it can no longer be recalculated")
    comp = await compute_settlement(db, tenant, sep, emp, settlement_id=fs.id if fs else None)
    if fs is None:
        fs = HrFinalSettlement(tenant_id=tenant.id, separation_id=sep.id, employee_id=emp.id, status="DRAFT", created_by=user.id)
        db.add(fs)
    apply_values(fs, comp)
    await db.flush()
    await link_settlement_extras(db, tenant.id, fs.id, comp.extra_ids)
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_FINAL_SETTLEMENT_CALCULATED",
                     resource=f"hr.final_settlement:{fs.id}", details=f"net {fs.net_amount}")
    await db.commit()
    await db.refresh(fs)
    return _out(fs, FS_FIELDS)


@router.get("/final-settlements/{fs_id}")
async def get_settlement(
    fs_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    fs = await db.get(HrFinalSettlement, fs_id)
    if fs is None or fs.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Final settlement not found")
    return _out(fs, FS_FIELDS)


@router.post("/final-settlements/{fs_id}/approve")
async def approve_settlement(
    fs_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    fs = await _locked(db, HrFinalSettlement, tenant.id, fs_id, "Final settlement")
    if fs.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Settlement is {fs.status}")
    pending = (
        await db.execute(
            select(HrClearanceItem.id).where(
                HrClearanceItem.tenant_id == tenant.id, HrClearanceItem.separation_id == fs.separation_id, HrClearanceItem.status == "PENDING"
            )
        )
    ).first()
    if pending:
        raise HTTPException(status_code=409, detail="Clearance is not complete")
    fs.status, fs.approved_by, fs.approved_at = "APPROVED", user.id, datetime.utcnow()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_FINAL_SETTLEMENT_APPROVED", resource=f"hr.final_settlement:{fs.id}", details=str(fs.net_amount))
    await db.commit()
    await db.refresh(fs)
    return _out(fs, FS_FIELDS)


@router.post("/final-settlements/{fs_id}/post")
async def post_settlement(
    fs_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.finance.fiscal_year import fiscal_year_of, tenant_fy_start_month
    from app.modules.finance.posting_core import apply_voucher_to_books
    from app.modules.finance.voucher_controls import allocate_series_voucher_number, finalize_posted_voucher_metadata
    from app.modules.hr_payroll.account_resolver import resolve_payroll_accounts

    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    # Lock first, then check the guard: a second click finds voucher_id set and gets the same result.
    fs = await _locked(db, HrFinalSettlement, tenant.id, fs_id, "Final settlement")
    if fs.voucher_id is not None:
        return _out(fs, FS_FIELDS)
    if fs.status != "APPROVED":
        raise HTTPException(status_code=409, detail="Only an APPROVED settlement can be posted")
    voucher_date = today_local(tenant)
    period = (
        await db.execute(
            select(AccountingPeriod).where(
                AccountingPeriod.tenant_id == tenant.id, AccountingPeriod.start_date <= voucher_date, AccountingPeriod.end_date >= voucher_date
            ).order_by(AccountingPeriod.start_date.desc()).limit(1)
        )
    ).scalars().first()
    if period is None:
        raise HTTPException(status_code=400, detail="No accounting period covers today's date")
    if period.is_closed:
        raise HTTPException(status_code=400, detail="Accounting period is closed; settlement posting blocked")
    gross, net = Decimal(fs.gross_amount), Decimal(fs.net_amount)
    advance = Decimal(fs.advance_recovery_amount)
    expense_amount = net + advance
    if expense_amount <= 0:
        raise HTTPException(status_code=400, detail="Nothing to post (settlement amount is zero)")
    acc = await resolve_payroll_accounts(db, tenant.id)
    if not acc["expense"] or not acc["payable"]:
        raise HTTPException(status_code=400, detail="Set the salary expense and salary payable accounts in Payroll accounting settings")
    advance_account = None
    if advance > 0:
        cfg = (await db.execute(select(PayrollAccountingConfig).where(PayrollAccountingConfig.tenant_id == tenant.id).limit(1))).scalar_one_or_none()
        advance_account = cfg.advance_receivable_account_id if cfg else None
        if not advance_account:
            raise HTTPException(status_code=400, detail="Set the advance receivable account in Payroll accounting settings")
    for account_id in filter(None, (acc["expense"], acc["payable"], advance_account)):
        a = await db.get(ChartOfAccount, account_id)
        if a is None or a.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail=f"Account {account_id} not found")
    emp = await db.get(Employee, fs.employee_id)
    vnum, seq, key, fy = await allocate_series_voucher_number(
        db, tenant_id=tenant.id, voucher_date=voucher_date, voucher_type="JOURNAL", branch_code="MAIN"
    )
    voucher = Voucher(
        tenant_id=tenant.id, voucher_number=vnum, voucher_type="JOURNAL", voucher_date=voucher_date, status="POSTED",
        description=f"Final settlement {emp.employee_code if emp else fs.employee_id}", reference=f"FS-{fs.id}",
        branch_code="MAIN", fiscal_year=fiscal_year_of(voucher_date, await tenant_fy_start_month(db, tenant.id)) or fy,
        series_sequence=seq, number_series_key=key, source_module="HR_SETTLEMENT", source_module_ref=f"settlement:{fs.id}",
        allow_manual_edit=False, created_by=user.id,
    )
    db.add(voucher)
    await db.flush()
    entries = [(acc["expense"], "DEBIT", expense_amount, "Final settlement expense"), (acc["payable"], "CREDIT", net, "Final settlement payable")]
    if advance > 0:
        entries.append((advance_account, "CREDIT", advance, "Advance recovered in final settlement"))
    for account_id, side, amount, note in entries:
        if amount > 0:
            db.add(VoucherLine(tenant_id=tenant.id, voucher_id=voucher.id, account_id=account_id, entry_type=side,
                               amount=f"{amount:.2f}", base_amount=f"{amount:.2f}", notes=note))
    await db.flush()
    vlines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())
    await finalize_posted_voucher_metadata(db, tenant.id, voucher, vlines, strict_duplicate_check=True)
    await apply_voucher_to_books(db, tenant.id, voucher, vlines)
    fs.voucher_id, fs.status, fs.posted_by, fs.posted_at = voucher.id, "POSTED", user.id, datetime.utcnow()
    if advance > 0:
        allocations = await _recover_advances(db, tenant.id, fs.employee_id, advance)
        fs.calculation_trace = {**(fs.calculation_trace or {}), "advance_recoveries": allocations}
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_FINAL_SETTLEMENT_POSTED",
                     resource=f"hr.final_settlement:{fs.id}", details=f"voucher {vnum} gross {gross} net {net}")
    await db.commit()
    await db.refresh(fs)
    return _out(fs, FS_FIELDS)


async def _recover_advances(db: AsyncSession, tenant_id: int, employee_id: int, amount: Decimal) -> list[dict[str, str]]:
    """Recover oldest advances first; returns what was taken from each so a reversal can put it back."""
    rows = (
        await db.execute(
            select(EmployeeAdvance).where(
                EmployeeAdvance.tenant_id == tenant_id, EmployeeAdvance.employee_id == employee_id, EmployeeAdvance.status == "ACTIVE"
            ).order_by(EmployeeAdvance.advance_date).with_for_update()
        )
    ).scalars().all()
    left = amount
    allocations: list[dict[str, str]] = []
    for adv in rows:
        if left <= 0:
            break
        out = Decimal(str(adv.outstanding or 0))
        take = min(out, left)
        if take <= 0:
            continue
        adv.outstanding = str(calc.money(out - take))
        adv.total_recovered = str(calc.money(Decimal(str(adv.total_recovered or 0)) + take))
        if out - take <= 0:
            adv.status = "CLOSED"
        allocations.append({"advance_id": str(adv.id), "amount": str(calc.money(take))})
        left -= take
    return allocations


async def _restore_advances(db: AsyncSession, tenant_id: int, employee_id: int, allocations: list[dict[str, Any]]) -> None:
    ids = [int(a["advance_id"]) for a in allocations]
    rows = {
        r.id: r
        for r in (
            await db.execute(
                select(EmployeeAdvance).where(
                    EmployeeAdvance.tenant_id == tenant_id, EmployeeAdvance.employee_id == employee_id, EmployeeAdvance.id.in_(ids or [0])
                ).with_for_update()
            )
        ).scalars()
    }
    for a in allocations:
        adv = rows.get(int(a["advance_id"]))
        if adv is None:
            continue
        back = Decimal(str(a["amount"]))
        adv.outstanding = str(calc.money(Decimal(str(adv.outstanding or 0)) + back))
        adv.total_recovered = str(calc.money(max(Decimal("0"), Decimal(str(adv.total_recovered or 0)) - back)))
        if Decimal(str(adv.outstanding)) > 0 and adv.status == "CLOSED":
            adv.status = "ACTIVE"


@router.post("/final-settlements/{fs_id}/mark-paid")
async def mark_settlement_paid(
    fs_id: int,
    body: PaidBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    fs = await _locked(db, HrFinalSettlement, tenant.id, fs_id, "Final settlement")
    if fs.status != "POSTED":
        raise HTTPException(status_code=409, detail="Post the settlement before marking it paid")
    fs.status, fs.paid_at, fs.payment_reference = "PAID", datetime.utcnow(), body.payment_reference.strip()
    sep = await _locked(db, HrSeparation, tenant.id, fs.separation_id, "Separation")
    sep.status = "SETTLED"
    emp = await _locked(db, Employee, tenant.id, fs.employee_id, "Employee")
    emp.is_active = False
    for model in SOURCES.values():
        await db.execute(update(model).where(model.tenant_id == tenant.id, model.final_settlement_id == fs.id).values(status="PAID"))
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_FINAL_SETTLEMENT_PAID", resource=f"hr.final_settlement:{fs.id}", details=fs.payment_reference)
    await db.commit()
    await db.refresh(fs)
    return _out(fs, FS_FIELDS)


@router.post("/final-settlements/{fs_id}/reverse")
async def reverse_settlement(
    fs_id: int,
    body: ReverseBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reverse with a new voucher (finance reversal rules apply). The HR side is undone in the same
    transaction: recovered advances are restored and claimed extras are released for payment again."""
    from app.modules.finance.router import VoucherReverseBody, reverse_voucher

    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    fs = await _locked(db, HrFinalSettlement, tenant.id, fs_id, "Final settlement")
    if fs.status not in ("POSTED", "PAID") or fs.voucher_id is None:
        raise HTTPException(status_code=409, detail="Only a posted settlement can be reversed")
    fs_id_value, voucher_id = fs.id, fs.voucher_id
    fs.status = "REVERSED"
    await _restore_advances(db, tenant.id, fs.employee_id, list((fs.calculation_trace or {}).get("advance_recoveries") or []))
    released = 0
    for model in SOURCES.values():
        result = await db.execute(
            update(model)
            .where(model.tenant_id == tenant.id, model.final_settlement_id == fs_id_value)
            .values(final_settlement_id=None, status="APPROVED")
        )
        released += result.rowcount or 0
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_FINAL_SETTLEMENT_REVERSED",
                     resource=f"hr.final_settlement:{fs_id_value}", details=f"{body.reason.strip()} (extras released: {released})")
    await reverse_voucher(voucher_id, VoucherReverseBody(reason=f"Final settlement reversal: {body.reason.strip()}"), tenant=tenant, user=user, db=db)
    src = await db.get(Voucher, voucher_id)
    fs = await db.get(HrFinalSettlement, fs_id_value)
    fs.reversal_voucher_id = src.reversed_by_voucher_id if src else None
    await db.commit()
    await db.refresh(fs)
    return _out(fs, FS_FIELDS)
