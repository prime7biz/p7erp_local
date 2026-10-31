"""Create hr_employee_compliance_records (Sprint H1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "226"
down_revision: Union[str, None] = "225"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_employee_compliance_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("requirement_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="PENDING"),
        sa.Column("evidence_document_id", sa.Integer(), nullable=True),
        sa.Column("verified_by", sa.Integer(), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requirement_id"], ["hr_compliance_requirements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["evidence_document_id"], ["hr_employee_documents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["verified_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hr_employee_compliance_records_tenant_id", "hr_employee_compliance_records", ["tenant_id"])
    op.create_index("ix_hr_employee_compliance_records_employee_id", "hr_employee_compliance_records", ["employee_id"])
    op.create_index(
        "ix_hr_employee_compliance_records_requirement_id", "hr_employee_compliance_records", ["requirement_id"]
    )
    op.create_index(
        "ix_hr_ecr_tenant_employee_req",
        "hr_employee_compliance_records",
        ["tenant_id", "employee_id", "requirement_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_hr_ecr_tenant_employee_req", table_name="hr_employee_compliance_records")
    op.drop_index("ix_hr_employee_compliance_records_requirement_id", table_name="hr_employee_compliance_records")
    op.drop_index("ix_hr_employee_compliance_records_employee_id", table_name="hr_employee_compliance_records")
    op.drop_index("ix_hr_employee_compliance_records_tenant_id", table_name="hr_employee_compliance_records")
    op.drop_table("hr_employee_compliance_records")
