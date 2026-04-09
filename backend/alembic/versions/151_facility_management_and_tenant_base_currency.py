"""Facility management, tenant base_currency, voucher link, financier_party FK.

Revision ID: 151
Revises: 150
Create Date: 2026-04-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
revision: str = "151"
down_revision: Union[str, None] = "150"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("base_currency", sa.String(length=10), nullable=False, server_default="BDT"),
    )

    op.create_table(
        "facilities",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("facility_code", sa.String(length=32), nullable=False),
        sa.Column("facility_type", sa.String(length=32), nullable=False),
        sa.Column("financier_party_id", sa.Integer(), nullable=True),
        sa.Column("financier_name", sa.String(length=255), nullable=True),
        sa.Column("linked_master_contract_id", sa.Integer(), nullable=True),
        sa.Column("linked_btb_lc_id", sa.Integer(), nullable=True),
        sa.Column("sanctioned_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("exchange_rate_to_base", sa.Numeric(18, 6), nullable=True),
        sa.Column("base_currency_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("rate_source", sa.String(length=64), nullable=True),
        sa.Column("manual_rate_override_reason", sa.Text(), nullable=True),
        sa.Column("utilized_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("available_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("sanction_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("interest_rate", sa.Numeric(10, 4), nullable=True),
        sa.Column("interest_type", sa.String(length=32), nullable=True),
        sa.Column("penalty_interest_rate", sa.Numeric(10, 4), nullable=True),
        sa.Column("penalty_method", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("classification", sa.String(length=16), nullable=True),
        sa.Column("gl_liability_account_id", sa.Integer(), nullable=True),
        sa.Column("gl_interest_expense_account_id", sa.Integer(), nullable=True),
        sa.Column("gl_interest_payable_account_id", sa.Integer(), nullable=True),
        sa.Column("gl_penalty_expense_account_id", sa.Integer(), nullable=True),
        sa.Column("linked_bank_account_id", sa.Integer(), nullable=True),
        sa.Column("repayment_source_account_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["financier_party_id"], ["external_principals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_master_contract_id"], ["master_contracts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_btb_lc_id"], ["btb_lcs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["gl_liability_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["gl_interest_expense_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["gl_interest_payable_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["gl_penalty_expense_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_bank_account_id"], ["bank_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["repayment_source_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "facility_code", name="uq_facilities_tenant_code"),
    )
    op.create_index("ix_facilities_tenant_id", "facilities", ["tenant_id"], unique=False)
    op.create_index("ix_facilities_facility_code", "facilities", ["facility_code"], unique=False)
    op.create_index("ix_facilities_facility_type", "facilities", ["facility_type"], unique=False)
    op.create_index("ix_facilities_financier_party_id", "facilities", ["financier_party_id"], unique=False)
    op.create_index("ix_facilities_status", "facilities", ["status"], unique=False)

    op.create_table(
        "facility_utilizations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("utilization_code", sa.String(length=32), nullable=False),
        sa.Column("utilization_type", sa.String(length=32), nullable=False, server_default="drawdown"),
        sa.Column("principal_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("exchange_rate_to_base", sa.Numeric(18, 6), nullable=True),
        sa.Column("base_currency_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("rate_source", sa.String(length=64), nullable=True),
        sa.Column("manual_rate_override_reason", sa.Text(), nullable=True),
        sa.Column("disbursement_date", sa.Date(), nullable=True),
        sa.Column("first_accrual_date", sa.Date(), nullable=True),
        sa.Column("first_repayment_date", sa.Date(), nullable=True),
        sa.Column("maturity_date", sa.Date(), nullable=True),
        sa.Column("moratorium_months", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("grace_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("interest_rate", sa.Numeric(10, 4), nullable=True),
        sa.Column("interest_type", sa.String(length=32), nullable=True),
        sa.Column("repayment_policy", sa.String(length=48), nullable=False, server_default="emi_reducing"),
        sa.Column("installment_frequency", sa.String(length=24), nullable=False, server_default="monthly"),
        sa.Column("num_installments", sa.Integer(), nullable=True),
        sa.Column("emi_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("total_interest", sa.Numeric(18, 2), nullable=True),
        sa.Column("total_repayable", sa.Numeric(18, 2), nullable=True),
        sa.Column("outstanding_principal", sa.Numeric(18, 2), nullable=True),
        sa.Column("accrued_interest_outstanding", sa.Numeric(18, 2), nullable=True),
        sa.Column("overdue_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("utilization_classification", sa.String(length=16), nullable=True),
        sa.Column("is_restructured", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("restructure_reason", sa.Text(), nullable=True),
        sa.Column("restructure_date", sa.Date(), nullable=True),
        sa.Column("settlement_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("settlement_date", sa.Date(), nullable=True),
        sa.Column("schedule_generation_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("manual_schedule_json", sa.JSON(), nullable=True),
        sa.Column("linked_btb_lc_id", sa.Integer(), nullable=True),
        sa.Column("linked_purchase_order_id", sa.Integer(), nullable=True),
        sa.Column("disbursement_voucher_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["linked_btb_lc_id"], ["btb_lcs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_purchase_order_id"], ["purchase_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["disbursement_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "utilization_code", name="uq_facility_utilizations_tenant_code"),
    )
    op.create_index("ix_facility_utilizations_tenant_id", "facility_utilizations", ["tenant_id"], unique=False)
    op.create_index("ix_facility_utilizations_facility_id", "facility_utilizations", ["facility_id"], unique=False)
    op.create_index("ix_facility_utilizations_utilization_code", "facility_utilizations", ["utilization_code"], unique=False)
    op.create_index("ix_facility_utilizations_status", "facility_utilizations", ["status"], unique=False)

    op.add_column(
        "vouchers",
        sa.Column("facility_utilization_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_vouchers_facility_utilization_id", "vouchers", ["facility_utilization_id"], unique=False)
    op.create_foreign_key(
        "fk_vouchers_facility_utilization_id",
        "vouchers",
        "facility_utilizations",
        ["facility_utilization_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "repayment_schedule_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("facility_utilization_id", sa.Integer(), nullable=False),
        sa.Column("installment_number", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("principal_component", sa.Numeric(18, 4), nullable=True),
        sa.Column("interest_component", sa.Numeric(18, 4), nullable=True),
        sa.Column("emi_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("outstanding_after_payment", sa.Numeric(18, 4), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="upcoming"),
        sa.Column("paid_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("paid_date", sa.Date(), nullable=True),
        sa.Column("payment_voucher_id", sa.Integer(), nullable=True),
        sa.Column("draft_voucher_id", sa.Integer(), nullable=True),
        sa.Column("penalty_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("penalty_voucher_id", sa.Integer(), nullable=True),
        sa.Column("grace_due_date", sa.Date(), nullable=True),
        sa.Column("schedule_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_utilization_id"], ["facility_utilizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payment_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["draft_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["penalty_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_repayment_schedule_lines_tenant_id", "repayment_schedule_lines", ["tenant_id"], unique=False)
    op.create_index(
        "ix_repayment_schedule_lines_facility_utilization_id",
        "repayment_schedule_lines",
        ["facility_utilization_id"],
        unique=False,
    )
    op.create_index("ix_repayment_schedule_lines_due_date", "repayment_schedule_lines", ["due_date"], unique=False)
    op.create_index("ix_repayment_schedule_lines_status", "repayment_schedule_lines", ["status"], unique=False)
    op.create_index("ix_repayment_schedule_lines_grace_due_date", "repayment_schedule_lines", ["grace_due_date"], unique=False)

    op.create_table(
        "interest_accruals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("facility_utilization_id", sa.Integer(), nullable=False),
        sa.Column("accrual_month", sa.String(length=8), nullable=False),
        sa.Column("accrual_date", sa.Date(), nullable=False),
        sa.Column("outstanding_principal_at_accrual", sa.Numeric(18, 4), nullable=True),
        sa.Column("interest_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("journal_voucher_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("reversal_voucher_id", sa.Integer(), nullable=True),
        sa.Column("reversal_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_utilization_id"], ["facility_utilizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["journal_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reversal_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "facility_utilization_id",
            "accrual_month",
            name="uq_interest_accruals_tenant_util_month",
        ),
    )
    op.create_index("ix_interest_accruals_tenant_id", "interest_accruals", ["tenant_id"], unique=False)
    op.create_index("ix_interest_accruals_accrual_month", "interest_accruals", ["accrual_month"], unique=False)
    op.create_index("ix_interest_accruals_status", "interest_accruals", ["status"], unique=False)

    op.create_table(
        "facility_transactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("facility_utilization_id", sa.Integer(), nullable=True),
        sa.Column("transaction_type", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("base_currency_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("voucher_id", sa.Integer(), nullable=True),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_utilization_id"], ["facility_utilizations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_facility_transactions_tenant_id", "facility_transactions", ["tenant_id"], unique=False)
    op.create_index("ix_facility_transactions_facility_id", "facility_transactions", ["facility_id"], unique=False)
    op.create_index("ix_facility_transactions_transaction_type", "facility_transactions", ["transaction_type"], unique=False)

    op.create_table(
        "repayment_allocations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("facility_utilization_id", sa.Integer(), nullable=False),
        sa.Column("repayment_schedule_line_id", sa.Integer(), nullable=True),
        sa.Column("voucher_id", sa.Integer(), nullable=False),
        sa.Column("allocated_principal", sa.Numeric(18, 4), nullable=True),
        sa.Column("allocated_interest", sa.Numeric(18, 4), nullable=True),
        sa.Column("allocated_penalty", sa.Numeric(18, 4), nullable=True),
        sa.Column("allocation_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_utilization_id"], ["facility_utilizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["repayment_schedule_line_id"], ["repayment_schedule_lines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_repayment_allocations_tenant_id", "repayment_allocations", ["tenant_id"], unique=False)

    op.create_table(
        "facility_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=True),
        sa.Column("facility_utilization_id", sa.Integer(), nullable=True),
        sa.Column("snapshot_type", sa.String(length=48), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("snapshot_month", sa.String(length=8), nullable=False),
        sa.Column("snapshot_scope_key", sa.String(length=192), nullable=False),
        sa.Column("data_json", sa.JSON(), nullable=True),
        sa.Column("generated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_utilization_id"], ["facility_utilizations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["generated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "snapshot_scope_key", name="uq_facility_snapshots_tenant_scope"),
    )
    op.create_index("ix_facility_snapshots_tenant_id", "facility_snapshots", ["tenant_id"], unique=False)
    op.create_index("ix_facility_snapshots_snapshot_type", "facility_snapshots", ["snapshot_type"], unique=False)
    op.create_index("ix_facility_snapshots_snapshot_month", "facility_snapshots", ["snapshot_month"], unique=False)

    op.create_foreign_key(
        "fk_external_financier_access_financier_party_id",
        "external_financier_access",
        "external_principals",
        ["financier_party_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_external_financier_access_financier_party_id", "external_financier_access", type_="foreignkey")
    op.drop_table("facility_snapshots")
    op.drop_table("repayment_allocations")
    op.drop_table("facility_transactions")
    op.drop_table("interest_accruals")
    op.drop_table("repayment_schedule_lines")
    op.drop_constraint("fk_vouchers_facility_utilization_id", "vouchers", type_="foreignkey")
    op.drop_index("ix_vouchers_facility_utilization_id", table_name="vouchers")
    op.drop_column("vouchers", "facility_utilization_id")
    op.drop_table("facility_utilizations")
    op.drop_table("facilities")
    op.drop_column("tenants", "base_currency")
