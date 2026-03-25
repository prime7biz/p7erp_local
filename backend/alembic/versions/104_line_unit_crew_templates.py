"""Create line_crew_template and unit_crew_template.

Revision ID: 104
Revises: 103
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "104"
down_revision: Union[str, None] = "103"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "line_crew_template",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("sewing_line_id", sa.Integer(), nullable=False),
        sa.Column("crew_role_id", sa.Integer(), nullable=False),
        sa.Column("default_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("employee_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["crew_role_id"], ["production_crew_roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["sewing_line_id"], ["sewing_lines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "sewing_line_id", "crew_role_id", name="uq_line_crew_template_tenant_line_role"),
    )
    op.create_index(op.f("ix_line_crew_template_tenant_id"), "line_crew_template", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_line_crew_template_sewing_line_id"), "line_crew_template", ["sewing_line_id"], unique=False)
    op.create_index(op.f("ix_line_crew_template_crew_role_id"), "line_crew_template", ["crew_role_id"], unique=False)
    op.create_index(op.f("ix_line_crew_template_employee_id"), "line_crew_template", ["employee_id"], unique=False)

    op.create_table(
        "unit_crew_template",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("department_type", sa.String(length=32), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=True),
        sa.Column("crew_role_id", sa.Integer(), nullable=False),
        sa.Column("default_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("employee_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["crew_role_id"], ["production_crew_roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["machine_id"], ["department_machines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_unit_crew_template_tenant_id"), "unit_crew_template", ["tenant_id"], unique=False)
    op.create_index(
        op.f("ix_unit_crew_template_department_type"), "unit_crew_template", ["department_type"], unique=False
    )
    op.create_index(op.f("ix_unit_crew_template_machine_id"), "unit_crew_template", ["machine_id"], unique=False)
    op.create_index(op.f("ix_unit_crew_template_crew_role_id"), "unit_crew_template", ["crew_role_id"], unique=False)
    op.create_index(op.f("ix_unit_crew_template_employee_id"), "unit_crew_template", ["employee_id"], unique=False)
    op.create_index(
        "uq_unit_crew_template_tenant_dept_machine_role",
        "unit_crew_template",
        [
            "tenant_id",
            "department_type",
            "machine_id",
            "crew_role_id",
        ],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_unit_crew_template_tenant_dept_machine_role", table_name="unit_crew_template")
    op.drop_index(op.f("ix_unit_crew_template_employee_id"), table_name="unit_crew_template")
    op.drop_index(op.f("ix_unit_crew_template_crew_role_id"), table_name="unit_crew_template")
    op.drop_index(op.f("ix_unit_crew_template_machine_id"), table_name="unit_crew_template")
    op.drop_index(op.f("ix_unit_crew_template_department_type"), table_name="unit_crew_template")
    op.drop_index(op.f("ix_unit_crew_template_tenant_id"), table_name="unit_crew_template")
    op.drop_table("unit_crew_template")

    op.drop_index(op.f("ix_line_crew_template_employee_id"), table_name="line_crew_template")
    op.drop_index(op.f("ix_line_crew_template_crew_role_id"), table_name="line_crew_template")
    op.drop_index(op.f("ix_line_crew_template_sewing_line_id"), table_name="line_crew_template")
    op.drop_index(op.f("ix_line_crew_template_tenant_id"), table_name="line_crew_template")
    op.drop_table("line_crew_template")
