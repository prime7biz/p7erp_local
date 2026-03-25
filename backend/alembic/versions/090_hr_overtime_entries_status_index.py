"""Add index on hr_overtime_entries.status for filtering.

Revision ID: 090
Revises: 089
"""

from typing import Sequence, Union

from alembic import op


revision: str = "090"
down_revision: Union[str, None] = "089"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_hr_overtime_entries_status",
        "hr_overtime_entries",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_hr_overtime_entries_status", table_name="hr_overtime_entries")
