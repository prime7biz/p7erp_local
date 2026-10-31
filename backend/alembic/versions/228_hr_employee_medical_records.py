"""Create hr_employee_medical_records (Sprint H1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "228"
down_revision: Union[str, None] = "227"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_employee_medical_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("certificate_number", sa.String(length=64), nullable=True),
        sa.Column("examination_date", sa.Date(), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("doctor_name", sa.String(length=128), nullable=True),
        sa.Column("doctor_registration", sa.String(length=64), nullable=True),
        sa.Column("hospital_clinic", sa.String(length=128), nullable=True),
        sa.Column("fitness_status", sa.String(length=32), nullable=False, server_default="PENDING"),
        sa.Column("conditions", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("restrictions", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("document_id", sa.Integer(), nullable=True),
        sa.Column("reminder_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["hr_employee_documents.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hr_employee_medical_records_tenant_id", "hr_employee_medical_records", ["tenant_id"])
    op.create_index("ix_hr_employee_medical_records_employee_id", "hr_employee_medical_records", ["employee_id"])
    op.create_index("ix_hr_employee_medical_records_expiry_date", "hr_employee_medical_records", ["expiry_date"])


def downgrade() -> None:
    op.drop_index("ix_hr_employee_medical_records_expiry_date", table_name="hr_employee_medical_records")
    op.drop_index("ix_hr_employee_medical_records_employee_id", table_name="hr_employee_medical_records")
    op.drop_index("ix_hr_employee_medical_records_tenant_id", table_name="hr_employee_medical_records")
    op.drop_table("hr_employee_medical_records")
