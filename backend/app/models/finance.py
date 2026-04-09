from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AccountGroup(Base):
    __tablename__ = "account_groups"
    __table_args__ = (
        UniqueConstraint("tenant_id", "system_code", name="uq_account_groups_tenant_system_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    parent_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("account_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    nature: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    affects_gross_profit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_bank_group: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Advanced / COA redesign fields (docs/ACCOUNT_GROUP_REDESIGN.md)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    reporting_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    default_normal_balance: Mapped[str] = mapped_column(String(16), nullable=False, default="debit")
    allow_posting: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_summary_group: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_reviewed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    system_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_protected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class CoAConfig(Base):
    """Tenant-scoped Chart of Accounts code format and limits (one row per tenant)."""
    __tablename__ = "coa_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True, unique=True
    )
    account_number_prefix: Mapped[str] = mapped_column(String(16), nullable=False, default="AC-")
    account_number_width: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    group_code_prefix: Mapped[str] = mapped_column(String(16), nullable=False, default="GRP-")
    group_code_width: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    allow_manual_account_number: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_group_depth: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_account_depth: Mapped[int | None] = mapped_column(Integer, nullable=True)
    validate_normal_balance: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    inventory_stock_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    inventory_clearing_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ChartOfAccount(Base):
    __tablename__ = "chart_of_accounts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "system_code", name="uq_chart_of_accounts_tenant_system_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    account_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    group_id: Mapped[int] = mapped_column(ForeignKey("account_groups.id", ondelete="RESTRICT"), nullable=False, index=True)
    normal_balance: Mapped[str] = mapped_column(String(16), nullable=False, default="debit")
    opening_balance: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    balance: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    account_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    maintain_fc_balance: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_bank_account: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Advanced CoA fields (docs/COA_ADVANCED_DESIGN.md)
    account_type: Mapped[str] = mapped_column(String(32), nullable=False, default="posting", index=True)
    reporting_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    statistical_unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    statistical_formula: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    last_reviewed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    enable_bill_wise: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    system_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_protected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    usage_purpose: Mapped[str | None] = mapped_column(String(128), nullable=True)
    linked_module: Mapped[str | None] = mapped_column(String(64), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Optimistic locking: UPDATE ... WHERE version = :v; must use Column ref, not str "version"
    # (str breaks INSERT return_defaults in SQLAlchemy 2.x).
    __mapper_args__ = {"version_id_col": version}


class AccountingSystemMapping(Base):
    """Maps stable keys (e.g. BTB_NON_ACCEPTED_LC_LIABILITY) to tenant chart_of_accounts.id for posting."""

    __tablename__ = "accounting_system_mappings"
    __table_args__ = (UniqueConstraint("tenant_id", "mapping_key", name="uq_accounting_system_mappings_tenant_key"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    mapping_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("account_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    module: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class VoucherType(Base):
    __tablename__ = "voucher_types"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Voucher(Base):
    __tablename__ = "vouchers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    voucher_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    voucher_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    voucher_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="BDT")
    base_currency: Mapped[str] = mapped_column(String(8), nullable=False, default="BDT")
    exchange_rate: Mapped[str] = mapped_column(String(32), nullable=False, default="1")
    exchange_rate_source: Mapped[str] = mapped_column(String(32), nullable=False, default="system")
    exchange_rate_fetched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    verification_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    signature_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    signed_by_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    trade_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("trade_cases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    mfg_work_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("mfg_work_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    facility_utilization_id: Mapped[int | None] = mapped_column(
        ForeignKey("facility_utilizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Series / control (branch + fiscal year + type; calendar FY until tenant FY config exists)
    branch_code: Mapped[str] = mapped_column(String(32), nullable=False, default="MAIN", index=True)
    fiscal_year: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    series_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    number_series_key: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    # Source: MANUAL, INVENTORY_GL, PAYROLL, WIP, LC_COMMERCIAL, PAYMENT_RUN, REVERSAL, etc.
    source_module: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    source_module_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    allow_manual_edit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    reverses_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reversed_by_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reversal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reversal_recorded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reversal_recorded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    posted_snapshot_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    instrument_reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    duplicate_risk_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    bank_reconciliation_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_reconciliations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class VoucherLine(Base):
    __tablename__ = "voucher_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    voucher_id: Mapped[int] = mapped_column(ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False, index=True)
    cost_center_id: Mapped[int | None] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True, index=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="BDT")
    exchange_rate: Mapped[str] = mapped_column(String(32), nullable=False, default="1")
    base_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    is_rate_overridden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rate_source: Mapped[str] = mapped_column(String(32), nullable=False, default="system")
    entry_type: Mapped[str] = mapped_column(String(8), nullable=False, index=True)  # DEBIT | CREDIT
    amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class CashForecastScenario(Base):
    __tablename__ = "cash_forecast_scenarios"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    months: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class CashForecastLine(Base):
    __tablename__ = "cash_forecast_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    scenario_id: Mapped[int] = mapped_column(
        ForeignKey("cash_forecast_scenarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    month_label: Mapped[str] = mapped_column(String(16), nullable=False)
    inflow: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    outflow: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    net: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    cumulative: Mapped[str] = mapped_column(String(32), nullable=False, default="0")


class FxReceipt(Base):
    __tablename__ = "fx_receipts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    receipt_no: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    receipt_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    fc_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    rate_to_base: Mapped[str] = mapped_column(String(32), nullable=False, default="1")
    base_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    settled_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="OPEN", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class VendorBill(Base):
    """Finance-owned purchase invoice / vendor bill (AP), matched to GRN/PO."""

    __tablename__ = "vendor_bills"
    __table_args__ = (UniqueConstraint("tenant_id", "bill_code", name="uq_vendor_bills_tenant_bill_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bill_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False, index=True)
    vendor_invoice_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vendor_invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    bill_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    exchange_rate_to_base: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    subtotal_amount: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tax_amount: Mapped[str | None] = mapped_column(String(32), nullable=True)
    total_amount: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT", index=True)
    goods_receiving_id: Mapped[int | None] = mapped_column(
        ForeignKey("goods_receiving.id", ondelete="SET NULL"), nullable=True, index=True
    )
    purchase_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_non_po_receipt: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    approved_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    posted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class VendorBillLine(Base):
    __tablename__ = "vendor_bill_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    vendor_bill_id: Mapped[int] = mapped_column(
        ForeignKey("vendor_bills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    goods_receiving_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("goods_receiving_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    purchase_order_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_order_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    unit_price: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    line_total: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tax_rate: Mapped[str | None] = mapped_column(String(16), nullable=True)
    tax_amount: Mapped[str | None] = mapped_column(String(32), nullable=True)


class OutstandingBill(Base):
    __tablename__ = "outstanding_bills"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bill_no: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    party_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    bill_type: Mapped[str] = mapped_column(String(16), nullable=False, default="PAYABLE", index=True)
    bill_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    paid_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="OPEN", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class CostCenter(Base):
    __tablename__ = "cost_centers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    center_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    budget_name: Mapped[str] = mapped_column(String(255), nullable=False)
    fiscal_year: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT", index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class BudgetLine(Base):
    __tablename__ = "budget_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    budget_id: Mapped[int] = mapped_column(ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False, index=True)
    cost_center_id: Mapped[int | None] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True, index=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    period_month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    branch_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    swift_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    routing_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    gl_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    opening_balance: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    current_balance: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class BankReconciliation(Base):
    __tablename__ = "bank_reconciliations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bank_account_id: Mapped[int] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    statement_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    statement_balance: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    book_balance: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    difference_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="OPEN", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_finalized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finalized_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    finalize_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class BankStatementLine(Base):
    __tablename__ = "bank_statement_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    reconciliation_id: Mapped[int] = mapped_column(
        ForeignKey("bank_reconciliations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    debit_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    credit_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    running_balance: Mapped[str | None] = mapped_column(String(32), nullable=True)
    matched_payment_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("payment_runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    matched_status: Mapped[str] = mapped_column(String(16), nullable=False, default="UNMATCHED", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class BankStatementMatchLog(Base):
    __tablename__ = "bank_statement_match_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    reconciliation_id: Mapped[int] = mapped_column(
        ForeignKey("bank_reconciliations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    statement_line_id: Mapped[int] = mapped_column(
        ForeignKey("bank_statement_lines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(16), nullable=False, index=True)  # MATCH|UNMATCH|AUTO_MATCH
    payment_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("payment_runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PaymentRun(Base):
    __tablename__ = "payment_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    run_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    run_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    bank_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    executed_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    trade_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("trade_cases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT", index=True)
    base_currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    total_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PaymentRunItem(Base):
    __tablename__ = "payment_run_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    payment_run_id: Mapped[int] = mapped_column(
        ForeignKey("payment_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bill_id: Mapped[int | None] = mapped_column(
        ForeignKey("outstanding_bills.id", ondelete="SET NULL"), nullable=True, index=True
    )
    party_name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    source_currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    fx_rate_to_base: Mapped[str] = mapped_column(String(32), nullable=False, default="1")
    base_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING", index=True)
    reference: Mapped[str | None] = mapped_column(String(64), nullable=True)


class SettlementAuditPreset(Base):
    __tablename__ = "settlement_audit_presets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    from_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    to_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status_filter: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    party_query: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class BillReference(Base):
    __tablename__ = "bill_references"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bill_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    bill_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    bill_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    party_name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_id: Mapped[int] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False, index=True)
    original_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    pending_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    source_voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True)
    source_doc_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_doc_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN", index=True)
    credit_period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_overdue: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class BillAllocation(Base):
    __tablename__ = "bill_allocations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bill_reference_id: Mapped[int | None] = mapped_column(ForeignKey("bill_references.id", ondelete="SET NULL"), nullable=True, index=True)
    voucher_id: Mapped[int] = mapped_column(ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False, index=True)
    voucher_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("voucher_lines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    allocation_type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    allocation_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class AccountingPeriod(Base):
    __tablename__ = "accounting_periods"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    period_name: Mapped[str] = mapped_column(String(64), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
