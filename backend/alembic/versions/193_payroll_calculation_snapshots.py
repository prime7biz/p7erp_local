"""Add payroll calculation snapshots + run line calculation_source (Phase 1.4)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "193"
down_revision: Union[str, None] = "192"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "hr_payroll_run_lines",
        sa.Column(
            "calculation_source",
            sa.String(length=16),
            nullable=False,
            server_default="MANUAL",
        ),
    )
    op.create_index(
        "ix_hr_payroll_run_lines_calculation_source",
        "hr_payroll_run_lines",
        ["calculation_source"],
    )

    op.create_table(
        "hr_payroll_calculation_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("payroll_run_line_id", sa.Integer(), nullable=False),
        sa.Column("attendance_days", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("absent_days", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("late_days", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("leave_days_paid", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("leave_days_unpaid", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ot_hours", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("base_salary_applied", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("structure_id", sa.Integer(), nullable=True),
        sa.Column(
            "calculation_source",
            sa.String(length=16),
            nullable=False,
            server_default="AUTO",
        ),
        sa.Column("trace_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["payroll_run_line_id"],
            ["hr_payroll_run_lines.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["structure_id"],
            ["hr_payroll_structures.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_hr_pay_calc_snap_tenant_id",
        "hr_payroll_calculation_snapshots",
        ["tenant_id"],
    )
    op.create_index(
        "ix_hr_pay_calc_snap_run_line_id",
        "hr_payroll_calculation_snapshots",
        ["payroll_run_line_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_hr_pay_calc_snap_run_line_id",
        table_name="hr_payroll_calculation_snapshots",
    )
    op.drop_index(
        "ix_hr_pay_calc_snap_tenant_id",
        table_name="hr_payroll_calculation_snapshots",
    )
    op.drop_table("hr_payroll_calculation_snapshots")
    op.drop_index(
        "ix_hr_payroll_run_lines_calculation_source",
        table_name="hr_payroll_run_lines",
    )
    op.drop_column("hr_payroll_run_lines", "calculation_source")
