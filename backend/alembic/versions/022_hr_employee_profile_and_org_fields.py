"""Add employee profile and organization fields

Revision ID: 022
Revises: 021
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "022"
down_revision: Union[str, None] = "021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("hr_employees", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("hr_employees", sa.Column("gender", sa.String(length=32), nullable=True))
    op.add_column("hr_employees", sa.Column("marital_status", sa.String(length=32), nullable=True))
    op.add_column("hr_employees", sa.Column("blood_group", sa.String(length=16), nullable=True))
    op.add_column("hr_employees", sa.Column("emergency_contact_name", sa.String(length=128), nullable=True))
    op.add_column("hr_employees", sa.Column("emergency_contact_phone", sa.String(length=32), nullable=True))
    op.add_column("hr_employees", sa.Column("address_line", sa.String(length=255), nullable=True))
    op.add_column("hr_employees", sa.Column("city", sa.String(length=128), nullable=True))
    op.add_column("hr_employees", sa.Column("country", sa.String(length=128), nullable=True))
    op.add_column("hr_employees", sa.Column("national_id", sa.String(length=64), nullable=True))
    op.add_column("hr_employees", sa.Column("employment_type", sa.String(length=32), nullable=True))
    op.add_column("hr_employees", sa.Column("confirmation_date", sa.Date(), nullable=True))
    op.add_column("hr_employees", sa.Column("exit_date", sa.Date(), nullable=True))
    op.create_index("ix_hr_employees_national_id", "hr_employees", ["national_id"])
    op.create_index("ix_hr_employees_employment_type", "hr_employees", ["employment_type"])


def downgrade() -> None:
    op.drop_index("ix_hr_employees_employment_type", table_name="hr_employees")
    op.drop_index("ix_hr_employees_national_id", table_name="hr_employees")
    op.drop_column("hr_employees", "exit_date")
    op.drop_column("hr_employees", "confirmation_date")
    op.drop_column("hr_employees", "employment_type")
    op.drop_column("hr_employees", "national_id")
    op.drop_column("hr_employees", "country")
    op.drop_column("hr_employees", "city")
    op.drop_column("hr_employees", "address_line")
    op.drop_column("hr_employees", "emergency_contact_phone")
    op.drop_column("hr_employees", "emergency_contact_name")
    op.drop_column("hr_employees", "blood_group")
    op.drop_column("hr_employees", "marital_status")
    op.drop_column("hr_employees", "gender")
    op.drop_column("hr_employees", "date_of_birth")

