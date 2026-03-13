"""Add HR leave requests and approvals

Revision ID: 027
Revises: 026
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "027"
down_revision: Union[str, None] = "026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_leave_requests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("leave_type_id", sa.Integer(), nullable=False),
        sa.Column("from_date", sa.Date(), nullable=False),
        sa.Column("to_date", sa.Date(), nullable=False),
        sa.Column("days_requested", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="DRAFT"),
        sa.Column("requested_by", sa.Integer(), nullable=False),
        sa.Column("approved_by", sa.Integer(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("approval_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["leave_type_id"], ["hr_leave_types.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_leave_requests_tenant_id", "hr_leave_requests", ["tenant_id"])
    op.create_index("ix_hr_leave_requests_employee_id", "hr_leave_requests", ["employee_id"])
    op.create_index("ix_hr_leave_requests_leave_type_id", "hr_leave_requests", ["leave_type_id"])
    op.create_index("ix_hr_leave_requests_from_date", "hr_leave_requests", ["from_date"])
    op.create_index("ix_hr_leave_requests_to_date", "hr_leave_requests", ["to_date"])
    op.create_index("ix_hr_leave_requests_status", "hr_leave_requests", ["status"])

    op.create_table(
        "hr_leave_approvals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("leave_request_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=24), nullable=False),
        sa.Column("action_by", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["leave_request_id"], ["hr_leave_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["action_by"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_hr_leave_approvals_tenant_id", "hr_leave_approvals", ["tenant_id"])
    op.create_index("ix_hr_leave_approvals_leave_request_id", "hr_leave_approvals", ["leave_request_id"])
    op.create_index("ix_hr_leave_approvals_action", "hr_leave_approvals", ["action"])


def downgrade() -> None:
    op.drop_index("ix_hr_leave_approvals_action", table_name="hr_leave_approvals")
    op.drop_index("ix_hr_leave_approvals_leave_request_id", table_name="hr_leave_approvals")
    op.drop_index("ix_hr_leave_approvals_tenant_id", table_name="hr_leave_approvals")
    op.drop_table("hr_leave_approvals")

    op.drop_index("ix_hr_leave_requests_status", table_name="hr_leave_requests")
    op.drop_index("ix_hr_leave_requests_to_date", table_name="hr_leave_requests")
    op.drop_index("ix_hr_leave_requests_from_date", table_name="hr_leave_requests")
    op.drop_index("ix_hr_leave_requests_leave_type_id", table_name="hr_leave_requests")
    op.drop_index("ix_hr_leave_requests_employee_id", table_name="hr_leave_requests")
    op.drop_index("ix_hr_leave_requests_tenant_id", table_name="hr_leave_requests")
    op.drop_table("hr_leave_requests")
