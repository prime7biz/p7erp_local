"""Add finance next-wave tables and columns

Revision ID: 014
Revises: 013
Create Date: 2026-03-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chart_of_accounts", sa.Column("account_currency", sa.String(length=10), nullable=True))
    op.add_column(
        "chart_of_accounts",
        sa.Column("maintain_fc_balance", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_table(
        "cost_centers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("center_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("department", sa.String(length=128), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_cost_centers_tenant_id", "cost_centers", ["tenant_id"])
    op.create_index("ix_cost_centers_center_code", "cost_centers", ["center_code"])

    op.create_table(
        "outstanding_bills",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("bill_no", sa.String(length=32), nullable=False),
        sa.Column("party_name", sa.String(length=255), nullable=False),
        sa.Column("bill_type", sa.String(length=16), nullable=False, server_default="PAYABLE"),
        sa.Column("bill_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("paid_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="BDT"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="OPEN"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_outstanding_bills_tenant_id", "outstanding_bills", ["tenant_id"])
    op.create_index("ix_outstanding_bills_bill_no", "outstanding_bills", ["bill_no"])
    op.create_index("ix_outstanding_bills_party_name", "outstanding_bills", ["party_name"])
    op.create_index("ix_outstanding_bills_bill_type", "outstanding_bills", ["bill_type"])
    op.create_index("ix_outstanding_bills_bill_date", "outstanding_bills", ["bill_date"])
    op.create_index("ix_outstanding_bills_due_date", "outstanding_bills", ["due_date"])
    op.create_index("ix_outstanding_bills_status", "outstanding_bills", ["status"])

    op.create_table(
        "budgets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("budget_name", sa.String(length=255), nullable=False),
        sa.Column("fiscal_year", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="DRAFT"),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_budgets_tenant_id", "budgets", ["tenant_id"])
    op.create_index("ix_budgets_fiscal_year", "budgets", ["fiscal_year"])
    op.create_index("ix_budgets_status", "budgets", ["status"])

    op.create_table(
        "budget_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("budget_id", sa.Integer(), nullable=False),
        sa.Column("cost_center_id", sa.Integer(), nullable=True),
        sa.Column("account_id", sa.Integer(), nullable=True),
        sa.Column("period_month", sa.String(length=7), nullable=False),
        sa.Column("amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["budget_id"], ["budgets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["cost_center_id"], ["cost_centers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_budget_lines_tenant_id", "budget_lines", ["tenant_id"])
    op.create_index("ix_budget_lines_budget_id", "budget_lines", ["budget_id"])
    op.create_index("ix_budget_lines_cost_center_id", "budget_lines", ["cost_center_id"])
    op.create_index("ix_budget_lines_account_id", "budget_lines", ["account_id"])
    op.create_index("ix_budget_lines_period_month", "budget_lines", ["period_month"])

    op.add_column("voucher_lines", sa.Column("cost_center_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_voucher_lines_cost_center_id",
        "voucher_lines",
        "cost_centers",
        ["cost_center_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_voucher_lines_cost_center_id", "voucher_lines", ["cost_center_id"])


def downgrade() -> None:
    op.drop_index("ix_voucher_lines_cost_center_id", table_name="voucher_lines")
    op.drop_constraint("fk_voucher_lines_cost_center_id", "voucher_lines", type_="foreignkey")
    op.drop_column("voucher_lines", "cost_center_id")

    op.drop_index("ix_budget_lines_period_month", table_name="budget_lines")
    op.drop_index("ix_budget_lines_account_id", table_name="budget_lines")
    op.drop_index("ix_budget_lines_cost_center_id", table_name="budget_lines")
    op.drop_index("ix_budget_lines_budget_id", table_name="budget_lines")
    op.drop_index("ix_budget_lines_tenant_id", table_name="budget_lines")
    op.drop_table("budget_lines")

    op.drop_index("ix_budgets_status", table_name="budgets")
    op.drop_index("ix_budgets_fiscal_year", table_name="budgets")
    op.drop_index("ix_budgets_tenant_id", table_name="budgets")
    op.drop_table("budgets")

    op.drop_index("ix_outstanding_bills_status", table_name="outstanding_bills")
    op.drop_index("ix_outstanding_bills_due_date", table_name="outstanding_bills")
    op.drop_index("ix_outstanding_bills_bill_date", table_name="outstanding_bills")
    op.drop_index("ix_outstanding_bills_bill_type", table_name="outstanding_bills")
    op.drop_index("ix_outstanding_bills_party_name", table_name="outstanding_bills")
    op.drop_index("ix_outstanding_bills_bill_no", table_name="outstanding_bills")
    op.drop_index("ix_outstanding_bills_tenant_id", table_name="outstanding_bills")
    op.drop_table("outstanding_bills")

    op.drop_index("ix_cost_centers_center_code", table_name="cost_centers")
    op.drop_index("ix_cost_centers_tenant_id", table_name="cost_centers")
    op.drop_table("cost_centers")

    op.drop_column("chart_of_accounts", "maintain_fc_balance")
    op.drop_column("chart_of_accounts", "account_currency")
