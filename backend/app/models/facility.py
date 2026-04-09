"""Tenant facilities (credit lines / loan contracts) and utilizations (drawdowns / exposures)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Facility(Base):
    """Sanctioned line / contract / limit with financier relationship."""

    __tablename__ = "facilities"
    __table_args__ = (UniqueConstraint("tenant_id", "facility_code", name="uq_facilities_tenant_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    facility_type: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )  # term_loan | working_capital | btb_lc_facility | overdraft | one_time_settlement | custom
    financier_party_id: Mapped[int | None] = mapped_column(
        ForeignKey("external_principals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    financier_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    linked_master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    linked_btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sanctioned_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    exchange_rate_to_base: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    base_currency_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    rate_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    manual_rate_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    utilized_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True, default=0)
    available_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    sanction_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    interest_rate: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    interest_type: Mapped[str | None] = mapped_column(String(32), nullable=True)  # fixed | reducing_balance | flat
    penalty_interest_rate: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    penalty_method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    classification: Mapped[str | None] = mapped_column(String(16), nullable=True)  # current | non_current
    gl_liability_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    gl_interest_expense_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    gl_interest_payable_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    gl_penalty_expense_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    linked_bank_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    repayment_source_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class FacilityUtilization(Base):
    """Drawdown / obligation under a facility."""

    __tablename__ = "facility_utilizations"
    __table_args__ = (UniqueConstraint("tenant_id", "utilization_code", name="uq_facility_utilizations_tenant_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_id: Mapped[int] = mapped_column(ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    utilization_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    utilization_type: Mapped[str] = mapped_column(String(32), nullable=False, default="drawdown", index=True)
    principal_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    exchange_rate_to_base: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    base_currency_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    rate_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    manual_rate_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    disbursement_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    first_accrual_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    first_repayment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    maturity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    moratorium_months: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    grace_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    interest_rate: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    interest_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    repayment_policy: Mapped[str] = mapped_column(String(48), nullable=False, default="emi_reducing", index=True)
    installment_frequency: Mapped[str] = mapped_column(String(24), nullable=False, default="monthly")
    num_installments: Mapped[int | None] = mapped_column(Integer, nullable=True)
    emi_amount: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    total_interest: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    total_repayable: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    outstanding_principal: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    accrued_interest_outstanding: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    overdue_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    utilization_classification: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_restructured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    restructure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    restructure_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    settlement_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    settlement_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    schedule_generation_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    manual_schedule_json: Mapped[list[Any] | dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    linked_btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    linked_purchase_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    disbursement_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class RepaymentScheduleLine(Base):
    __tablename__ = "repayment_schedule_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_utilization_id: Mapped[int] = mapped_column(
        ForeignKey("facility_utilizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    installment_number: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    principal_component: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    interest_component: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    emi_amount: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    outstanding_after_payment: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="upcoming", index=True)
    paid_amount: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    draft_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    penalty_amount: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    penalty_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    grace_due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    schedule_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class InterestAccrual(Base):
    __tablename__ = "interest_accruals"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "facility_utilization_id",
            "accrual_month",
            name="uq_interest_accruals_tenant_util_month",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_utilization_id: Mapped[int] = mapped_column(
        ForeignKey("facility_utilizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    accrual_month: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    accrual_date: Mapped[date] = mapped_column(Date, nullable=False)
    outstanding_principal_at_accrual: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    interest_amount: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    journal_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending", index=True)
    reversal_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reversal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class FacilityTransaction(Base):
    __tablename__ = "facility_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_id: Mapped[int] = mapped_column(ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_utilization_id: Mapped[int | None] = mapped_column(
        ForeignKey("facility_utilizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    transaction_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    amount: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    base_currency_amount: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True)
    date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class RepaymentAllocation(Base):
    __tablename__ = "repayment_allocations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_utilization_id: Mapped[int] = mapped_column(
        ForeignKey("facility_utilizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    repayment_schedule_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("repayment_schedule_lines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    voucher_id: Mapped[int] = mapped_column(ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False, index=True)
    allocated_principal: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    allocated_interest: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    allocated_penalty: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    allocation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class FacilitySnapshot(Base):
    __tablename__ = "facility_snapshots"
    __table_args__ = (UniqueConstraint("tenant_id", "snapshot_scope_key", name="uq_facility_snapshots_tenant_scope"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_id: Mapped[int | None] = mapped_column(ForeignKey("facilities.id", ondelete="CASCADE"), nullable=True, index=True)
    facility_utilization_id: Mapped[int | None] = mapped_column(
        ForeignKey("facility_utilizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    snapshot_type: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    snapshot_month: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    snapshot_scope_key: Mapped[str] = mapped_column(String(192), nullable=False)
    data_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    generated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
