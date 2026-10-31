"""Add payroll employee structure assignments (Phase 1.4 auto-calculate).

Revision ID: 190
Revises: 189
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "190"
down_revision: Union[str, None] = "189"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_payroll_employee_structure_assignments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("structure_id", sa.Integer(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("base_salary", sa.Numeric(18, 4), nullable=True),
        sa.Column("component_overrides", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["structure_id"], ["hr_payroll_structures.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_hr_pay_emp_struct_asgn_tenant_id",
        "hr_payroll_employee_structure_assignments",
        ["tenant_id"],
    )
    op.create_index(
        "ix_hr_pay_emp_struct_asgn_employee_id",
        "hr_payroll_employee_structure_assignments",
        ["employee_id"],
    )
    op.create_index(
        "ix_hr_pay_emp_struct_asgn_structure_id",
        "hr_payroll_employee_structure_assignments",
        ["structure_id"],
    )
    op.create_index(
        "ix_hr_pay_emp_struct_asgn_tenant_emp",
        "hr_payroll_employee_structure_assignments",
        ["tenant_id", "employee_id"],
    )
    op.create_index(
        "ix_hr_pay_emp_struct_asgn_effective_from",
        "hr_payroll_employee_structure_assignments",
        ["effective_from"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_hr_pay_emp_struct_asgn_effective_from",
        table_name="hr_payroll_employee_structure_assignments",
    )
    op.drop_index(
        "ix_hr_pay_emp_struct_asgn_tenant_emp",
        table_name="hr_payroll_employee_structure_assignments",
    )
    op.drop_index(
        "ix_hr_pay_emp_struct_asgn_structure_id",
        table_name="hr_payroll_employee_structure_assignments",
    )
    op.drop_index(
        "ix_hr_pay_emp_struct_asgn_employee_id",
        table_name="hr_payroll_employee_structure_assignments",
    )
    op.drop_index(
        "ix_hr_pay_emp_struct_asgn_tenant_id",
        table_name="hr_payroll_employee_structure_assignments",
    )
    op.drop_table("hr_payroll_employee_structure_assignments")
