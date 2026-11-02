from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.orm_numeric import api_money_to_decimal, decimal_to_money_response
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.pagination import HR_LIST_DEFAULT_LIMIT, HR_LIST_MAX_LIMIT
from app.common.permissions import (
    PERMISSION_HR_PAYROLL_AUTO_CALCULATE,
    PERMISSION_HR_PAYROLL_STATUTORY_EDIT,
    PERMISSION_HR_PAYROLL_STATUTORY_VIEW,
    assert_delegate_manager_or_permission,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import (
    AccountingPeriod,
    BonusDeclaration,
    ChartOfAccount,
    Employee,
    EmployeeAdvance,
    PayrollAccountingConfig,
    PayrollApproval,
    PayrollComponent,
    PayrollEmployeeStructureAssignment,
    PayrollPayslip,
    PayrollPeriod,
    PayrollPosting,
    PayrollRun,
    PayrollRunLine,
    PayrollStructure,
    PayrollStructureLine,
    Tenant,
    User,
    Voucher,
    VoucherLine,
)
from app.modules.hr_payroll.schemas import (
    PayrollApproveBody,
    PayrollAssignmentCreate,
    PayrollAssignmentEndBody,
    PayrollAssignmentOut,
    PayrollAutoCalculateApplyBody,
    PayrollAutoCalculateApplyOut,
    PayrollAutoCalculatePreviewOut,
    PayrollComponentCalcOut,
    PayrollComponentCreate,
    PayrollComponentOut,
    PayrollComponentUpdate,
    PayrollEmployeeCalcPreviewOut,
    PayrollPeriodCreate,
    PayrollPeriodOut,
    PayrollPostBody,
    PayrollPostingOut,
    PayrollRunCreate,
    PayrollRunLineOut,
    PayrollRunLineUpsert,
    PayrollRunOut,
    PayrollStructureCreate,
    PayrollStructureLineBody,
    PayrollStructureLineOut,
    PayrollStructureOut,
)
from app.modules.hr_payroll import service as payroll_service

router = APIRouter(prefix="/hr/payroll", tags=["hr-payroll"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _require_manager_or_admin(db: AsyncSession, user: User, tenant_id: int) -> None:
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    role_name = (role.name if role else "").strip().lower()
    if role_name not in {"admin", "manager", "super_admin", "superadmin", "owner"}:
        raise HTTPException(status_code=403, detail="Only manager/admin can perform this action")


def _to_float(value: str | None) -> float:
    try:
        return float(value or "0")
    except (TypeError, ValueError):
        return 0.0


PERMISSION_HR_PAYSLIPS_VIEW_ALL = "hr.payroll.payslips.view_all"


async def _own_employee_id_or_all(db: AsyncSession, user: User, tenant_id: int) -> int | None:
    """None = may see every payslip (admin/manager or delegated); else the caller's own employee id.

    Raises 403 when the caller is neither privileged nor linked to an employee record.
    """
    try:
        await assert_delegate_manager_or_permission(
            db, user, tenant_id, permission_key=PERMISSION_HR_PAYSLIPS_VIEW_ALL
        )
        return None
    except HTTPException:
        pass
    own = (
        await db.execute(
            select(Employee.id).where(Employee.tenant_id == tenant_id, Employee.user_id == user.id).limit(1)
        )
    ).scalar_one_or_none()
    if own is None:
        raise HTTPException(status_code=403, detail="You can only view your own payslips")
    return int(own)


async def _employee_or_404(db: AsyncSession, tenant_id: int, employee_id: int) -> Employee:
    row = await db.get(Employee, employee_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Employee not found")
    return row


async def _component_or_404(db: AsyncSession, tenant_id: int, component_id: int) -> PayrollComponent:
    row = await db.get(PayrollComponent, component_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Payroll component not found")
    return row


async def _structure_or_404(db: AsyncSession, tenant_id: int, structure_id: int) -> PayrollStructure:
    row = await db.get(PayrollStructure, structure_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Payroll structure not found")
    return row


async def _period_or_404(db: AsyncSession, tenant_id: int, period_id: int) -> PayrollPeriod:
    row = await db.get(PayrollPeriod, period_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    return row


async def _run_or_404(db: AsyncSession, tenant_id: int, run_id: int) -> PayrollRun:
    row = await db.get(PayrollRun, run_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    return row


def _component_out(row: PayrollComponent) -> PayrollComponentOut:
    return PayrollComponentOut(
        id=row.id,
        tenant_id=row.tenant_id,
        code=row.code,
        name=row.name,
        component_type=row.component_type,
        calculation_type=row.calculation_type,
        default_amount=decimal_to_money_response(row.default_amount),
        gl_account_id=row.gl_account_id,
        formula=getattr(row, "formula", None),
        applies_to=getattr(row, "applies_to", "ALL") or "ALL",
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _structure_out(row: PayrollStructure) -> PayrollStructureOut:
    return PayrollStructureOut(
        id=row.id,
        tenant_id=row.tenant_id,
        code=row.code,
        name=row.name,
        description=row.description,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _structure_line_out(row: PayrollStructureLine) -> PayrollStructureLineOut:
    return PayrollStructureLineOut(
        id=row.id,
        tenant_id=row.tenant_id,
        structure_id=row.structure_id,
        component_id=row.component_id,
        amount=decimal_to_money_response(row.amount),
        formula=row.formula,
        sort_order=row.sort_order,
        created_at=row.created_at.isoformat(),
    )


def _period_out(row: PayrollPeriod) -> PayrollPeriodOut:
    return PayrollPeriodOut(
        id=row.id,
        tenant_id=row.tenant_id,
        period_code=row.period_code,
        start_date=row.start_date,
        end_date=row.end_date,
        payment_date=row.payment_date,
        status=row.status,
        is_locked=row.is_locked,
        finalized_by=row.finalized_by,
        finalized_at=row.finalized_at.isoformat() if row.finalized_at else None,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _run_out(row: PayrollRun) -> PayrollRunOut:
    return PayrollRunOut(
        id=row.id,
        tenant_id=row.tenant_id,
        period_id=row.period_id,
        run_code=row.run_code,
        run_date=row.run_date,
        status=row.status,
        gross_total=decimal_to_money_response(row.gross_total),
        deduction_total=decimal_to_money_response(row.deduction_total),
        net_total=decimal_to_money_response(row.net_total),
        finalized_by=row.finalized_by,
        finalized_at=row.finalized_at.isoformat() if row.finalized_at else None,
        created_by=row.created_by,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _run_line_out(row: PayrollRunLine) -> PayrollRunLineOut:
    return PayrollRunLineOut(
        id=row.id,
        tenant_id=row.tenant_id,
        run_id=row.run_id,
        employee_id=row.employee_id,
        structure_id=row.structure_id,
        gross_pay=decimal_to_money_response(row.gross_pay),
        deductions=decimal_to_money_response(row.deductions),
        net_pay=decimal_to_money_response(row.net_pay),
        overtime_amount=decimal_to_money_response(getattr(row, "overtime_amount", None)),
        remarks=row.remarks,
        calculation_source=getattr(row, "calculation_source", None) or "MANUAL",
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _posting_out(row: PayrollPosting) -> PayrollPostingOut:
    return PayrollPostingOut(
        id=row.id,
        tenant_id=row.tenant_id,
        payroll_run_id=row.payroll_run_id,
        voucher_id=row.voucher_id,
        status=row.status,
        posted_at=row.posted_at.isoformat(),
        posted_by=row.posted_by,
        note=row.note,
    )


async def _create_statutory_remittance_voucher(
    db: AsyncSession,
    *,
    tenant_id: int,
    run_id: int,
    payment_date: date,
    user_id: int | None,
) -> int | None:
    """Combine PF+ESI+PT employer/employee dues into one remittance JOURNAL if accounts exist."""
    from decimal import Decimal

    from app.models.hr_payroll import PayrollAccountingConfig, PayrollCalculationSnapshot
    from app.modules.finance.voucher_controls import allocate_series_voucher_number, fiscal_year_calendar

    acct_cfg = (
        await db.execute(
            select(PayrollAccountingConfig).where(PayrollAccountingConfig.tenant_id == tenant_id).limit(1)
        )
    ).scalar_one_or_none()
    if not acct_cfg or not acct_cfg.bank_account_id:
        return None

    snaps = list(
        (
            await db.execute(
                select(PayrollCalculationSnapshot)
                .join(PayrollRunLine, PayrollRunLine.id == PayrollCalculationSnapshot.payroll_run_line_id)
                .where(
                    PayrollCalculationSnapshot.tenant_id == tenant_id,
                    PayrollRunLine.run_id == run_id,
                )
            )
        )
        .scalars()
        .all()
    )
    pf_total = Decimal("0")
    esi_total = Decimal("0")
    pt_total = Decimal("0")
    for snap in snaps:
        trace = snap.trace_json or {}
        statutory = trace.get("statutory") or {}
        pf = statutory.get("pf") or {}
        esi = statutory.get("esi") or {}
        try:
            pf_total += Decimal(str(pf.get("employee_pf") or 0)) + Decimal(str(pf.get("employer_pf") or 0))
            esi_total += Decimal(str(esi.get("employee_esi") or 0)) + Decimal(str(esi.get("employer_esi") or 0))
            pt_total += Decimal(str(statutory.get("pt_amount") or 0))
        except Exception:
            continue

    total = (pf_total + esi_total + pt_total).quantize(Decimal("0.01"))
    if total <= 0:
        return None

    # Prefer liability accounts; fall back to payable for missing ESI/PT
    pf_acct = acct_cfg.pf_payable_account_id or acct_cfg.tax_payable_account_id
    esi_acct = getattr(acct_cfg, "esi_payable_account_id", None) or acct_cfg.tax_payable_account_id
    pt_acct = getattr(acct_cfg, "pt_payable_account_id", None) or acct_cfg.tax_payable_account_id
    bank = acct_cfg.bank_account_id
    if not bank:
        return None

    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant_id,
        voucher_date=payment_date,
        voucher_type="JOURNAL",
        branch_code="MAIN",
    )
    voucher = Voucher(
        tenant_id=tenant_id,
        voucher_number=voucher_number,
        voucher_type="JOURNAL",
        voucher_date=payment_date,
        status="POSTED",
        description=f"Statutory remittance payroll run {run_id}",
        reference=f"STAT_REM_{run_id}",
        fiscal_year=fy or fiscal_year_calendar(payment_date),
        series_sequence=series_seq,
        number_series_key=series_key,
        source_module="PAYROLL_STATUTORY",
        source_module_ref=str(run_id),
        books_applied=True,
        created_by=user_id,
    )
    db.add(voucher)
    await db.flush()

    def _add_dr(account_id: int | None, amount: Decimal, note: str) -> None:
        if not account_id or amount <= 0:
            return
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=voucher.id,
                account_id=account_id,
                entry_type="DEBIT",
                amount=f"{amount:.2f}",
                notes=note,
            )
        )

    _add_dr(pf_acct, pf_total, "PF remittance")
    _add_dr(esi_acct, esi_total, "ESI remittance")
    _add_dr(pt_acct, pt_total, "PT remittance")
    db.add(
        VoucherLine(
            tenant_id=tenant_id,
            voucher_id=voucher.id,
            account_id=bank,
            entry_type="CREDIT",
            amount=f"{total:.2f}",
            notes="Statutory remittance bank",
        )
    )
    await db.flush()
    return voucher.id


@router.get("/components", response_model=list[PayrollComponentOut])
async def list_components(
    active_only: bool = Query(default=False),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(PayrollComponent).where(PayrollComponent.tenant_id == tenant.id)
    if active_only:
        stmt = stmt.where(PayrollComponent.is_active.is_(True))
    rows = (await db.execute(stmt.order_by(PayrollComponent.name).offset(offset).limit(limit))).scalars().all()
    return [_component_out(x) for x in rows]


@router.post("/components", response_model=PayrollComponentOut, status_code=status.HTTP_201_CREATED)
async def create_component(
    body: PayrollComponentCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.gl_account_id is not None:
        gl = await db.get(ChartOfAccount, body.gl_account_id)
        if not gl or gl.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="GL account not found")
    row = PayrollComponent(
        tenant_id=tenant.id,
        code=body.code.strip().upper(),
        name=body.name.strip(),
        component_type=body.component_type.strip().upper(),
        calculation_type=body.calculation_type.strip().upper(),
        default_amount=body.default_amount,
        gl_account_id=body.gl_account_id,
        formula=body.formula,
        applies_to=body.applies_to.strip().upper() if body.applies_to else "ALL",
        is_active=body.is_active,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Payroll component code already exists")
    await db.refresh(row)
    return _component_out(row)


@router.patch("/components/{component_id}", response_model=PayrollComponentOut)
async def update_component(
    component_id: int,
    body: PayrollComponentUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await _component_or_404(db, tenant.id, component_id)
    payload = body.model_dump(exclude_unset=True)
    if payload.get("gl_account_id") is not None:
        gl = await db.get(ChartOfAccount, payload["gl_account_id"])
        if not gl or gl.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="GL account not found")
    if payload.get("code") is not None:
        payload["code"] = payload["code"].strip().upper()
    if payload.get("name") is not None:
        payload["name"] = payload["name"].strip()
    if payload.get("component_type") is not None:
        payload["component_type"] = payload["component_type"].strip().upper()
    if payload.get("calculation_type") is not None:
        payload["calculation_type"] = payload["calculation_type"].strip().upper()
    for key, value in payload.items():
        setattr(row, key, value)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Payroll component code already exists")
    await db.refresh(row)
    return _component_out(row)


@router.get("/structures", response_model=list[PayrollStructureOut])
async def list_structures(
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = (
        await db.execute(
            select(PayrollStructure)
            .where(PayrollStructure.tenant_id == tenant.id)
            .order_by(PayrollStructure.name)
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [_structure_out(x) for x in rows]


@router.post("/structures", response_model=PayrollStructureOut, status_code=status.HTTP_201_CREATED)
async def create_structure(
    body: PayrollStructureCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = PayrollStructure(
        tenant_id=tenant.id,
        code=body.code.strip().upper(),
        name=body.name.strip(),
        description=body.description.strip() if body.description else None,
        is_active=body.is_active,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Payroll structure code already exists")
    await db.refresh(row)
    return _structure_out(row)


@router.get("/structures/{structure_id}/lines", response_model=list[PayrollStructureLineOut])
async def list_structure_lines(
    structure_id: int,
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _structure_or_404(db, tenant.id, structure_id)
    rows = (
        await db.execute(
            select(PayrollStructureLine)
            .where(
                PayrollStructureLine.tenant_id == tenant.id,
                PayrollStructureLine.structure_id == structure_id,
            )
            .order_by(PayrollStructureLine.sort_order, PayrollStructureLine.id)
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [_structure_line_out(x) for x in rows]


@router.post("/structures/{structure_id}/lines", response_model=PayrollStructureLineOut, status_code=status.HTTP_201_CREATED)
async def create_structure_line(
    structure_id: int,
    body: PayrollStructureLineBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _structure_or_404(db, tenant.id, structure_id)
    await _component_or_404(db, tenant.id, body.component_id)
    row = PayrollStructureLine(tenant_id=tenant.id, structure_id=structure_id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _structure_line_out(row)


@router.get("/periods", response_model=list[PayrollPeriodOut])
async def list_periods(
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = (
        await db.execute(
            select(PayrollPeriod)
            .where(PayrollPeriod.tenant_id == tenant.id)
            .order_by(PayrollPeriod.start_date.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [_period_out(x) for x in rows]


@router.post("/periods", response_model=PayrollPeriodOut, status_code=status.HTTP_201_CREATED)
async def create_period(
    body: PayrollPeriodCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="end_date must be on/after start_date")
    if body.payment_date < body.start_date:
        raise HTTPException(status_code=400, detail="payment_date must be on/after start_date")
    row = PayrollPeriod(tenant_id=tenant.id, period_code=body.period_code.strip().upper(), start_date=body.start_date, end_date=body.end_date, payment_date=body.payment_date, status="OPEN", is_locked=False)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Payroll period code already exists")
    await db.refresh(row)
    return _period_out(row)


@router.post("/periods/{period_id}/finalize", response_model=PayrollPeriodOut)
async def finalize_period(
    period_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    row = await _period_or_404(db, tenant.id, period_id)
    row.status = "FINALIZED"
    row.is_locked = True
    row.finalized_by = user.id
    row.finalized_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return _period_out(row)


@router.get("/runs", response_model=list[PayrollRunOut])
async def list_runs(
    period_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(PayrollRun).where(PayrollRun.tenant_id == tenant.id)
    if period_id is not None:
        stmt = stmt.where(PayrollRun.period_id == period_id)
    if status_filter:
        stmt = stmt.where(PayrollRun.status == status_filter.strip().upper())
    rows = (await db.execute(stmt.order_by(PayrollRun.id.desc()).offset(offset).limit(limit))).scalars().all()
    return [_run_out(x) for x in rows]


@router.post("/runs", response_model=PayrollRunOut, status_code=status.HTTP_201_CREATED)
async def create_run(
    body: PayrollRunCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    period = await _period_or_404(db, tenant.id, body.period_id)
    if period.is_locked:
        raise HTTPException(status_code=400, detail="Payroll period is locked")
    if body.run_date < period.start_date or body.run_date > period.end_date:
        raise HTTPException(status_code=400, detail="run_date must be inside payroll period")
    # Serialize run creation per period so two clicks cannot create two salary runs.
    await db.execute(
        select(PayrollPeriod.id).where(PayrollPeriod.id == period.id).with_for_update()
    )
    existing_run = (
        await db.execute(
            select(PayrollRun.run_code).where(
                PayrollRun.tenant_id == tenant.id,
                PayrollRun.period_id == period.id,
                PayrollRun.status.not_in(("REJECTED", "CANCELLED")),
            ).limit(1)
        )
    ).scalar_one_or_none()
    if existing_run:
        raise HTTPException(
            status_code=409,
            detail=f"Payroll run {existing_run} already exists for this period; reject it before creating another",
        )
    if body.run_code:
        run_code = body.run_code.strip().upper()
    else:
        last_id = (await db.execute(select(func.max(PayrollRun.id)).where(PayrollRun.tenant_id == tenant.id))).scalar()
        run_code = f"PRUN{(last_id or 0) + 1:04d}"
    row = PayrollRun(
        tenant_id=tenant.id,
        period_id=period.id,
        run_code=run_code,
        run_date=body.run_date,
        status="DRAFT",
        created_by=user.id,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Payroll run code already exists")
    await db.refresh(row)
    return _run_out(row)


@router.get("/runs/{run_id}/lines", response_model=list[PayrollRunLineOut])
async def list_run_lines(
    run_id: int,
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _run_or_404(db, tenant.id, run_id)
    rows = (
        await db.execute(
            select(PayrollRunLine)
            .where(PayrollRunLine.tenant_id == tenant.id, PayrollRunLine.run_id == run_id)
            .order_by(PayrollRunLine.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [_run_line_out(x) for x in rows]


@router.post("/runs/{run_id}/lines/upsert", response_model=PayrollRunLineOut)
async def upsert_run_line(
    run_id: int,
    body: PayrollRunLineUpsert,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    run = await _run_or_404(db, tenant.id, run_id)
    if run.status not in {"DRAFT", "CHECKED", "REJECTED"}:
        raise HTTPException(status_code=400, detail="Run lines can only be edited before approval/posting")
    await _employee_or_404(db, tenant.id, body.employee_id)
    if body.structure_id is not None:
        await _structure_or_404(db, tenant.id, body.structure_id)
    existing = (
        await db.execute(
            select(PayrollRunLine).where(
                PayrollRunLine.tenant_id == tenant.id,
                PayrollRunLine.run_id == run.id,
                PayrollRunLine.employee_id == body.employee_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.structure_id = body.structure_id
        existing.gross_pay = body.gross_pay
        existing.deductions = body.deductions
        existing.net_pay = body.net_pay
        existing.remarks = body.remarks.strip() if body.remarks else None
        existing.calculation_source = "MANUAL"
        await db.commit()
        await db.refresh(existing)
        return _run_line_out(existing)
    row = PayrollRunLine(
        tenant_id=tenant.id,
        run_id=run.id,
        employee_id=body.employee_id,
        structure_id=body.structure_id,
        gross_pay=body.gross_pay,
        deductions=body.deductions,
        net_pay=body.net_pay,
        remarks=body.remarks.strip() if body.remarks else None,
        calculation_source="MANUAL",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _run_line_out(row)


@router.post("/runs/{run_id}/finalize", response_model=PayrollRunOut)
async def finalize_run(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    run = await _run_or_404(db, tenant.id, run_id)
    if run.status not in {"DRAFT", "CHECKED", "REJECTED"}:
        raise HTTPException(status_code=400, detail="Run cannot be finalized from current status")
    lines = (
        await db.execute(
            select(PayrollRunLine).where(PayrollRunLine.tenant_id == tenant.id, PayrollRunLine.run_id == run.id)
        )
    ).scalars().all()
    if not lines:
        raise HTTPException(status_code=400, detail="Cannot finalize run without payroll lines")
    gross_total = sum(_to_float(x.gross_pay) for x in lines)
    deduction_total = sum(_to_float(x.deductions) for x in lines)
    net_total = sum(_to_float(x.net_pay) for x in lines)
    run.gross_total = api_money_to_decimal(f"{gross_total:.4f}")
    run.deduction_total = api_money_to_decimal(f"{deduction_total:.4f}")
    run.net_total = api_money_to_decimal(f"{net_total:.4f}")
    run.status = "FINALIZED"
    run.finalized_by = user.id
    run.finalized_at = datetime.utcnow()
    await db.commit()
    await db.refresh(run)
    return _run_out(run)


@router.post("/runs/{run_id}/approve", response_model=PayrollRunOut)
async def approve_run(
    run_id: int,
    body: PayrollApproveBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    run = await _run_or_404(db, tenant.id, run_id)
    if run.status not in {"FINALIZED", "CHECKED"}:
        raise HTTPException(status_code=400, detail="Only finalized run can be approved")
    run.status = "APPROVED"
    db.add(
        PayrollApproval(
            tenant_id=tenant.id,
            payroll_run_id=run.id,
            action="APPROVED",
            action_by=user.id,
            note=body.note.strip() if body.note else None,
        )
    )
    await db.commit()
    await db.refresh(run)
    return _run_out(run)


@router.post("/runs/{run_id}/reject", response_model=PayrollRunOut)
async def reject_run(
    run_id: int,
    body: PayrollApproveBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a finalized/approved (not yet posted) run back; frees the period for a corrected run."""
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    run = (
        await db.execute(
            select(PayrollRun)
            .where(PayrollRun.id == run_id, PayrollRun.tenant_id == tenant.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    if run.status not in {"FINALIZED", "CHECKED", "APPROVED"}:
        raise HTTPException(status_code=400, detail=f"Cannot reject a {run.status} payroll run")
    run.status = "REJECTED"
    db.add(
        PayrollApproval(
            tenant_id=tenant.id,
            payroll_run_id=run.id,
            action="REJECTED",
            action_by=user.id,
            note=body.note.strip() if body.note else None,
        )
    )
    from app.modules.notifications.service import notify_user

    note = body.note.strip() if body.note else ""
    notify_user(
        db,
        tenant_id=tenant.id,
        user_id=run.finalized_by or run.created_by,
        actor_user_id=user.id,
        kind="hr.payroll.rejected",
        title=f"Payroll run {run.run_code} was rejected",
        body=f"Reason: {note}" if note else "Correct the run and finalize it again.",
        href="/app/hr/payroll/runs",
    )
    await db.commit()
    await db.refresh(run)
    return _run_out(run)


@router.post("/runs/{run_id}/post", response_model=PayrollPostingOut)
async def post_run(
    run_id: int,
    body: PayrollPostBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    run = await _run_or_404(db, tenant.id, run_id)
    if run.status not in {"APPROVED", "POSTED"}:
        raise HTTPException(status_code=400, detail="Only approved run can be posted")

    existing_post = (
        await db.execute(
            select(PayrollPosting).where(
                PayrollPosting.tenant_id == tenant.id,
                PayrollPosting.payroll_run_id == run.id,
            ).order_by(PayrollPosting.id.desc()).limit(1)
        )
    ).scalars().first()
    if existing_post:
        if run.status != "POSTED":
            run.status = "POSTED"
            await db.commit()
        return _posting_out(existing_post)

    period = await _period_or_404(db, tenant.id, run.period_id)
    accounting_period = (
        await db.execute(
            select(AccountingPeriod).where(
                AccountingPeriod.tenant_id == tenant.id,
                AccountingPeriod.start_date <= period.payment_date,
                AccountingPeriod.end_date >= period.payment_date,
            ).order_by(AccountingPeriod.start_date.desc(), AccountingPeriod.id.desc()).limit(1)
        )
    ).scalars().first()
    if not accounting_period:
        raise HTTPException(status_code=400, detail="No accounting period found for payroll payment date")
    if accounting_period.is_closed:
        raise HTTPException(status_code=400, detail="Accounting period is locked/closed; payroll posting blocked")

    lines = (
        await db.execute(
            select(PayrollRunLine).where(PayrollRunLine.tenant_id == tenant.id, PayrollRunLine.run_id == run.id)
        )
    ).scalars().all()
    if not lines:
        raise HTTPException(status_code=400, detail="Cannot post run without payroll lines")

    total_net = sum(_to_float(x.net_pay) for x in lines)
    if total_net <= 0:
        raise HTTPException(status_code=400, detail="Payroll net total must be greater than zero")

    from app.modules.hr_payroll.account_resolver import resolve_payroll_accounts

    acc = await resolve_payroll_accounts(
        db,
        tenant.id,
        expense_override=body.payroll_expense_account_id,
        payable_override=body.payroll_payable_account_id,
    )
    expense_account_id = acc["expense"]
    payable_account_id = acc["payable"]
    if not expense_account_id or not payable_account_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot resolve payroll GL accounts: set salary accounts in Payroll accounting settings, "
                "pass payroll_expense_account_id / payroll_payable_account_id, or run system COA seed."
            ),
        )

    expense_acc = await db.get(ChartOfAccount, expense_account_id)
    payable_acc = await db.get(ChartOfAccount, payable_account_id)
    if not expense_acc or expense_acc.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payroll expense account not found")
    if not payable_acc or payable_acc.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payroll payable account not found")

    from app.modules.finance.voucher_controls import finalize_posted_voucher_metadata, fiscal_year_calendar

    voucher = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"PR{run.id:05d}",
        voucher_type="JOURNAL",
        voucher_date=period.payment_date,
        status="POSTED",
        description=f"Payroll posting for run {run.run_code}",
        reference=f"PAYROLL_RUN_{run.id}",
        branch_code="MAIN",
        fiscal_year=fiscal_year_calendar(period.payment_date),
        source_module="PAYROLL",
        source_module_ref=f"run:{run.id}",
        allow_manual_edit=False,
        created_by=user.id,
    )
    db.add(voucher)
    await db.flush()

    db.add(
        VoucherLine(
            tenant_id=tenant.id,
            voucher_id=voucher.id,
            account_id=expense_account_id,
            entry_type="DEBIT",
            amount=f"{total_net:.2f}",
            notes="Payroll expense",
        )
    )
    db.add(
        VoucherLine(
            tenant_id=tenant.id,
            voucher_id=voucher.id,
            account_id=payable_account_id,
            entry_type="CREDIT",
            amount=f"{total_net:.2f}",
            notes="Payroll payable",
        )
    )
    await db.flush()
    vlines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())
    await finalize_posted_voucher_metadata(db, tenant.id, voucher, vlines, strict_duplicate_check=True)

    posting = PayrollPosting(
        tenant_id=tenant.id,
        payroll_run_id=run.id,
        voucher_id=voucher.id,
        status="POSTED",
        posted_by=user.id,
        note=body.note.strip() if body.note else None,
    )
    db.add(posting)
    run.status = "POSTED"

    remittance_voucher_id = None
    from app.common.tenant_feature_keys import is_statutory_payroll_enabled

    if is_statutory_payroll_enabled(tenant.feature_flags):
        try:
            remittance_voucher_id = await _create_statutory_remittance_voucher(
                db,
                tenant_id=tenant.id,
                run_id=run.id,
                payment_date=period.payment_date,
                user_id=user.id,
            )
        except Exception:
            import logging

            logging.getLogger(__name__).exception("statutory remittance skipped run=%s", run.id)

    await db.commit()
    await db.refresh(posting)
    out = _posting_out(posting)
    if remittance_voucher_id and hasattr(out, "model_dump"):
        data = out.model_dump()
        data["statutory_remittance_voucher_id"] = remittance_voucher_id
        return data
    return out


@router.post("/runs/{run_id}/generate-payslips")
async def generate_payslips(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    run = await _run_or_404(db, tenant.id, run_id)
    if run.status not in {"APPROVED", "POSTED"}:
        raise HTTPException(status_code=400, detail="Payslips can be generated for approved/posted runs only")
    run_lines = (
        await db.execute(
            select(PayrollRunLine).where(PayrollRunLine.tenant_id == tenant.id, PayrollRunLine.run_id == run.id)
        )
    ).scalars().all()
    created_count = 0
    for line in run_lines:
        existing = (
            await db.execute(
                select(PayrollPayslip).where(
                    PayrollPayslip.tenant_id == tenant.id,
                    PayrollPayslip.payroll_run_line_id == line.id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            continue
        slip = PayrollPayslip(
            tenant_id=tenant.id,
            payroll_run_line_id=line.id,
            slip_number=f"PS-{run.id:04d}-{line.employee_id:04d}",
            generated_by=user.id,
            file_path=None,
        )
        db.add(slip)
        created_count += 1
    await db.commit()
    return {"ok": True, "created": created_count}


@router.get("/approvals")
async def list_approvals(
    status: str | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(PayrollApproval).where(PayrollApproval.tenant_id == tenant.id).order_by(PayrollApproval.id.desc())
    rows = (await db.execute(stmt.offset(offset).limit(limit))).scalars().all()
    if status and status.strip():
        rows = [x for x in rows if x.action.upper() == status.strip().upper()]
    return [
        {
            "id": row.id,
            "payroll_run_id": row.payroll_run_id,
            "approver_user_id": row.action_by,
            "decision": row.action,
            "note": row.note,
            "decided_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.patch("/approvals/{approval_id}/decision")
async def decide_approval(
    approval_id: int,
    body: dict,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    decision = str(body.get("decision", "")).strip().upper()
    note = body.get("note")
    if decision not in {"APPROVED", "REJECTED"}:
        raise HTTPException(status_code=400, detail="decision must be APPROVED or REJECTED")
    approval = await db.get(PayrollApproval, approval_id)
    if not approval or approval.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payroll approval not found")
    run = (
        await db.execute(
            select(PayrollRun)
            .where(PayrollRun.id == approval.payroll_run_id, PayrollRun.tenant_id == tenant.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    # A POSTED run already hit the ledger; flipping it to APPROVED/REJECTED would let it post twice.
    allowed_from = {"FINALIZED", "CHECKED"} if decision == "APPROVED" else {"FINALIZED", "CHECKED", "APPROVED"}
    if (run.status or "").upper() not in allowed_from:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark a {run.status} payroll run as {decision}",
        )
    run.status = "APPROVED" if decision == "APPROVED" else "REJECTED"
    approval.action = decision
    approval.action_by = user.id
    approval.note = str(note).strip() if note else None
    await db.commit()
    await db.refresh(approval)
    return {
        "id": approval.id,
        "payroll_run_id": approval.payroll_run_id,
        "approver_user_id": approval.action_by,
        "decision": approval.action,
        "note": approval.note,
        "decided_at": approval.created_at.isoformat() if approval.created_at else None,
    }


@router.get("/payslips")
async def list_payslips(
    run_id: int | None = Query(default=None),
    employee_id: int | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    own_employee_id = await _own_employee_id_or_all(db, user, tenant.id)
    stmt = (
        select(PayrollPayslip, PayrollRunLine)
        .join(PayrollRunLine, PayrollRunLine.id == PayrollPayslip.payroll_run_line_id)
        .where(PayrollPayslip.tenant_id == tenant.id, PayrollRunLine.tenant_id == tenant.id)
    )
    if own_employee_id is not None:
        stmt = stmt.where(PayrollRunLine.employee_id == own_employee_id)
    # Filter in SQL (not after LIMIT) so pages are not silently short.
    if run_id is not None:
        stmt = stmt.where(PayrollRunLine.run_id == run_id)
    if employee_id is not None:
        stmt = stmt.where(PayrollRunLine.employee_id == employee_id)
    stmt = stmt.order_by(PayrollPayslip.generated_at.desc()).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": payslip.id,
            "payroll_run_id": run_line.run_id,
            "employee_id": run_line.employee_id,
            "gross_amount": float(run_line.gross_pay or 0),
            "deduction_amount": float(run_line.deductions or 0),
            "net_amount": float(run_line.net_pay or 0),
            "status": "generated",
        }
        for payslip, run_line in rows
    ]


@router.get("/accounting-config")
async def get_payroll_accounting_config(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = (
        await db.execute(select(PayrollAccountingConfig).where(PayrollAccountingConfig.tenant_id == tenant.id).limit(1))
    ).scalar_one_or_none()
    if not row:
        return {
            "salary_expense_account_id": None,
            "salary_payable_account_id": None,
            "bank_account_id": None,
            "cash_account_id": None,
            "tax_payable_account_id": None,
            "pf_payable_account_id": None,
            "esi_payable_account_id": None,
            "pt_payable_account_id": None,
            "advance_receivable_account_id": None,
        }
    return {
        "salary_expense_account_id": row.salary_expense_account_id,
        "salary_payable_account_id": row.salary_payable_account_id,
        "bank_account_id": row.bank_account_id,
        "cash_account_id": row.cash_account_id,
        "tax_payable_account_id": row.tax_payable_account_id,
        "pf_payable_account_id": row.pf_payable_account_id,
        "esi_payable_account_id": getattr(row, "esi_payable_account_id", None),
        "pt_payable_account_id": getattr(row, "pt_payable_account_id", None),
        "advance_receivable_account_id": row.advance_receivable_account_id,
    }


@router.put("/accounting-config")
async def upsert_payroll_accounting_config(
    body: dict,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    row = (
        await db.execute(select(PayrollAccountingConfig).where(PayrollAccountingConfig.tenant_id == tenant.id).limit(1))
    ).scalar_one_or_none()
    if not row:
        row = PayrollAccountingConfig(tenant_id=tenant.id)
        db.add(row)
    for key in (
        "salary_expense_account_id",
        "salary_payable_account_id",
        "bank_account_id",
        "cash_account_id",
        "tax_payable_account_id",
        "pf_payable_account_id",
        "esi_payable_account_id",
        "pt_payable_account_id",
        "advance_receivable_account_id",
    ):
        if key in body:
            setattr(row, key, body[key])
    await db.commit()
    await db.refresh(row)
    return await get_payroll_accounting_config(tenant, user, db)


@router.get("/advances", response_model=list[dict])
async def list_advances(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = (await db.execute(select(EmployeeAdvance).where(EmployeeAdvance.tenant_id == tenant.id).limit(500))).scalars().all()
    return [
        {
            "id": r.id,
            "employee_id": r.employee_id,
            "advance_date": r.advance_date.isoformat(),
            "amount": r.amount,
            "monthly_deduction": r.monthly_deduction,
            "outstanding": r.outstanding,
            "status": r.status,
        }
        for r in rows
    ]


@router.post("/advances", status_code=status.HTTP_201_CREATED)
async def create_advance(
    body: dict,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    emp_id = int(body.get("employee_id", 0))
    await _employee_or_404(db, tenant.id, emp_id)
    amt = str(body.get("amount", "0"))
    monthly = str(body.get("monthly_deduction", "0"))
    row = EmployeeAdvance(
        tenant_id=tenant.id,
        employee_id=emp_id,
        advance_date=datetime.utcnow().date(),
        amount=amt,
        monthly_deduction=monthly,
        total_recovered="0",
        outstanding=amt,
        status="ACTIVE",
        reason=str(body.get("reason") or "") or None,
        created_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "ok": True}


@router.get("/bonuses", response_model=list[dict])
async def list_bonuses(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = (await db.execute(select(BonusDeclaration).where(BonusDeclaration.tenant_id == tenant.id).limit(200))).scalars().all()
    return [
        {
            "id": r.id,
            "bonus_type": r.bonus_type,
            "period_code": r.period_code,
            "title": r.title,
            "status": r.status,
            "amount_or_pct": r.amount_or_pct,
        }
        for r in rows
    ]


@router.post("/bonuses", status_code=status.HTTP_201_CREATED)
async def create_bonus(
    body: dict,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    row = BonusDeclaration(
        tenant_id=tenant.id,
        bonus_type=str(body.get("bonus_type", "FESTIVAL")),
        period_code=str(body.get("period_code", "")),
        title=str(body.get("title", "Bonus")),
        eligibility_criteria=body.get("eligibility_criteria"),
        amount_or_pct=str(body.get("amount_or_pct")) if body.get("amount_or_pct") is not None else None,
        status="DRAFT",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "ok": True}


@router.get("/payslips/{payslip_id}/pdf")
async def download_payslip_pdf(
    payslip_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    slip = await db.get(PayrollPayslip, payslip_id)
    if not slip or slip.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payslip not found")
    line = await db.get(PayrollRunLine, slip.payroll_run_line_id)
    if not line or line.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payroll line not found")
    own_employee_id = await _own_employee_id_or_all(db, user, tenant.id)
    if own_employee_id is not None and line.employee_id != own_employee_id:
        raise HTTPException(status_code=404, detail="Payslip not found")
    emp = await db.get(Employee, line.employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    run = await db.get(PayrollRun, line.run_id)
    from app.modules.hr.hr_document_generator_service import generate_payslip_pdf

    pdf = generate_payslip_pdf(
        emp,
        run=run,
        line=line,
        payslip=slip,
        company_name=getattr(tenant, "name", None) or "Company",
    )
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="payslip-{slip.slip_number or payslip_id}.pdf"'},
    )


@router.get("/runs/{run_id}/bank-file")
async def download_bank_file(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    run = await _run_or_404(db, tenant.id, run_id)
    lines = (
        await db.execute(select(PayrollRunLine).where(PayrollRunLine.tenant_id == tenant.id, PayrollRunLine.run_id == run.id))
    ).scalars().all()
    rows_csv = ["employee_code,net_pay,currency"]
    for ln in lines:
        emp = await db.get(Employee, ln.employee_id)
        code = emp.employee_code if emp else str(ln.employee_id)
        rows_csv.append(f"{code},{ln.net_pay},BDT")
    content = "\n".join(rows_csv)
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="payroll_run_{run.id}_bank.csv"'},
    )


def _assignment_out(row: PayrollEmployeeStructureAssignment) -> PayrollAssignmentOut:
    return PayrollAssignmentOut(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_id=row.employee_id,
        structure_id=row.structure_id,
        effective_from=row.effective_from,
        effective_to=row.effective_to,
        base_salary=decimal_to_money_response(row.base_salary) if row.base_salary is not None else None,
        component_overrides=row.component_overrides if isinstance(row.component_overrides, dict) else None,
        created_by=row.created_by,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("/assignments", response_model=list[PayrollAssignmentOut])
async def list_assignments(
    employee_id: int | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = await payroll_service.list_structure_assignments(
        db, tenant_id=tenant.id, employee_id=employee_id, limit=limit, offset=offset
    )
    return [_assignment_out(x) for x in rows]


@router.post("/assignments", response_model=PayrollAssignmentOut, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: PayrollAssignmentCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await payroll_service.create_structure_assignment(
        db,
        tenant_id=tenant.id,
        employee_id=body.employee_id,
        structure_id=body.structure_id,
        effective_from=body.effective_from,
        effective_to=body.effective_to,
        base_salary=body.base_salary,
        component_overrides=body.component_overrides,
        created_by=user.id,
    )
    return _assignment_out(row)


@router.post("/assignments/{assignment_id}/end", response_model=PayrollAssignmentOut)
async def end_assignment(
    assignment_id: int,
    body: PayrollAssignmentEndBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await payroll_service.end_structure_assignment(
        db,
        tenant_id=tenant.id,
        assignment_id=assignment_id,
        effective_to=body.effective_to,
    )
    return _assignment_out(row)


@router.post("/runs/{run_id}/auto-calculate/preview", response_model=PayrollAutoCalculatePreviewOut)
async def auto_calculate_preview(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Read-only preview. Requires feature flag + soft RBAC permission."""
    _ensure_tenant(user, tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_HR_PAYROLL_AUTO_CALCULATE
    )
    preview = await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=run_id)
    return PayrollAutoCalculatePreviewOut(
        run_id=preview.run_id,
        period_id=preview.period_id,
        as_of=preview.as_of,
        existing_line_count=preview.existing_line_count,
        requires_overwrite_confirm=preview.requires_overwrite_confirm,
        missing_assignment_employee_ids=preview.missing_assignment_employee_ids,
        warnings=preview.warnings,
        employees=[
            PayrollEmployeeCalcPreviewOut(
                employee_id=e.employee_id,
                employee_code=e.employee_code,
                employee_name=e.employee_name,
                structure_id=e.structure_id,
                assignment_id=e.assignment_id,
                base_salary=e.base_salary,
                days_present=e.days_present,
                absent_days=e.absent_days,
                late_days=e.late_days,
                ot_hours=e.ot_hours,
                paid_leave_days=e.paid_leave_days,
                unpaid_leave_days=e.unpaid_leave_days,
                gross_pay=e.gross_pay,
                deductions=e.deductions,
                net_pay=e.net_pay,
                overtime_amount=e.overtime_amount,
                warnings=e.warnings,
                skipped=e.skipped,
                skip_reason=e.skip_reason,
                status=e.status,
                has_manual_override=e.has_manual_override,
                calculation_source=e.calculation_source,
                components=[
                    PayrollComponentCalcOut(
                        component_id=c.component_id,
                        component_code=c.component_code,
                        component_name=c.component_name,
                        component_type=c.component_type,
                        calculation_type=c.calculation_type,
                        amount=c.amount,
                        source_amount=c.source_amount,
                    )
                    for c in e.components
                ],
            )
            for e in preview.employees
        ],
    )


@router.post("/runs/{run_id}/auto-calculate/apply", response_model=PayrollAutoCalculateApplyOut)
async def auto_calculate_apply(
    run_id: int,
    body: PayrollAutoCalculateApplyBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist previewed lines. Requires feature flag + soft RBAC permission."""
    _ensure_tenant(user, tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_HR_PAYROLL_AUTO_CALCULATE
    )
    result = await payroll_service.apply_auto_calculate(
        db,
        tenant=tenant,
        run_id=run_id,
        employee_ids=body.employee_ids,
        force=body.force,
        overwrite_confirm=body.overwrite_confirm,
        created_by=user.id,
    )
    return PayrollAutoCalculateApplyOut(**result)


@router.get("/statutory-config")
async def get_statutory_config(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    from app.common.tenant_feature_keys import is_statutory_payroll_enabled
    from app.models.payroll_statutory import PayrollStatutoryConfig
    from app.modules.hr_payroll.statutory_calculation_service import (
        DEFAULT_MH_PT_SLABS,
        statutory_config_out,
    )

    if not is_statutory_payroll_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Enable statutory_payroll_enabled feature flag")
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_HR_PAYROLL_STATUTORY_VIEW)
    row = (
        await db.execute(
            select(PayrollStatutoryConfig).where(PayrollStatutoryConfig.tenant_id == tenant.id).limit(1)
        )
    ).scalar_one_or_none()
    if not row:
        return {
            "pf_employee_rate": "12",
            "pf_employer_rate": "12",
            "esi_employee_rate": "0.75",
            "esi_employer_rate": "3.25",
            "pf_wage_ceiling": "15000",
            "esi_wage_ceiling": "21000",
            "pt_state": "Maharashtra",
            "pt_slabs": DEFAULT_MH_PT_SLABS,
            "gratuity_days_per_year": "15",
            "is_active": True,
        }
    return statutory_config_out(row)


@router.put("/statutory-config")
async def put_statutory_config(
    body: dict,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    from decimal import Decimal

    from app.common.tenant_feature_keys import is_statutory_payroll_enabled
    from app.models.payroll_statutory import PayrollStatutoryConfig
    from app.modules.hr_payroll.statutory_calculation_service import statutory_config_out

    if not is_statutory_payroll_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Enable statutory_payroll_enabled feature flag")
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_HR_PAYROLL_STATUTORY_EDIT)
    row = (
        await db.execute(
            select(PayrollStatutoryConfig).where(PayrollStatutoryConfig.tenant_id == tenant.id).limit(1)
        )
    ).scalar_one_or_none()
    if not row:
        row = PayrollStatutoryConfig(tenant_id=tenant.id)
        db.add(row)
    for key in (
        "pf_employee_rate",
        "pf_employer_rate",
        "esi_employee_rate",
        "esi_employer_rate",
        "pf_wage_ceiling",
        "esi_wage_ceiling",
        "gratuity_days_per_year",
    ):
        if key in body and body[key] is not None:
            setattr(row, key, Decimal(str(body[key])))
    if "pt_state" in body:
        row.pt_state = body["pt_state"]
    if "pt_slabs" in body:
        row.pt_slabs = body["pt_slabs"]
    if "is_active" in body:
        row.is_active = bool(body["is_active"])
    await db.commit()
    await db.refresh(row)
    return statutory_config_out(row)


@router.post("/statutory-config/preview")
async def preview_statutory(
    body: dict,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    from decimal import Decimal

    from app.common.tenant_feature_keys import is_statutory_payroll_enabled
    from app.models.payroll_statutory import PayrollStatutoryConfig
    from app.modules.hr_payroll.statutory_calculation_service import calculate_all_statutory

    if not is_statutory_payroll_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Enable statutory_payroll_enabled feature flag")
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_HR_PAYROLL_STATUTORY_VIEW)
    row = (
        await db.execute(
            select(PayrollStatutoryConfig).where(PayrollStatutoryConfig.tenant_id == tenant.id).limit(1)
        )
    ).scalar_one_or_none()
    basic = Decimal(str(body.get("basic_salary") or 0))
    gross = Decimal(str(body.get("gross_salary") or basic))
    years = body.get("years_of_service")
    return calculate_all_statutory(
        basic_salary=basic,
        gross_salary=gross,
        config=row,
        years_of_service=Decimal(str(years)) if years is not None else None,
    )
