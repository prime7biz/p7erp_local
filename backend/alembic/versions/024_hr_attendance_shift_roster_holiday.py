"""Add HR attendance shifts, rosters and holidays

Revision ID: 024
Revises: 023
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "024"
down_revision: Union[str, None] = "023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_attendance_shifts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("grace_in_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("break_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_night_shift", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_hr_attendance_shifts_tenant_code"),
    )
    op.create_index("ix_hr_attendance_shifts_tenant_id", "hr_attendance_shifts", ["tenant_id"])
    op.create_index("ix_hr_attendance_shifts_code", "hr_attendance_shifts", ["code"])

    op.create_table(
        "hr_attendance_rosters",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("roster_date", sa.Date(), nullable=False),
        sa.Column("shift_id", sa.Integer(), nullable=False),
        sa.Column("is_week_off", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shift_id"], ["hr_attendance_shifts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "employee_id", "roster_date", name="uq_hr_attendance_rosters_employee_date"),
    )
    op.create_index("ix_hr_attendance_rosters_tenant_id", "hr_attendance_rosters", ["tenant_id"])
    op.create_index("ix_hr_attendance_rosters_employee_id", "hr_attendance_rosters", ["employee_id"])
    op.create_index("ix_hr_attendance_rosters_roster_date", "hr_attendance_rosters", ["roster_date"])
    op.create_index("ix_hr_attendance_rosters_shift_id", "hr_attendance_rosters", ["shift_id"])

    op.create_table(
        "hr_attendance_holidays",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("holiday_date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("is_optional", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "holiday_date", name="uq_hr_attendance_holidays_tenant_date"),
    )
    op.create_index("ix_hr_attendance_holidays_tenant_id", "hr_attendance_holidays", ["tenant_id"])
    op.create_index("ix_hr_attendance_holidays_holiday_date", "hr_attendance_holidays", ["holiday_date"])


def downgrade() -> None:
    op.drop_index("ix_hr_attendance_holidays_holiday_date", table_name="hr_attendance_holidays")
    op.drop_index("ix_hr_attendance_holidays_tenant_id", table_name="hr_attendance_holidays")
    op.drop_table("hr_attendance_holidays")

    op.drop_index("ix_hr_attendance_rosters_shift_id", table_name="hr_attendance_rosters")
    op.drop_index("ix_hr_attendance_rosters_roster_date", table_name="hr_attendance_rosters")
    op.drop_index("ix_hr_attendance_rosters_employee_id", table_name="hr_attendance_rosters")
    op.drop_index("ix_hr_attendance_rosters_tenant_id", table_name="hr_attendance_rosters")
    op.drop_table("hr_attendance_rosters")

    op.drop_index("ix_hr_attendance_shifts_code", table_name="hr_attendance_shifts")
    op.drop_index("ix_hr_attendance_shifts_tenant_id", table_name="hr_attendance_shifts")
    op.drop_table("hr_attendance_shifts")
