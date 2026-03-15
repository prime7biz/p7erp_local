"""CoA advanced: coa_config table and chart_of_accounts new fields.

Revision ID: 056
Revises: 055
Create Date: 2026-03-13

Adds coa_config (tenant-scoped code format and limits) and on chart_of_accounts:
account_type, reporting_code, display_order, statistical_unit, statistical_formula,
parent_account_id, last_reviewed_at. See docs/COA_ADVANCED_DESIGN.md.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "056"
down_revision: Union[str, None] = "055"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "coa_config",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("account_number_prefix", sa.String(length=16), nullable=False, server_default="AC-"),
        sa.Column("account_number_width", sa.Integer(), nullable=False, server_default=sa.text("4")),
        sa.Column("group_code_prefix", sa.String(length=16), nullable=False, server_default="GRP-"),
        sa.Column("group_code_width", sa.Integer(), nullable=False, server_default=sa.text("4")),
        sa.Column("allow_manual_account_number", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("max_group_depth", sa.Integer(), nullable=True),
        sa.Column("max_account_depth", sa.Integer(), nullable=True),
        sa.Column("validate_normal_balance", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_coa_config_tenant_id", "coa_config", ["tenant_id"], unique=True)

    op.add_column(
        "chart_of_accounts",
        sa.Column("account_type", sa.String(length=32), nullable=False, server_default="posting"),
    )
    op.add_column("chart_of_accounts", sa.Column("reporting_code", sa.String(length=32), nullable=True))
    op.add_column("chart_of_accounts", sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("chart_of_accounts", sa.Column("statistical_unit", sa.String(length=32), nullable=True))
    op.add_column("chart_of_accounts", sa.Column("statistical_formula", sa.Text(), nullable=True))
    op.add_column("chart_of_accounts", sa.Column("last_reviewed_at", sa.Date(), nullable=True))
    op.add_column(
        "chart_of_accounts",
        sa.Column("parent_account_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_chart_of_accounts_reporting_code", "chart_of_accounts", ["reporting_code"], unique=False)
    op.create_foreign_key(
        "fk_chart_of_accounts_parent_account_id",
        "chart_of_accounts",
        "chart_of_accounts",
        ["parent_account_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_chart_of_accounts_parent_account_id",
        "chart_of_accounts",
        type_="foreignkey",
    )
    op.drop_index("ix_chart_of_accounts_reporting_code", table_name="chart_of_accounts")
    op.drop_column("chart_of_accounts", "parent_account_id")
    op.drop_column("chart_of_accounts", "last_reviewed_at")
    op.drop_column("chart_of_accounts", "statistical_formula")
    op.drop_column("chart_of_accounts", "statistical_unit")
    op.drop_column("chart_of_accounts", "display_order")
    op.drop_column("chart_of_accounts", "reporting_code")
    op.drop_column("chart_of_accounts", "account_type")

    op.drop_index("ix_coa_config_tenant_id", table_name="coa_config")
    op.drop_table("coa_config")
