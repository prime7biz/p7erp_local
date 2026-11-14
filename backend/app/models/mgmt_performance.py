"""Finance > Management Performance tables (migration 302). Docs: docs/management-performance/.

Nothing reads or writes these tables while the strict tenant flag ``mgmt_performance_v1`` is OFF. No voucher is
ever written from here; a budget revision only changes ``budget_lines.amount`` after a four-eyes approval.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

OPERATING_CATEGORIES: tuple[str, ...] = (
    "PAYROLL",
    "FINANCE_COST",
    "UTILITIES",
    "TRANSPORT",
    "ADMIN",
    "FACTORY_OVERHEAD",
    "SALES_MARKETING",
    "TAX",
)
DIRECT_CATEGORIES: tuple[str, ...] = ("DIRECT_MATERIAL", "DIRECT_PROCESS", "DIRECT_LANDED", "DIRECT_SELLING")
EXCLUDED_CATEGORY = "EXCLUDED"  # expense account that is neither opex nor direct (e.g. depreciation adjustments)
ALL_CATEGORIES: tuple[str, ...] = OPERATING_CATEGORIES + DIRECT_CATEGORIES + (EXCLUDED_CATEGORY,)

EXCEPTION_FAMILIES: tuple[str, ...] = ("BUDGET", "UNBUDGETED", "UNMAPPED")
EXCEPTION_SEVERITIES: tuple[str, ...] = ("WARNING", "AT_RISK", "FAILED")
EXCEPTION_STATUSES: tuple[str, ...] = ("OPEN", "RESPONDED", "REVIEWED", "APPROVED", "REJECTED")
EXCEPTION_ACTIONS: tuple[str, ...] = ("RESPOND", "REVIEW", "APPROVE", "REJECT")
REVISION_KINDS: tuple[str, ...] = ("CHANGE", "ADD_LINE")
REVISION_STATUSES: tuple[str, ...] = ("PENDING", "APPROVED", "REJECTED")


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


class MgmtExpenseCategoryMap(Base):
    """Ledger account or account group -> management category. Account beats group; child group beats parent."""

    __tablename__ = "mgmt_expense_category_map"
    __table_args__ = (
        CheckConstraint("num_nonnulls(account_id, account_group_id) = 1", name="ck_mgmt_cat_map_one_target"),
        CheckConstraint(f"category IN ({_in(ALL_CATEGORIES)})", name="ck_mgmt_cat_map_category"),
        Index(
            "uq_mgmt_cat_map_tenant_account", "tenant_id", "account_id", unique=True,
            postgresql_where=text("account_id IS NOT NULL"),
        ),
        Index(
            "uq_mgmt_cat_map_tenant_group", "tenant_id", "account_group_id", unique=True,
            postgresql_where=text("account_group_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="CASCADE"), nullable=True)
    account_group_id: Mapped[int | None] = mapped_column(ForeignKey("account_groups.id", ondelete="CASCADE"), nullable=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class MgmtCategoryThreshold(Base):
    """Early-warning percentage of budget per operating category (Finance sets it; default 90)."""

    __tablename__ = "mgmt_category_thresholds"
    __table_args__ = (
        UniqueConstraint("tenant_id", "category", name="uq_mgmt_thresholds_tenant_category"),
        CheckConstraint("warning_pct >= 0 AND warning_pct <= 100", name="ck_mgmt_thresholds_pct"),
        CheckConstraint(f"category IN ({_in(OPERATING_CATEGORIES)})", name="ck_mgmt_thresholds_category"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    warning_pct: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class MgmtMonthlyTarget(Base):
    """Monthly net-profit target and contingency reserve % (of forecast operating cost)."""

    __tablename__ = "mgmt_monthly_targets"
    __table_args__ = (
        UniqueConstraint("tenant_id", "period_month", name="uq_mgmt_targets_tenant_month"),
        CheckConstraint("contingency_pct >= 0 AND contingency_pct <= 100", name="ck_mgmt_targets_contingency"),
        CheckConstraint("target_profit_amount >= 0", name="ck_mgmt_targets_profit"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    period_month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    target_profit_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    contingency_pct: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class BudgetException(Base):
    """One budget problem per month x cost centre x category (x account for UNMAPPED). Severity only rises."""

    __tablename__ = "budget_exceptions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "dedupe_key", name="uq_budget_exceptions_tenant_key"),
        CheckConstraint(f"family IN ({_in(EXCEPTION_FAMILIES)})", name="ck_budget_exceptions_family"),
        CheckConstraint(f"severity IN ({_in(EXCEPTION_SEVERITIES)})", name="ck_budget_exceptions_severity"),
        CheckConstraint(f"status IN ({_in(EXCEPTION_STATUSES)})", name="ck_budget_exceptions_status"),
        Index("ix_budget_exceptions_tenant_month_status", "tenant_id", "period_month", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    period_month: Mapped[str] = mapped_column(String(7), nullable=False)
    cost_center_id: Mapped[int | None] = mapped_column(
        ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True)
    family: Mapped[str] = mapped_column(String(16), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="OPEN")
    dedupe_key: Mapped[str] = mapped_column(String(160), nullable=False)
    budget_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    actual_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    forecast_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrective_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    revised_forecast: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    responded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    last_scanned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class BudgetExceptionAction(Base):
    """Append-only log of workflow actions; unique request id makes a double submit a replay."""

    __tablename__ = "budget_exception_actions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "request_id", name="uq_budget_exception_actions_request"),
        CheckConstraint(f"action IN ({_in(EXCEPTION_ACTIONS)})", name="ck_budget_exception_actions_action"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    exception_id: Mapped[int] = mapped_column(
        ForeignKey("budget_exceptions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class BudgetLineRevision(Base):
    """Audited change to a FINAL budget (CHANGE an existing line or ADD_LINE). The line id may later be NULL
    (old budget screen deleted it while the flag was off); the snapshot columns keep the history readable."""

    __tablename__ = "budget_line_revisions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "request_id", name="uq_budget_line_revisions_request"),
        CheckConstraint(f"kind IN ({_in(REVISION_KINDS)})", name="ck_budget_line_revisions_kind"),
        CheckConstraint(f"status IN ({_in(REVISION_STATUSES)})", name="ck_budget_line_revisions_status"),
        CheckConstraint("new_amount >= 0", name="ck_budget_line_revisions_amount"),
        Index(
            "uq_budget_line_revisions_line_no", "budget_line_id", "revision_no", unique=True,
            postgresql_where=text("budget_line_id IS NOT NULL AND revision_no IS NOT NULL"),
        ),
        Index("ix_budget_line_revisions_tenant_status", "tenant_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    budget_id: Mapped[int | None] = mapped_column(ForeignKey("budgets.id", ondelete="SET NULL"), nullable=True, index=True)
    budget_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("budget_lines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    revision_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_center_id: Mapped[int | None] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True)
    period_month: Mapped[str] = mapped_column(String(7), nullable=False)
    old_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    new_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    exception_id: Mapped[int | None] = mapped_column(
        ForeignKey("budget_exceptions.id", ondelete="SET NULL"), nullable=True
    )
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    requested_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
