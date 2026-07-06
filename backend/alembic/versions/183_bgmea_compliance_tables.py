"""BGMEA compliance tables: statutory tax config, bonded warehouse, payroll statutory."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "183"
down_revision: Union[str, None] = "182"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tenant_statutory_tax_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("tax_code", sa.String(length=16), nullable=False),
        sa.Column("rate_pct", sa.Numeric(10, 4), nullable=False, server_default="0"),
        sa.Column("registration_no", sa.String(length=64), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "tax_code", name="uq_tenant_statutory_tax_code"),
    )
    op.create_index("ix_tenant_statutory_tax_configs_tenant_id", "tenant_statutory_tax_configs", ["tenant_id"])

    op.create_table(
        "bonded_warehouse_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("reference_no", sa.String(length=64), nullable=False),
        sa.Column("entry_type", sa.String(length=32), nullable=False, server_default="IMPORT"),
        sa.Column("ud_no", sa.String(length=64), nullable=True),
        sa.Column("up_no", sa.String(length=64), nullable=True),
        sa.Column("trade_case_id", sa.Integer(), nullable=True),
        sa.Column("btb_lc_id", sa.Integer(), nullable=True),
        sa.Column("item_description", sa.String(length=255), nullable=True),
        sa.Column("quantity", sa.Numeric(18, 4), nullable=True),
        sa.Column("value_bdt", sa.Numeric(18, 4), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="OPEN"),
        sa.Column("entry_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trade_case_id"], ["trade_cases.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bonded_warehouse_entries_tenant_id", "bonded_warehouse_entries", ["tenant_id"])
    op.create_index("ix_bonded_warehouse_entries_reference_no", "bonded_warehouse_entries", ["reference_no"])

    op.create_table(
        "payroll_statutory_summaries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("payroll_run_id", sa.Integer(), nullable=True),
        sa.Column("period_year", sa.Integer(), nullable=False),
        sa.Column("period_month", sa.Integer(), nullable=False),
        sa.Column("gross_total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ait_total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("pf_employee_total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("pf_employer_total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("net_payable", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payroll_run_id"], ["hr_payroll_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "period_year", "period_month", name="uq_payroll_statutory_period"),
    )
    op.create_index("ix_payroll_statutory_summaries_tenant_id", "payroll_statutory_summaries", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_payroll_statutory_summaries_tenant_id", table_name="payroll_statutory_summaries")
    op.drop_table("payroll_statutory_summaries")
    op.drop_index("ix_bonded_warehouse_entries_reference_no", table_name="bonded_warehouse_entries")
    op.drop_index("ix_bonded_warehouse_entries_tenant_id", table_name="bonded_warehouse_entries")
    op.drop_table("bonded_warehouse_entries")
    op.drop_index("ix_tenant_statutory_tax_configs_tenant_id", table_name="tenant_statutory_tax_configs")
    op.drop_table("tenant_statutory_tax_configs")
