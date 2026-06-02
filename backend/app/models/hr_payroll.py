from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PayrollComponent(Base):
    __tablename__ = "hr_payroll_components"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    component_type: Mapped[str] = mapped_column(String(16), nullable=False, default="EARNING", index=True)
    calculation_type: Mapped[str] = mapped_column(String(24), nullable=False, default="FIXED")
    default_amount: Mapped[str] = mapped_column(String(16), nullable=False, default="0")
    gl_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    formula: Mapped[str | None] = mapped_column(Text, nullable=True)
    applies_to: Mapped[str] = mapped_column(String(16), nullable=False, default="ALL")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PayrollStructure(Base):
    __tablename__ = "hr_payroll_structures"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PayrollStructureLine(Base):
    __tablename__ = "hr_payroll_structure_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    structure_id: Mapped[int] = mapped_column(
        ForeignKey("hr_payroll_structures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    component_id: Mapped[int] = mapped_column(
        ForeignKey("hr_payroll_components.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount: Mapped[str] = mapped_column(String(16), nullable=False, default="0")
    formula: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PayrollPeriod(Base):
    __tablename__ = "hr_payroll_periods"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    period_code: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="OPEN", index=True)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    finalized_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PayrollRun(Base):
    __tablename__ = "hr_payroll_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("hr_payroll_periods.id", ondelete="RESTRICT"), nullable=False, index=True)
    run_code: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    run_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT", index=True)
    gross_total: Mapped[str] = mapped_column(String(16), nullable=False, default="0")
    deduction_total: Mapped[str] = mapped_column(String(16), nullable=False, default="0")
    net_total: Mapped[str] = mapped_column(String(16), nullable=False, default="0")
    finalized_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PayrollRunLine(Base):
    __tablename__ = "hr_payroll_run_lines"
    __table_args__ = (Index("ix_hr_payroll_run_lines_tenant_run", "tenant_id", "run_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("hr_payroll_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    structure_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_payroll_structures.id", ondelete="SET NULL"), nullable=True, index=True
    )
    gross_pay: Mapped[str] = mapped_column(String(16), nullable=False, default="0")
    deductions: Mapped[str] = mapped_column(String(16), nullable=False, default="0")
    net_pay: Mapped[str] = mapped_column(String(16), nullable=False, default="0")
    overtime_amount: Mapped[str] = mapped_column(String(16), nullable=False, default="0")
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PayrollApproval(Base):
    __tablename__ = "hr_payroll_approvals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    payroll_run_id: Mapped[int] = mapped_column(ForeignKey("hr_payroll_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    action_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PayrollPosting(Base):
    __tablename__ = "hr_payroll_postings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    payroll_run_id: Mapped[int] = mapped_column(ForeignKey("hr_payroll_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="POSTED", index=True)
    posted_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    posted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class PayrollPayslip(Base):
    __tablename__ = "hr_payroll_payslips"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    payroll_run_line_id: Mapped[int] = mapped_column(
        ForeignKey("hr_payroll_run_lines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slip_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    generated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    file_path: Mapped[str | None] = mapped_column(String(255), nullable=True)


class BonusDeclaration(Base):
    __tablename__ = "hr_bonus_declarations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bonus_type: Mapped[str] = mapped_column(String(32), nullable=False)
    period_code: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    eligibility_criteria: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    amount_or_pct: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class EmployeeAdvance(Base):
    __tablename__ = "hr_employee_advances"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True)
    advance_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[str] = mapped_column(String(24), nullable=False)
    monthly_deduction: Mapped[str] = mapped_column(String(24), nullable=False)
    total_recovered: Mapped[str] = mapped_column(String(24), nullable=False, default="0")
    outstanding: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="ACTIVE")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    disbursement_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PayrollAccountingConfig(Base):
    __tablename__ = "hr_payroll_accounting_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    salary_expense_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    salary_payable_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    bank_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    cash_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    tax_payable_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    pf_payable_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    advance_receivable_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
