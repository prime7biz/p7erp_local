"""Sub-accounts and draft-safe Tally bill references.

Behind tenant flag ``finance_sub_ledger_tracking_v1`` (strict, default OFF).
New tables ship with the same ``p7_tenant_isolation`` policy as migration 270.
Existing columns are added nullable so current rows keep working.

Rollback: switch the flag off, export ``finance_sub_accounts`` and
``voucher_line_bill_intents`` if you need them, then ``alembic downgrade 338``.

Revision ID: 339
Revises: 338
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "339"
down_revision: Union[str, None] = "338"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"


def _enable_rls(table: str) -> None:
    expr = f"({_RLS_BYPASS}) OR ({_RLS_SAME_TENANT})"
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(
        f"CREATE POLICY {RLS_POLICY_NAME} ON {table} AS PERMISSIVE FOR ALL USING ({expr}) WITH CHECK ({expr})"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.create_table(
        "finance_sub_accounts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "code", name="uq_finance_sub_accounts_tenant_code"),
        sa.CheckConstraint(
            "category IN ('EMPLOYEE_ADVANCE','HAND_LOAN_LENDER','LOAN_BORROWER','PARTY','OTHER')",
            name="ck_finance_sub_accounts_category",
        ),
    )
    op.create_index("ix_finance_sub_accounts_tenant_id", "finance_sub_accounts", ["tenant_id"])
    op.create_index(
        "ix_finance_sub_accounts_tenant_category_active",
        "finance_sub_accounts",
        ["tenant_id", "category", "is_active"],
    )
    _enable_rls("finance_sub_accounts")

    op.add_column(
        "chart_of_accounts",
        sa.Column("enable_sub_accounts", sa.Boolean(), nullable=True, server_default=sa.text("false")),
    )
    op.add_column(
        "voucher_lines",
        sa.Column("sub_account_id", sa.Integer(), sa.ForeignKey("finance_sub_accounts.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_voucher_lines_sub_account_id", "voucher_lines", ["sub_account_id"])
    op.add_column(
        "bill_references",
        sa.Column("sub_account_id", sa.Integer(), sa.ForeignKey("finance_sub_accounts.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("bill_references", sa.Column("entry_side", sa.String(8), nullable=True))
    op.create_check_constraint(
        "ck_bill_references_entry_side",
        "bill_references",
        "entry_side IS NULL OR entry_side IN ('DEBIT', 'CREDIT')",
    )
    op.create_index("ix_bill_references_sub_account_id", "bill_references", ["sub_account_id"])
    op.add_column(
        "bill_allocations",
        sa.Column("sub_account_id", sa.Integer(), sa.ForeignKey("finance_sub_accounts.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_bill_allocations_sub_account_id", "bill_allocations", ["sub_account_id"])

    op.create_table(
        "voucher_line_bill_intents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("voucher_line_id", sa.Integer(), sa.ForeignKey("voucher_lines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("sub_account_id", sa.Integer(), sa.ForeignKey("finance_sub_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("allocation_type", sa.String(20), nullable=False),
        sa.Column("reference_no", sa.String(50), nullable=True),
        sa.Column("target_bill_reference_id", sa.Integer(), sa.ForeignKey("bill_references.id", ondelete="SET NULL"), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("lifecycle_status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint(
            "allocation_type IN ('NEW_REF','AGAINST_REF','ADVANCE','ON_ACCOUNT')",
            name="ck_vlbi_allocation_type",
        ),
        sa.CheckConstraint(
            "lifecycle_status IN ('PENDING','APPLIED','REVERSED','CANCELLED')",
            name="ck_vlbi_lifecycle",
        ),
        sa.CheckConstraint("amount > 0", name="ck_vlbi_amount_positive"),
    )
    op.create_index("ix_vlbi_tenant_voucher", "voucher_line_bill_intents", ["tenant_id", "voucher_id"])
    op.create_index("ix_vlbi_tenant_line", "voucher_line_bill_intents", ["tenant_id", "voucher_line_id"])
    op.create_index("ix_vlbi_tenant_target", "voucher_line_bill_intents", ["tenant_id", "target_bill_reference_id"])
    op.create_index("ix_voucher_line_bill_intents_tenant_id", "voucher_line_bill_intents", ["tenant_id"])
    _enable_rls("voucher_line_bill_intents")


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON voucher_line_bill_intents")
    op.drop_index("ix_voucher_line_bill_intents_tenant_id", table_name="voucher_line_bill_intents")
    op.drop_index("ix_vlbi_tenant_target", table_name="voucher_line_bill_intents")
    op.drop_index("ix_vlbi_tenant_line", table_name="voucher_line_bill_intents")
    op.drop_index("ix_vlbi_tenant_voucher", table_name="voucher_line_bill_intents")
    op.drop_table("voucher_line_bill_intents")
    op.drop_index("ix_bill_allocations_sub_account_id", table_name="bill_allocations")
    op.drop_column("bill_allocations", "sub_account_id")
    op.drop_constraint("ck_bill_references_entry_side", "bill_references", type_="check")
    op.drop_index("ix_bill_references_sub_account_id", table_name="bill_references")
    op.drop_column("bill_references", "entry_side")
    op.drop_column("bill_references", "sub_account_id")
    op.drop_index("ix_voucher_lines_sub_account_id", table_name="voucher_lines")
    op.drop_column("voucher_lines", "sub_account_id")
    op.drop_column("chart_of_accounts", "enable_sub_accounts")
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON finance_sub_accounts")
    op.drop_index("ix_finance_sub_accounts_tenant_category_active", table_name="finance_sub_accounts")
    op.drop_index("ix_finance_sub_accounts_tenant_id", table_name="finance_sub_accounts")
    op.drop_table("finance_sub_accounts")
