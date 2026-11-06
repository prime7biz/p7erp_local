"""Bangladesh RMG labour-law rule sets, wage schedules and enforcement ledgers.

Phase B (migration 282): rule sets + wage schedule rates (read-only previews).
Phase C (migration 283): employee wage assignments, earned-leave accruals, maternity cases,
festival-work entries and service-benefit cases. Each Phase C workflow only changes payroll or
leave when its strict tenant flag is ON (see app.modules.hr_localization.enforcement_flags).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

MONEY = Numeric(18, 4)


class HrBdRuleSet(Base):
    __tablename__ = "hr_bd_rule_sets"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", "catalog_version", name="uq_hr_bd_rule_sets_code_version"),
        CheckConstraint("status IN ('DRAFT','APPROVED','RETIRED')", name="ck_hr_bd_rule_sets_status"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="ck_hr_bd_rule_sets_dates"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    catalog_version: Mapped[str] = mapped_column(String(32), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    source_manifest_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    source_refs: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    rules_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrBdWageScheduleRate(Base):
    __tablename__ = "hr_bd_wage_schedule_rates"
    __table_args__ = (
        UniqueConstraint("tenant_id", "rule_set_id", "rate_code", name="uq_hr_bd_wage_rates_rule_set_code"),
        CheckConstraint("schedule_class IN ('WORKER','EMPLOYEE')", name="ck_hr_bd_wage_rates_class"),
        CheckConstraint("employment_stage IN ('REGULAR','APPRENTICE')", name="ck_hr_bd_wage_rates_stage"),
        CheckConstraint(
            "employment_stage = 'APPRENTICE' OR grade_code IS NOT NULL", name="ck_hr_bd_wage_rates_regular_grade"
        ),
        CheckConstraint(
            "basic >= 0 AND house_rent >= 0 AND medical >= 0 AND transport >= 0 AND food >= 0 AND other_allowance >= 0",
            name="ck_hr_bd_wage_rates_non_negative",
        ),
        CheckConstraint(
            "gross = basic + house_rent + medical + transport + food + other_allowance", name="ck_hr_bd_wage_rates_gross"
        ),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="ck_hr_bd_wage_rates_dates"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_set_id: Mapped[int] = mapped_column(ForeignKey("hr_bd_rule_sets.id", ondelete="RESTRICT"), nullable=False, index=True)
    rate_code: Mapped[str] = mapped_column(String(16), nullable=False)
    schedule_class: Mapped[str] = mapped_column(String(16), nullable=False)
    employment_stage: Mapped[str] = mapped_column(String(16), nullable=False)
    grade_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    designation_scope: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    basic: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    house_rent: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    medical: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    transport: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    food: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    other_allowance: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    gross: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    annual_increment_pct: Mapped[Decimal] = mapped_column(Numeric(9, 4), nullable=False)
    apprentice_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_page: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrBdEmployeeWageAssignment(Base):
    __tablename__ = "hr_bd_employee_wage_assignments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "employee_id", "effective_from", name="uq_hr_bd_wage_assign_employee_start"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="ck_hr_bd_wage_assign_dates"),
        Index("ix_hr_bd_wage_assign_tenant_employee", "tenant_id", "employee_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False)
    wage_rate_id: Mapped[int] = mapped_column(
        ForeignKey("hr_bd_wage_schedule_rates.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    ended_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrBdLeaveAccrualEntry(Base):
    __tablename__ = "hr_bd_leave_accrual_entries"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "employee_id", "leave_type_id", "source_period_start", "source_period_end",
            name="uq_hr_bd_accrual_source_period",
        ),
        CheckConstraint("source_period_end >= source_period_start", name="ck_hr_bd_accrual_period"),
        CheckConstraint("worked_days >= 0 AND accrued_days >= 0", name="ck_hr_bd_accrual_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("hr_leave_types.id", ondelete="RESTRICT"), nullable=False)
    balance_id: Mapped[int | None] = mapped_column(ForeignKey("hr_leave_balances.id", ondelete="SET NULL"), nullable=True)
    rule_set_id: Mapped[int | None] = mapped_column(ForeignKey("hr_bd_rule_sets.id", ondelete="RESTRICT"), nullable=True)
    source_period_start: Mapped[date] = mapped_column(Date, nullable=False)
    source_period_end: Mapped[date] = mapped_column(Date, nullable=False)
    worked_days: Mapped[int] = mapped_column(Integer, nullable=False)
    accrued_days: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False)
    trace_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


MATERNITY_STATUSES = ("DRAFT", "ELIGIBLE", "INELIGIBLE", "APPROVED", "PAID", "CANCELLED")


class HrBdMaternityCase(Base):
    __tablename__ = "hr_bd_maternity_cases"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT','ELIGIBLE','INELIGIBLE','APPROVED','PAID','CANCELLED')", name="ck_hr_bd_maternity_status"
        ),
        CheckConstraint("leave_end >= leave_start", name="ck_hr_bd_maternity_dates"),
        CheckConstraint("surviving_children >= 0", name="ck_hr_bd_maternity_children"),
        # One open case per employee; cancelled / paid cases do not block a new one.
        Index(
            "uq_hr_bd_maternity_one_open",
            "tenant_id",
            "employee_id",
            unique=True,
            postgresql_where=text("status IN ('DRAFT','ELIGIBLE','INELIGIBLE','APPROVED')"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    rule_set_id: Mapped[int | None] = mapped_column(ForeignKey("hr_bd_rule_sets.id", ondelete="RESTRICT"), nullable=True)
    expected_delivery_date: Mapped[date] = mapped_column(Date, nullable=False)
    actual_delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    leave_start: Mapped[date] = mapped_column(Date, nullable=False)
    leave_end: Mapped[date] = mapped_column(Date, nullable=False)
    service_start: Mapped[date] = mapped_column(Date, nullable=False)
    surviving_children: Mapped[int] = mapped_column(Integer, nullable=False)
    eligible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    eligibility_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    monthly_gross: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    daily_rate: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    benefit_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    calculation_trace: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payment_reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrBdFestivalWorkEntry(Base):
    __tablename__ = "hr_bd_festival_work_entries"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "employee_id", "holiday_id", "attendance_entry_id", name="uq_hr_bd_festival_work_source"
        ),
        CheckConstraint("status IN ('PENDING','APPROVED','CANCELLED')", name="ck_hr_bd_festival_work_status"),
        CheckConstraint(
            "alternative_holiday_status IN ('PENDING','SCHEDULED','TAKEN')", name="ck_hr_bd_festival_alt_status"
        ),
        CheckConstraint("compensation_days >= 0 AND compensation_amount >= 0", name="ck_hr_bd_festival_non_negative"),
        CheckConstraint(
            "payroll_run_line_id IS NULL OR final_settlement_id IS NULL", name="ck_hr_bd_festival_one_owner"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True)
    holiday_id: Mapped[int] = mapped_column(ForeignKey("hr_attendance_holidays.id", ondelete="RESTRICT"), nullable=False)
    attendance_entry_id: Mapped[int] = mapped_column(
        ForeignKey("hr_attendance_entries.id", ondelete="RESTRICT"), nullable=False
    )
    rule_set_id: Mapped[int | None] = mapped_column(ForeignKey("hr_bd_rule_sets.id", ondelete="RESTRICT"), nullable=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    alternative_holiday_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    alternative_holiday_status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    compensation_days: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False)
    compensation_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    payroll_run_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_payroll_run_lines.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # Added in migration 287 (settlements table exists from 286). One owner: payroll OR settlement.
    final_settlement_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_final_settlements.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    trace_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrBdServiceBenefitCase(Base):
    __tablename__ = "hr_bd_service_benefit_cases"
    __table_args__ = (
        UniqueConstraint("tenant_id", "employee_id", "benefit_type", "service_end_date", name="uq_hr_bd_benefit_case"),
        CheckConstraint(
            "benefit_type IN ('RESIGNATION','DEEMED_RESIGNATION','TERMINATION','RETRENCHMENT','DISMISSAL','RETIREMENT','DEATH')",
            name="ck_hr_bd_benefit_type",
        ),
        CheckConstraint("status IN ('DRAFT','APPROVED','PAID','CANCELLED')", name="ck_hr_bd_benefit_status"),
        CheckConstraint("service_end_date >= service_start_date", name="ck_hr_bd_benefit_dates"),
        CheckConstraint("amount >= 0", name="ck_hr_bd_benefit_amount"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    rule_set_id: Mapped[int | None] = mapped_column(ForeignKey("hr_bd_rule_sets.id", ondelete="RESTRICT"), nullable=True)
    benefit_type: Mapped[str] = mapped_column(String(24), nullable=False)
    service_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    service_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    service_days: Mapped[int] = mapped_column(Integer, nullable=False)
    wage_basis: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    calculation_trace: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
