from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    AccountingPeriod,
    ChartOfAccount,
    Employee,
    PayrollApproval,
    PayrollComponent,
    PayrollPayslip,
    PayrollPeriod,
    PayrollPosting,
    PayrollRun,
    PayrollRunLine,
    PayrollStructure,
    PayrollStructureLine,
    Role,
    Tenant,
    User,
    Voucher,
    VoucherLine,
)
from app.modules.hr_payroll.schemas import (
    PayrollApproveBody,
    PayrollComponentCreate,
    PayrollComponentOut,
    PayrollComponentUpdate,
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

router = APIRouter(prefix="/hr/payroll", tags=["hr-payroll"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _require_manager_or_admin(db: AsyncSession, user: User) -> None:
    role = await db.get(Role, user.role_id)
    role_name = (role.name if role else "").strip().lower()
    if role_name not in {"admin", "manager", "super_admin", "superadmin", "owner"}:
        raise HTTPException(status_code=403, detail="Only manager/admin can perform this action")


def _to_float(value: str | None) -> float:
    try:
        return float(value or "0")
    except (TypeError, ValueError):
        return 0.0


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
        default_amount=row.default_amount,
        gl_account_id=row.gl_account_id,
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
        amount=row.amount,
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
        gross_total=row.gross_total,
        deduction_total=row.deduction_total,
        net_total=row.net_total,
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
        gross_pay=row.gross_pay,
        deductions=row.deductions,
        net_pay=row.net_pay,
        remarks=row.remarks,
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


@router.get("/components", response_model=list[PayrollComponentOut])
async def list_components(
    active_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(PayrollComponent).where(PayrollComponent.tenant_id == tenant.id)
    if active_only:
        stmt = stmt.where(PayrollComponent.is_active.is_(True))
    rows = (await db.execute(stmt.order_by(PayrollComponent.name))).scalars().all()
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
        is_active=body.is_active,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
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
        await db.rollback()
        raise HTTPException(status_code=400, detail="Payroll component code already exists")
    await db.refresh(row)
    return _component_out(row)


@router.get("/structures", response_model=list[PayrollStructureOut])
async def list_structures(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = (
        await db.execute(select(PayrollStructure).where(PayrollStructure.tenant_id == tenant.id).order_by(PayrollStructure.name))
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
        await db.rollback()
        raise HTTPException(status_code=400, detail="Payroll structure code already exists")
    await db.refresh(row)
    return _structure_out(row)


@router.get("/structures/{structure_id}/lines", response_model=list[PayrollStructureLineOut])
async def list_structure_lines(
    structure_id: int,
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
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = (
        await db.execute(select(PayrollPeriod).where(PayrollPeriod.tenant_id == tenant.id).order_by(PayrollPeriod.start_date.desc()))
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
        await db.rollback()
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
    await _require_manager_or_admin(db, user)
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
    rows = (await db.execute(stmt.order_by(PayrollRun.id.desc()))).scalars().all()
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
        await db.rollback()
        raise HTTPException(status_code=400, detail="Payroll run code already exists")
    await db.refresh(row)
    return _run_out(row)


@router.get("/runs/{run_id}/lines", response_model=list[PayrollRunLineOut])
async def list_run_lines(
    run_id: int,
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
    await _require_manager_or_admin(db, user)
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
    run.gross_total = f"{gross_total:.2f}"
    run.deduction_total = f"{deduction_total:.2f}"
    run.net_total = f"{net_total:.2f}"
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
    await _require_manager_or_admin(db, user)
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


@router.post("/runs/{run_id}/post", response_model=PayrollPostingOut)
async def post_run(
    run_id: int,
    body: PayrollPostBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
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

    expense_account_id = body.payroll_expense_account_id
    payable_account_id = body.payroll_payable_account_id
    if expense_account_id is None or payable_account_id is None:
        accounts = (
            await db.execute(
                select(ChartOfAccount)
                .where(ChartOfAccount.tenant_id == tenant.id, ChartOfAccount.is_active.is_(True))
                .order_by(ChartOfAccount.id.asc())
            )
        ).scalars().all()
        if len(accounts) < 2:
            raise HTTPException(
                status_code=400,
                detail="Need at least two active chart-of-account records to auto-post payroll",
            )
        if expense_account_id is None:
            expense_account_id = accounts[0].id
        if payable_account_id is None:
            payable_account_id = accounts[1].id

    expense_acc = await db.get(ChartOfAccount, expense_account_id)
    payable_acc = await db.get(ChartOfAccount, payable_account_id)
    if not expense_acc or expense_acc.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payroll expense account not found")
    if not payable_acc or payable_acc.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payroll payable account not found")

    voucher = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"PR{run.id:05d}",
        voucher_type="JOURNAL",
        voucher_date=period.payment_date,
        status="POSTED",
        description=f"Payroll posting for run {run.run_code}",
        reference=f"PAYROLL_RUN_{run.id}",
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
    await db.commit()
    await db.refresh(posting)
    return _posting_out(posting)


@router.post("/runs/{run_id}/generate-payslips")
async def generate_payslips(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
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
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(PayrollApproval).where(PayrollApproval.tenant_id == tenant.id).order_by(PayrollApproval.id.desc())
    rows = (await db.execute(stmt)).scalars().all()
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
    await _require_manager_or_admin(db, user)
    decision = str(body.get("decision", "")).strip().upper()
    note = body.get("note")
    if decision not in {"APPROVED", "REJECTED"}:
        raise HTTPException(status_code=400, detail="decision must be APPROVED or REJECTED")
    approval = await db.get(PayrollApproval, approval_id)
    if not approval or approval.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payroll approval not found")
    run = await _run_or_404(db, tenant.id, approval.payroll_run_id)
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
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = (
        select(PayrollPayslip, PayrollRunLine)
        .join(PayrollRunLine, PayrollRunLine.id == PayrollPayslip.payroll_run_line_id)
        .where(PayrollPayslip.tenant_id == tenant.id, PayrollRunLine.tenant_id == tenant.id)
        .order_by(PayrollPayslip.generated_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    if run_id is not None:
        rows = [x for x in rows if x[1].run_id == run_id]
    if employee_id is not None:
        rows = [x for x in rows if x[1].employee_id == employee_id]
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
