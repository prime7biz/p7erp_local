"""Add HR employee documents and status history

Revision ID: 023
Revises: 022
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "023"
down_revision: Union[str, None] = "022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_employee_documents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("document_type", sa.String(length=64), nullable=False),
        sa.Column("document_number", sa.String(length=128), nullable=True),
        sa.Column("issue_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("file_path", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_employee_documents_tenant_id", "hr_employee_documents", ["tenant_id"])
    op.create_index("ix_hr_employee_documents_employee_id", "hr_employee_documents", ["employee_id"])
    op.create_index("ix_hr_employee_documents_document_type", "hr_employee_documents", ["document_type"])

    op.create_table(
        "hr_employee_status_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_employee_status_history_tenant_id", "hr_employee_status_history", ["tenant_id"])
    op.create_index("ix_hr_employee_status_history_employee_id", "hr_employee_status_history", ["employee_id"])
    op.create_index("ix_hr_employee_status_history_status", "hr_employee_status_history", ["status"])


def downgrade() -> None:
    op.drop_index("ix_hr_employee_status_history_status", table_name="hr_employee_status_history")
    op.drop_index("ix_hr_employee_status_history_employee_id", table_name="hr_employee_status_history")
    op.drop_index("ix_hr_employee_status_history_tenant_id", table_name="hr_employee_status_history")
    op.drop_table("hr_employee_status_history")

    op.drop_index("ix_hr_employee_documents_document_type", table_name="hr_employee_documents")
    op.drop_index("ix_hr_employee_documents_employee_id", table_name="hr_employee_documents")
    op.drop_index("ix_hr_employee_documents_tenant_id", table_name="hr_employee_documents")
    op.drop_table("hr_employee_documents")
