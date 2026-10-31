"""Create hr_employee_age_verifications (Sprint H1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "227"
down_revision: Union[str, None] = "226"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_employee_age_verifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("verification_method", sa.String(length=32), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=False),
        sa.Column("age_at_verification", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="VERIFIED"),
        sa.Column("is_bsci_compliant", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("verified_by", sa.Integer(), nullable=False),
        sa.Column("verified_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["hr_employee_documents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["verified_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hr_employee_age_verifications_tenant_id", "hr_employee_age_verifications", ["tenant_id"])
    op.create_index("ix_hr_employee_age_verifications_employee_id", "hr_employee_age_verifications", ["employee_id"])


def downgrade() -> None:
    op.drop_index("ix_hr_employee_age_verifications_employee_id", table_name="hr_employee_age_verifications")
    op.drop_index("ix_hr_employee_age_verifications_tenant_id", table_name="hr_employee_age_verifications")
    op.drop_table("hr_employee_age_verifications")
