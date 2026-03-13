"""Add finance and accounting baseline tables

Revision ID: 013
Revises: 012
Create Date: 2026-03-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "account_groups",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("parent_group_id", sa.Integer(), nullable=True),
        sa.Column("nature", sa.String(length=32), nullable=False),
        sa.Column("affects_gross_profit", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_bank_group", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_group_id"], ["account_groups.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_account_groups_tenant_id", "account_groups", ["tenant_id"])
    op.create_index("ix_account_groups_code", "account_groups", ["code"])
    op.create_index("ix_account_groups_parent_group_id", "account_groups", ["parent_group_id"])
    op.create_index("ix_account_groups_nature", "account_groups", ["nature"])

    op.create_table(
        "chart_of_accounts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("account_number", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("normal_balance", sa.String(length=16), nullable=False, server_default="debit"),
        sa.Column("opening_balance", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("balance", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_bank_account", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["account_groups.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_chart_of_accounts_tenant_id", "chart_of_accounts", ["tenant_id"])
    op.create_index("ix_chart_of_accounts_account_number", "chart_of_accounts", ["account_number"])
    op.create_index("ix_chart_of_accounts_group_id", "chart_of_accounts", ["group_id"])

    op.create_table(
        "vouchers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("voucher_number", sa.String(length=32), nullable=False),
        sa.Column("voucher_type", sa.String(length=32), nullable=False),
        sa.Column("voucher_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("reference", sa.String(length=64), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_vouchers_tenant_id", "vouchers", ["tenant_id"])
    op.create_index("ix_vouchers_voucher_number", "vouchers", ["voucher_number"])
    op.create_index("ix_vouchers_voucher_type", "vouchers", ["voucher_type"])
    op.create_index("ix_vouchers_voucher_date", "vouchers", ["voucher_date"])
    op.create_index("ix_vouchers_status", "vouchers", ["status"])
    op.create_index("ix_vouchers_created_by", "vouchers", ["created_by"])

    op.create_table(
        "voucher_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("voucher_id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("entry_type", sa.String(length=8), nullable=False),
        sa.Column("amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["chart_of_accounts.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_voucher_lines_tenant_id", "voucher_lines", ["tenant_id"])
    op.create_index("ix_voucher_lines_voucher_id", "voucher_lines", ["voucher_id"])
    op.create_index("ix_voucher_lines_account_id", "voucher_lines", ["account_id"])
    op.create_index("ix_voucher_lines_entry_type", "voucher_lines", ["entry_type"])

    op.create_table(
        "cash_forecast_scenarios",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("months", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_cash_forecast_scenarios_tenant_id", "cash_forecast_scenarios", ["tenant_id"])
    op.create_index("ix_cash_forecast_scenarios_status", "cash_forecast_scenarios", ["status"])
    op.create_index("ix_cash_forecast_scenarios_created_by", "cash_forecast_scenarios", ["created_by"])

    op.create_table(
        "cash_forecast_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("scenario_id", sa.Integer(), nullable=False),
        sa.Column("month_label", sa.String(length=16), nullable=False),
        sa.Column("inflow", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("outflow", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("net", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("cumulative", sa.String(length=32), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scenario_id"], ["cash_forecast_scenarios.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_cash_forecast_lines_tenant_id", "cash_forecast_lines", ["tenant_id"])
    op.create_index("ix_cash_forecast_lines_scenario_id", "cash_forecast_lines", ["scenario_id"])

    op.create_table(
        "fx_receipts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("receipt_no", sa.String(length=32), nullable=False),
        sa.Column("receipt_date", sa.Date(), nullable=False),
        sa.Column("source_ref", sa.String(length=64), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="USD"),
        sa.Column("fc_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("rate_to_base", sa.String(length=32), nullable=False, server_default="1"),
        sa.Column("base_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("settled_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="OPEN"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_fx_receipts_tenant_id", "fx_receipts", ["tenant_id"])
    op.create_index("ix_fx_receipts_receipt_no", "fx_receipts", ["receipt_no"])
    op.create_index("ix_fx_receipts_receipt_date", "fx_receipts", ["receipt_date"])
    op.create_index("ix_fx_receipts_status", "fx_receipts", ["status"])


def downgrade() -> None:
    op.drop_index("ix_fx_receipts_status", table_name="fx_receipts")
    op.drop_index("ix_fx_receipts_receipt_date", table_name="fx_receipts")
    op.drop_index("ix_fx_receipts_receipt_no", table_name="fx_receipts")
    op.drop_index("ix_fx_receipts_tenant_id", table_name="fx_receipts")
    op.drop_table("fx_receipts")

    op.drop_index("ix_cash_forecast_lines_scenario_id", table_name="cash_forecast_lines")
    op.drop_index("ix_cash_forecast_lines_tenant_id", table_name="cash_forecast_lines")
    op.drop_table("cash_forecast_lines")

    op.drop_index("ix_cash_forecast_scenarios_created_by", table_name="cash_forecast_scenarios")
    op.drop_index("ix_cash_forecast_scenarios_status", table_name="cash_forecast_scenarios")
    op.drop_index("ix_cash_forecast_scenarios_tenant_id", table_name="cash_forecast_scenarios")
    op.drop_table("cash_forecast_scenarios")

    op.drop_index("ix_voucher_lines_entry_type", table_name="voucher_lines")
    op.drop_index("ix_voucher_lines_account_id", table_name="voucher_lines")
    op.drop_index("ix_voucher_lines_voucher_id", table_name="voucher_lines")
    op.drop_index("ix_voucher_lines_tenant_id", table_name="voucher_lines")
    op.drop_table("voucher_lines")

    op.drop_index("ix_vouchers_created_by", table_name="vouchers")
    op.drop_index("ix_vouchers_status", table_name="vouchers")
    op.drop_index("ix_vouchers_voucher_date", table_name="vouchers")
    op.drop_index("ix_vouchers_voucher_type", table_name="vouchers")
    op.drop_index("ix_vouchers_voucher_number", table_name="vouchers")
    op.drop_index("ix_vouchers_tenant_id", table_name="vouchers")
    op.drop_table("vouchers")

    op.drop_index("ix_chart_of_accounts_group_id", table_name="chart_of_accounts")
    op.drop_index("ix_chart_of_accounts_account_number", table_name="chart_of_accounts")
    op.drop_index("ix_chart_of_accounts_tenant_id", table_name="chart_of_accounts")
    op.drop_table("chart_of_accounts")

    op.drop_index("ix_account_groups_nature", table_name="account_groups")
    op.drop_index("ix_account_groups_parent_group_id", table_name="account_groups")
    op.drop_index("ix_account_groups_code", table_name="account_groups")
    op.drop_index("ix_account_groups_tenant_id", table_name="account_groups")
    op.drop_table("account_groups")
