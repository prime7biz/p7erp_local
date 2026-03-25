"""Create line_crew_daily and unit_crew_daily.

Revision ID: 105
Revises: 104
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "105"
down_revision: Union[str, None] = "104"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "line_crew_daily",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("sewing_line_id", sa.Integer(), nullable=False),
        sa.Column("shift_id", sa.Integer(), nullable=False),
        sa.Column("production_date", sa.Date(), nullable=False),
        sa.Column("crew_role_id", sa.Integer(), nullable=False),
        sa.Column("planned_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("actual_present", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("employee_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["crew_role_id"], ["production_crew_roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["sewing_line_id"], ["sewing_lines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shift_id"], ["production_shifts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "sewing_line_id",
            "shift_id",
            "production_date",
            "crew_role_id",
            name="uq_line_crew_daily_tenant_line_shift_date_role",
        ),
    )
    op.create_index(op.f("ix_line_crew_daily_tenant_id"), "line_crew_daily", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_line_crew_daily_sewing_line_id"), "line_crew_daily", ["sewing_line_id"], unique=False)
    op.create_index(op.f("ix_line_crew_daily_shift_id"), "line_crew_daily", ["shift_id"], unique=False)
    op.create_index(op.f("ix_line_crew_daily_production_date"), "line_crew_daily", ["production_date"], unique=False)
    op.create_index(op.f("ix_line_crew_daily_crew_role_id"), "line_crew_daily", ["crew_role_id"], unique=False)
    op.create_index(op.f("ix_line_crew_daily_employee_id"), "line_crew_daily", ["employee_id"], unique=False)

    op.create_table(
        "unit_crew_daily",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("department_type", sa.String(length=32), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=True),
        sa.Column("shift_id", sa.Integer(), nullable=False),
        sa.Column("production_date", sa.Date(), nullable=False),
        sa.Column("crew_role_id", sa.Integer(), nullable=False),
        sa.Column("planned_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("actual_present", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("employee_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["crew_role_id"], ["production_crew_roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["machine_id"], ["department_machines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["shift_id"], ["production_shifts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_unit_crew_daily_tenant_id"), "unit_crew_daily", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_unit_crew_daily_department_type"), "unit_crew_daily", ["department_type"], unique=False)
    op.create_index(op.f("ix_unit_crew_daily_machine_id"), "unit_crew_daily", ["machine_id"], unique=False)
    op.create_index(op.f("ix_unit_crew_daily_shift_id"), "unit_crew_daily", ["shift_id"], unique=False)
    op.create_index(op.f("ix_unit_crew_daily_production_date"), "unit_crew_daily", ["production_date"], unique=False)
    op.create_index(op.f("ix_unit_crew_daily_crew_role_id"), "unit_crew_daily", ["crew_role_id"], unique=False)
    op.create_index(op.f("ix_unit_crew_daily_employee_id"), "unit_crew_daily", ["employee_id"], unique=False)
    op.create_index(
        "uq_unit_crew_daily_tenant_dept_machine_shift_date_role",
        "unit_crew_daily",
        ["tenant_id", "department_type", "machine_id", "shift_id", "production_date", "crew_role_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_unit_crew_daily_tenant_dept_machine_shift_date_role", table_name="unit_crew_daily")
    op.drop_index(op.f("ix_unit_crew_daily_employee_id"), table_name="unit_crew_daily")
    op.drop_index(op.f("ix_unit_crew_daily_crew_role_id"), table_name="unit_crew_daily")
    op.drop_index(op.f("ix_unit_crew_daily_production_date"), table_name="unit_crew_daily")
    op.drop_index(op.f("ix_unit_crew_daily_shift_id"), table_name="unit_crew_daily")
    op.drop_index(op.f("ix_unit_crew_daily_machine_id"), table_name="unit_crew_daily")
    op.drop_index(op.f("ix_unit_crew_daily_department_type"), table_name="unit_crew_daily")
    op.drop_index(op.f("ix_unit_crew_daily_tenant_id"), table_name="unit_crew_daily")
    op.drop_table("unit_crew_daily")

    op.drop_index(op.f("ix_line_crew_daily_employee_id"), table_name="line_crew_daily")
    op.drop_index(op.f("ix_line_crew_daily_crew_role_id"), table_name="line_crew_daily")
    op.drop_index(op.f("ix_line_crew_daily_production_date"), table_name="line_crew_daily")
    op.drop_index(op.f("ix_line_crew_daily_shift_id"), table_name="line_crew_daily")
    op.drop_index(op.f("ix_line_crew_daily_sewing_line_id"), table_name="line_crew_daily")
    op.drop_index(op.f("ix_line_crew_daily_tenant_id"), table_name="line_crew_daily")
    op.drop_table("line_crew_daily")
