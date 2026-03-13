"""Add HR payroll periods, runs and run lines

Revision ID: 029
Revises: 028
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_payroll_periods",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("period_code", sa.String(length=16), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="OPEN"),
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("finalized_by", sa.Integer(), nullable=True),
        sa.Column("finalized_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["finalized_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "period_code", name="uq_hr_payroll_periods_tenant_period_code"),
    )
    op.create_index("ix_hr_payroll_periods_tenant_id", "hr_payroll_periods", ["tenant_id"])
    op.create_index("ix_hr_payroll_periods_period_code", "hr_payroll_periods", ["period_code"])
    op.create_index("ix_hr_payroll_periods_status", "hr_payroll_periods", ["status"])
    op.create_index("ix_hr_payroll_periods_is_locked", "hr_payroll_periods", ["is_locked"])

    op.create_table(
        "hr_payroll_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("period_id", sa.Integer(), nullable=False),
        sa.Column("run_code", sa.String(length=24), nullable=False),
        sa.Column("run_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="DRAFT"),
        sa.Column("gross_total", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("deduction_total", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("net_total", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("finalized_by", sa.Integer(), nullable=True),
        sa.Column("finalized_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["period_id"], ["hr_payroll_periods.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["finalized_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "run_code", name="uq_hr_payroll_runs_tenant_run_code"),
    )
    op.create_index("ix_hr_payroll_runs_tenant_id", "hr_payroll_runs", ["tenant_id"])
    op.create_index("ix_hr_payroll_runs_period_id", "hr_payroll_runs", ["period_id"])
    op.create_index("ix_hr_payroll_runs_run_code", "hr_payroll_runs", ["run_code"])
    op.create_index("ix_hr_payroll_runs_status", "hr_payroll_runs", ["status"])

    op.create_table(
        "hr_payroll_run_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("structure_id", sa.Integer(), nullable=True),
        sa.Column("gross_pay", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("deductions", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("net_pay", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["hr_payroll_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["structure_id"], ["hr_payroll_structures.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "run_id", "employee_id", name="uq_hr_payroll_run_lines_run_employee"),
    )
    op.create_index("ix_hr_payroll_run_lines_tenant_id", "hr_payroll_run_lines", ["tenant_id"])
    op.create_index("ix_hr_payroll_run_lines_run_id", "hr_payroll_run_lines", ["run_id"])
    op.create_index("ix_hr_payroll_run_lines_employee_id", "hr_payroll_run_lines", ["employee_id"])


def downgrade() -> None:
    op.drop_index("ix_hr_payroll_run_lines_employee_id", table_name="hr_payroll_run_lines")
    op.drop_index("ix_hr_payroll_run_lines_run_id", table_name="hr_payroll_run_lines")
    op.drop_index("ix_hr_payroll_run_lines_tenant_id", table_name="hr_payroll_run_lines")
    op.drop_table("hr_payroll_run_lines")

    op.drop_index("ix_hr_payroll_runs_status", table_name="hr_payroll_runs")
    op.drop_index("ix_hr_payroll_runs_run_code", table_name="hr_payroll_runs")
    op.drop_index("ix_hr_payroll_runs_period_id", table_name="hr_payroll_runs")
    op.drop_index("ix_hr_payroll_runs_tenant_id", table_name="hr_payroll_runs")
    op.drop_table("hr_payroll_runs")

    op.drop_index("ix_hr_payroll_periods_is_locked", table_name="hr_payroll_periods")
    op.drop_index("ix_hr_payroll_periods_status", table_name="hr_payroll_periods")
    op.drop_index("ix_hr_payroll_periods_period_code", table_name="hr_payroll_periods")
    op.drop_index("ix_hr_payroll_periods_tenant_id", table_name="hr_payroll_periods")
    op.drop_table("hr_payroll_periods")
