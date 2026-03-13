"""Add HR ESS preferences and employee support tables

Revision ID: 033
Revises: 032
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "033"
down_revision: Union[str, None] = "032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_ess_preferences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("preferred_language", sa.String(length=32), nullable=False, server_default=sa.text("'en'")),
        sa.Column("time_zone", sa.String(length=64), nullable=False, server_default=sa.text("'Asia/Dhaka'")),
        sa.Column("date_format", sa.String(length=32), nullable=False, server_default=sa.text("'DD-MM-YYYY'")),
        sa.Column("email_notifications", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("push_notifications", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "employee_id", name="uq_hr_ess_pref_tenant_employee"),
    )
    op.create_index("ix_hr_ess_preferences_tenant_id", "hr_ess_preferences", ["tenant_id"])
    op.create_index("ix_hr_ess_preferences_employee_id", "hr_ess_preferences", ["employee_id"])

    op.create_table(
        "hr_employee_tickets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(length=32), nullable=False, server_default=sa.text("'medium'")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'open'")),
        sa.Column("assigned_to_employee_id", sa.Integer(), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_to_employee_id"], ["hr_employees.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_employee_tickets_tenant_id", "hr_employee_tickets", ["tenant_id"])
    op.create_index("ix_hr_employee_tickets_employee_id", "hr_employee_tickets", ["employee_id"])
    op.create_index("ix_hr_employee_tickets_category", "hr_employee_tickets", ["category"])
    op.create_index("ix_hr_employee_tickets_status", "hr_employee_tickets", ["status"])
    op.create_index("ix_hr_employee_tickets_assigned_to_employee_id", "hr_employee_tickets", ["assigned_to_employee_id"])


def downgrade() -> None:
    op.drop_index("ix_hr_employee_tickets_assigned_to_employee_id", table_name="hr_employee_tickets")
    op.drop_index("ix_hr_employee_tickets_status", table_name="hr_employee_tickets")
    op.drop_index("ix_hr_employee_tickets_category", table_name="hr_employee_tickets")
    op.drop_index("ix_hr_employee_tickets_employee_id", table_name="hr_employee_tickets")
    op.drop_index("ix_hr_employee_tickets_tenant_id", table_name="hr_employee_tickets")
    op.drop_table("hr_employee_tickets")

    op.drop_index("ix_hr_ess_preferences_employee_id", table_name="hr_ess_preferences")
    op.drop_index("ix_hr_ess_preferences_tenant_id", table_name="hr_ess_preferences")
    op.drop_table("hr_ess_preferences")
