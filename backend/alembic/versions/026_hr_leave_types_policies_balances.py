"""Add HR leave types policies and balances

Revision ID: 026
Revises: 025
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "026"
down_revision: Union[str, None] = "025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_leave_types",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=24), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_hr_leave_types_tenant_code"),
    )
    op.create_index("ix_hr_leave_types_tenant_id", "hr_leave_types", ["tenant_id"])
    op.create_index("ix_hr_leave_types_code", "hr_leave_types", ["code"])

    op.create_table(
        "hr_leave_policies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("leave_type_id", sa.Integer(), nullable=False),
        sa.Column("employment_type", sa.String(length=32), nullable=True),
        sa.Column("annual_quota_days", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("max_carry_forward_days", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["leave_type_id"], ["hr_leave_types.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_hr_leave_policies_tenant_id", "hr_leave_policies", ["tenant_id"])
    op.create_index("ix_hr_leave_policies_leave_type_id", "hr_leave_policies", ["leave_type_id"])

    op.create_table(
        "hr_leave_balances",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("leave_type_id", sa.Integer(), nullable=False),
        sa.Column("balance_year", sa.Integer(), nullable=False),
        sa.Column("allocated_days", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("used_days", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("pending_days", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("closing_balance_days", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["leave_type_id"], ["hr_leave_types.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "tenant_id",
            "employee_id",
            "leave_type_id",
            "balance_year",
            name="uq_hr_leave_balances_emp_type_year",
        ),
    )
    op.create_index("ix_hr_leave_balances_tenant_id", "hr_leave_balances", ["tenant_id"])
    op.create_index("ix_hr_leave_balances_employee_id", "hr_leave_balances", ["employee_id"])
    op.create_index("ix_hr_leave_balances_leave_type_id", "hr_leave_balances", ["leave_type_id"])
    op.create_index("ix_hr_leave_balances_balance_year", "hr_leave_balances", ["balance_year"])


def downgrade() -> None:
    op.drop_index("ix_hr_leave_balances_balance_year", table_name="hr_leave_balances")
    op.drop_index("ix_hr_leave_balances_leave_type_id", table_name="hr_leave_balances")
    op.drop_index("ix_hr_leave_balances_employee_id", table_name="hr_leave_balances")
    op.drop_index("ix_hr_leave_balances_tenant_id", table_name="hr_leave_balances")
    op.drop_table("hr_leave_balances")

    op.drop_index("ix_hr_leave_policies_leave_type_id", table_name="hr_leave_policies")
    op.drop_index("ix_hr_leave_policies_tenant_id", table_name="hr_leave_policies")
    op.drop_table("hr_leave_policies")

    op.drop_index("ix_hr_leave_types_code", table_name="hr_leave_types")
    op.drop_index("ix_hr_leave_types_tenant_id", table_name="hr_leave_types")
    op.drop_table("hr_leave_types")
