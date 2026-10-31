"""Payroll statutory flags + statutory_configs (Sprint 5)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "211"
down_revision: Union[str, None] = "210"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "hr_payroll_structure_lines",
        sa.Column("is_pf_component", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "hr_payroll_structure_lines",
        sa.Column("is_esi_component", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "hr_payroll_structure_lines",
        sa.Column("is_pt_component", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "hr_payroll_structure_lines",
        sa.Column("is_gratuity_component", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.add_column(
        "hr_payroll_accounting_config",
        sa.Column("esi_payable_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "hr_payroll_accounting_config",
        sa.Column("pt_payable_account_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_hr_payroll_acct_esi_payable",
        "hr_payroll_accounting_config",
        "chart_of_accounts",
        ["esi_payable_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_hr_payroll_acct_pt_payable",
        "hr_payroll_accounting_config",
        "chart_of_accounts",
        ["pt_payable_account_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "payroll_statutory_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("pf_employee_rate", sa.Numeric(8, 4), nullable=False, server_default="12"),
        sa.Column("pf_employer_rate", sa.Numeric(8, 4), nullable=False, server_default="12"),
        sa.Column("esi_employee_rate", sa.Numeric(8, 4), nullable=False, server_default="0.75"),
        sa.Column("esi_employer_rate", sa.Numeric(8, 4), nullable=False, server_default="3.25"),
        sa.Column("pf_wage_ceiling", sa.Numeric(15, 2), nullable=False, server_default="15000"),
        sa.Column("esi_wage_ceiling", sa.Numeric(15, 2), nullable=False, server_default="21000"),
        sa.Column("pt_state", sa.String(length=64), nullable=True),
        sa.Column("pt_slabs", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("gratuity_days_per_year", sa.Numeric(8, 4), nullable=False, server_default="15"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_payroll_statutory_configs_tenant"),
    )
    op.create_index("ix_payroll_statutory_configs_tenant_id", "payroll_statutory_configs", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_payroll_statutory_configs_tenant_id", table_name="payroll_statutory_configs")
    op.drop_table("payroll_statutory_configs")
    op.drop_constraint("fk_hr_payroll_acct_pt_payable", "hr_payroll_accounting_config", type_="foreignkey")
    op.drop_constraint("fk_hr_payroll_acct_esi_payable", "hr_payroll_accounting_config", type_="foreignkey")
    op.drop_column("hr_payroll_accounting_config", "pt_payable_account_id")
    op.drop_column("hr_payroll_accounting_config", "esi_payable_account_id")
    op.drop_column("hr_payroll_structure_lines", "is_gratuity_component")
    op.drop_column("hr_payroll_structure_lines", "is_pt_component")
    op.drop_column("hr_payroll_structure_lines", "is_esi_component")
    op.drop_column("hr_payroll_structure_lines", "is_pf_component")
