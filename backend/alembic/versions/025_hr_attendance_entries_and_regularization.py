"""Add HR attendance entries and regularization

Revision ID: 025
Revises: 024
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "025"
down_revision: Union[str, None] = "024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_attendance_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("attendance_date", sa.Date(), nullable=False),
        sa.Column("in_time", sa.Time(), nullable=True),
        sa.Column("out_time", sa.Time(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="PRESENT"),
        sa.Column("source", sa.String(length=24), nullable=False, server_default="MANUAL"),
        sa.Column("late_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("early_out_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("overtime_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "employee_id", "attendance_date", name="uq_hr_attendance_entries_employee_date"),
    )
    op.create_index("ix_hr_attendance_entries_tenant_id", "hr_attendance_entries", ["tenant_id"])
    op.create_index("ix_hr_attendance_entries_employee_id", "hr_attendance_entries", ["employee_id"])
    op.create_index("ix_hr_attendance_entries_attendance_date", "hr_attendance_entries", ["attendance_date"])
    op.create_index("ix_hr_attendance_entries_status", "hr_attendance_entries", ["status"])

    op.create_table(
        "hr_attendance_regularizations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("attendance_entry_id", sa.Integer(), nullable=False),
        sa.Column("requested_in_time", sa.Time(), nullable=True),
        sa.Column("requested_out_time", sa.Time(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="PENDING"),
        sa.Column("requested_by", sa.Integer(), nullable=False),
        sa.Column("approved_by", sa.Integer(), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["attendance_entry_id"], ["hr_attendance_entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_attendance_regularizations_tenant_id", "hr_attendance_regularizations", ["tenant_id"])
    op.create_index(
        "ix_hr_attendance_regularizations_attendance_entry_id",
        "hr_attendance_regularizations",
        ["attendance_entry_id"],
    )
    op.create_index("ix_hr_attendance_regularizations_status", "hr_attendance_regularizations", ["status"])


def downgrade() -> None:
    op.drop_index("ix_hr_attendance_regularizations_status", table_name="hr_attendance_regularizations")
    op.drop_index(
        "ix_hr_attendance_regularizations_attendance_entry_id",
        table_name="hr_attendance_regularizations",
    )
    op.drop_index("ix_hr_attendance_regularizations_tenant_id", table_name="hr_attendance_regularizations")
    op.drop_table("hr_attendance_regularizations")

    op.drop_index("ix_hr_attendance_entries_status", table_name="hr_attendance_entries")
    op.drop_index("ix_hr_attendance_entries_attendance_date", table_name="hr_attendance_entries")
    op.drop_index("ix_hr_attendance_entries_employee_id", table_name="hr_attendance_entries")
    op.drop_index("ix_hr_attendance_entries_tenant_id", table_name="hr_attendance_entries")
    op.drop_table("hr_attendance_entries")
