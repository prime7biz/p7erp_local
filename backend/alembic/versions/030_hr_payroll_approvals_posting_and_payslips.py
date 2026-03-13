"""Add HR payroll approvals, posting and payslips

Revision ID: 030
Revises: 029
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "030"
down_revision: Union[str, None] = "029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_payroll_approvals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("payroll_run_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=24), nullable=False),
        sa.Column("action_by", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payroll_run_id"], ["hr_payroll_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["action_by"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_hr_payroll_approvals_tenant_id", "hr_payroll_approvals", ["tenant_id"])
    op.create_index("ix_hr_payroll_approvals_payroll_run_id", "hr_payroll_approvals", ["payroll_run_id"])
    op.create_index("ix_hr_payroll_approvals_action", "hr_payroll_approvals", ["action"])

    op.create_table(
        "hr_payroll_postings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("payroll_run_id", sa.Integer(), nullable=False),
        sa.Column("voucher_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="POSTED"),
        sa.Column("posted_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("posted_by", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payroll_run_id"], ["hr_payroll_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["posted_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "payroll_run_id", name="uq_hr_payroll_postings_run"),
    )
    op.create_index("ix_hr_payroll_postings_tenant_id", "hr_payroll_postings", ["tenant_id"])
    op.create_index("ix_hr_payroll_postings_payroll_run_id", "hr_payroll_postings", ["payroll_run_id"])
    op.create_index("ix_hr_payroll_postings_status", "hr_payroll_postings", ["status"])

    op.create_table(
        "hr_payroll_payslips",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("payroll_run_line_id", sa.Integer(), nullable=False),
        sa.Column("slip_number", sa.String(length=32), nullable=False),
        sa.Column("generated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("generated_by", sa.Integer(), nullable=True),
        sa.Column("file_path", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payroll_run_line_id"], ["hr_payroll_run_lines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["generated_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "slip_number", name="uq_hr_payroll_payslips_tenant_slip"),
    )
    op.create_index("ix_hr_payroll_payslips_tenant_id", "hr_payroll_payslips", ["tenant_id"])
    op.create_index("ix_hr_payroll_payslips_payroll_run_line_id", "hr_payroll_payslips", ["payroll_run_line_id"])
    op.create_index("ix_hr_payroll_payslips_slip_number", "hr_payroll_payslips", ["slip_number"])


def downgrade() -> None:
    op.drop_index("ix_hr_payroll_payslips_slip_number", table_name="hr_payroll_payslips")
    op.drop_index("ix_hr_payroll_payslips_payroll_run_line_id", table_name="hr_payroll_payslips")
    op.drop_index("ix_hr_payroll_payslips_tenant_id", table_name="hr_payroll_payslips")
    op.drop_table("hr_payroll_payslips")

    op.drop_index("ix_hr_payroll_postings_status", table_name="hr_payroll_postings")
    op.drop_index("ix_hr_payroll_postings_payroll_run_id", table_name="hr_payroll_postings")
    op.drop_index("ix_hr_payroll_postings_tenant_id", table_name="hr_payroll_postings")
    op.drop_table("hr_payroll_postings")

    op.drop_index("ix_hr_payroll_approvals_action", table_name="hr_payroll_approvals")
    op.drop_index("ix_hr_payroll_approvals_payroll_run_id", table_name="hr_payroll_approvals")
    op.drop_index("ix_hr_payroll_approvals_tenant_id", table_name="hr_payroll_approvals")
    op.drop_table("hr_payroll_approvals")
