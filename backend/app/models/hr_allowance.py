"""Company allowances and bonuses (migration 287): tiffin / dinner / night bills, production bonus,
festival-bonus allocations.

Accounting ownership: each entry is paid either through one payroll run line
(``payroll_run_line_id``) or one final settlement (``final_settlement_id``), never both.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

MONEY = Numeric(18, 4)
ONE_OWNER = "payroll_run_line_id IS NULL OR final_settlement_id IS NULL"


class HrAllowanceRule(Base):
    __tablename__ = "hr_allowance_rules"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_hr_allowance_rule_code"),
        CheckConstraint("bill_type IN ('TIFFIN','DINNER','NIGHT')", name="ck_hr_allowance_rule_type"),
        CheckConstraint(
            "eligibility_basis IN ('PRESENT','NIGHT_SHIFT','MIN_WORK_MINUTES','MIN_OT_MINUTES')",
            name="ck_hr_allowance_rule_basis",
        ),
        CheckConstraint("status IN ('DRAFT','APPROVED','RETIRED')", name="ck_hr_allowance_rule_status"),
        CheckConstraint("amount >= 0 AND threshold_minutes >= 0", name="ck_hr_allowance_rule_non_negative"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="ck_hr_allowance_rule_dates"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(24), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    bill_type: Mapped[str] = mapped_column(String(16), nullable=False)
    eligibility_basis: Mapped[str] = mapped_column(String(24), nullable=False)
    threshold_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrAllowanceEntry(Base):
    __tablename__ = "hr_allowance_entries"
    __table_args__ = (
        UniqueConstraint("tenant_id", "employee_id", "work_date", "rule_id", name="uq_hr_allowance_entry_source"),
        CheckConstraint("status IN ('PENDING','APPROVED','REJECTED','PAID')", name="ck_hr_allowance_entry_status"),
        CheckConstraint("amount >= 0", name="ck_hr_allowance_entry_amount"),
        CheckConstraint(ONE_OWNER, name="ck_hr_allowance_entry_one_owner"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("hr_allowance_rules.id", ondelete="RESTRICT"), nullable=False)
    attendance_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_attendance_entries.id", ondelete="SET NULL"), nullable=True
    )
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    correction_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payroll_run_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_payroll_run_lines.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    final_settlement_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_final_settlements.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrProductionBonusScheme(Base):
    __tablename__ = "hr_production_bonus_schemes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_hr_production_scheme_code"),
        CheckConstraint("basis IN ('PIECE','EFFICIENCY','TARGET')", name="ck_hr_production_scheme_basis"),
        CheckConstraint("status IN ('DRAFT','APPROVED','RETIRED')", name="ck_hr_production_scheme_status"),
        CheckConstraint("cap_amount IS NULL OR cap_amount >= 0", name="ck_hr_production_scheme_cap"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="ck_hr_production_scheme_dates"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(24), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    basis: Mapped[str] = mapped_column(String(16), nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    cap_amount: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrProductionBonusEntry(Base):
    __tablename__ = "hr_production_bonus_entries"
    __table_args__ = (
        UniqueConstraint("tenant_id", "employee_id", "scheme_id", "period_code", name="uq_hr_production_entry_source"),
        CheckConstraint("status IN ('PENDING','APPROVED','REJECTED','PAID')", name="ck_hr_production_entry_status"),
        CheckConstraint("amount >= 0 AND quantity >= 0", name="ck_hr_production_entry_non_negative"),
        CheckConstraint(ONE_OWNER, name="ck_hr_production_entry_one_owner"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    scheme_id: Mapped[int] = mapped_column(ForeignKey("hr_production_bonus_schemes.id", ondelete="RESTRICT"), nullable=False)
    period_code: Mapped[str] = mapped_column(String(16), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    source_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    efficiency_pct: Mapped[Decimal | None] = mapped_column(Numeric(9, 2), nullable=True)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    trace_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payroll_run_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_payroll_run_lines.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    final_settlement_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_final_settlements.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrBonusAllocationLine(Base):
    __tablename__ = "hr_bonus_allocation_lines"
    __table_args__ = (
        UniqueConstraint("tenant_id", "bonus_declaration_id", "employee_id", name="uq_hr_bonus_allocation_employee"),
        CheckConstraint("status IN ('PENDING','APPROVED','EXCLUDED','PAID')", name="ck_hr_bonus_allocation_status"),
        CheckConstraint("amount >= 0 AND basis_amount >= 0", name="ck_hr_bonus_allocation_non_negative"),
        CheckConstraint(ONE_OWNER, name="ck_hr_bonus_allocation_one_owner"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bonus_declaration_id: Mapped[int] = mapped_column(
        ForeignKey("hr_bonus_declarations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    eligible: Mapped[bool] = mapped_column(nullable=False)
    eligibility_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    basis_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payroll_run_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_payroll_run_lines.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    final_settlement_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_final_settlements.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
