"""Add banking and payment run tables

Revision ID: 015
Revises: 014
Create Date: 2026-03-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("account_name", sa.String(length=255), nullable=False),
        sa.Column("bank_name", sa.String(length=255), nullable=False),
        sa.Column("account_number", sa.String(length=64), nullable=False),
        sa.Column("branch_name", sa.String(length=255), nullable=True),
        sa.Column("swift_code", sa.String(length=32), nullable=True),
        sa.Column("routing_number", sa.String(length=32), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="BDT"),
        sa.Column("gl_account_id", sa.Integer(), nullable=True),
        sa.Column("opening_balance", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("current_balance", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["gl_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_bank_accounts_tenant_id", "bank_accounts", ["tenant_id"])
    op.create_index("ix_bank_accounts_account_number", "bank_accounts", ["account_number"])
    op.create_index("ix_bank_accounts_gl_account_id", "bank_accounts", ["gl_account_id"])

    op.create_table(
        "bank_reconciliations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("bank_account_id", sa.Integer(), nullable=False),
        sa.Column("statement_date", sa.Date(), nullable=False),
        sa.Column("statement_balance", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("book_balance", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("difference_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="OPEN"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bank_account_id"], ["bank_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_bank_reconciliations_tenant_id", "bank_reconciliations", ["tenant_id"])
    op.create_index("ix_bank_reconciliations_bank_account_id", "bank_reconciliations", ["bank_account_id"])
    op.create_index("ix_bank_reconciliations_status", "bank_reconciliations", ["status"])
    op.create_index("ix_bank_reconciliations_created_by", "bank_reconciliations", ["created_by"])

    op.create_table(
        "payment_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("run_code", sa.String(length=32), nullable=False),
        sa.Column("run_date", sa.Date(), nullable=False),
        sa.Column("bank_account_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="DRAFT"),
        sa.Column("total_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bank_account_id"], ["bank_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_payment_runs_tenant_id", "payment_runs", ["tenant_id"])
    op.create_index("ix_payment_runs_run_code", "payment_runs", ["run_code"])
    op.create_index("ix_payment_runs_bank_account_id", "payment_runs", ["bank_account_id"])
    op.create_index("ix_payment_runs_status", "payment_runs", ["status"])
    op.create_index("ix_payment_runs_created_by", "payment_runs", ["created_by"])

    op.create_table(
        "payment_run_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("payment_run_id", sa.Integer(), nullable=False),
        sa.Column("bill_id", sa.Integer(), nullable=True),
        sa.Column("party_name", sa.String(length=255), nullable=False),
        sa.Column("amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="PENDING"),
        sa.Column("reference", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payment_run_id"], ["payment_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bill_id"], ["outstanding_bills.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_payment_run_items_tenant_id", "payment_run_items", ["tenant_id"])
    op.create_index("ix_payment_run_items_payment_run_id", "payment_run_items", ["payment_run_id"])
    op.create_index("ix_payment_run_items_bill_id", "payment_run_items", ["bill_id"])
    op.create_index("ix_payment_run_items_status", "payment_run_items", ["status"])


def downgrade() -> None:
    op.drop_index("ix_payment_run_items_status", table_name="payment_run_items")
    op.drop_index("ix_payment_run_items_bill_id", table_name="payment_run_items")
    op.drop_index("ix_payment_run_items_payment_run_id", table_name="payment_run_items")
    op.drop_index("ix_payment_run_items_tenant_id", table_name="payment_run_items")
    op.drop_table("payment_run_items")

    op.drop_index("ix_payment_runs_created_by", table_name="payment_runs")
    op.drop_index("ix_payment_runs_status", table_name="payment_runs")
    op.drop_index("ix_payment_runs_bank_account_id", table_name="payment_runs")
    op.drop_index("ix_payment_runs_run_code", table_name="payment_runs")
    op.drop_index("ix_payment_runs_tenant_id", table_name="payment_runs")
    op.drop_table("payment_runs")

    op.drop_index("ix_bank_reconciliations_created_by", table_name="bank_reconciliations")
    op.drop_index("ix_bank_reconciliations_status", table_name="bank_reconciliations")
    op.drop_index("ix_bank_reconciliations_bank_account_id", table_name="bank_reconciliations")
    op.drop_index("ix_bank_reconciliations_tenant_id", table_name="bank_reconciliations")
    op.drop_table("bank_reconciliations")

    op.drop_index("ix_bank_accounts_gl_account_id", table_name="bank_accounts")
    op.drop_index("ix_bank_accounts_account_number", table_name="bank_accounts")
    op.drop_index("ix_bank_accounts_tenant_id", table_name="bank_accounts")
    op.drop_table("bank_accounts")
