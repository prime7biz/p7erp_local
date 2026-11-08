"""Employee onboarding fields on ``hr_employees`` (all nullable, additive): family, religion,
nationality, present / permanent address, emergency contact relation, bKash flag, salary payment
method, optional bank details, probation months and a facilities list.

The legacy ``address_line`` / ``city`` / ``country`` columns are kept untouched (the API mirrors
the present address into them later). No backfill, no constraint and no new table in this revision.

Rollback: ``alembic downgrade 287`` drops only the columns added here. That permanently deletes any
data captured in them, so a production downgrade needs a fresh backup first.

Revision ID: 288
Revises: 287
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "288"
down_revision: Union[str, None] = "287"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "hr_employees"

# (column name, column type). Order matters only for readability; downgrade drops in reverse.
_COLUMNS: list[tuple[str, sa.types.TypeEngine]] = [
    # Family
    ("father_name", sa.String(length=128)),
    ("mother_name", sa.String(length=128)),
    ("spouse_name", sa.String(length=128)),
    ("religion", sa.String(length=64)),
    ("nationality", sa.String(length=64)),
    # Present address
    ("present_address_line", sa.String(length=255)),
    ("present_city", sa.String(length=128)),
    ("present_district", sa.String(length=128)),
    ("present_postal_code", sa.String(length=16)),
    ("present_country", sa.String(length=128)),
    # Permanent address
    ("permanent_address_line", sa.String(length=255)),
    ("permanent_city", sa.String(length=128)),
    ("permanent_district", sa.String(length=128)),
    ("permanent_postal_code", sa.String(length=16)),
    ("permanent_country", sa.String(length=128)),
    # Contact / payment identity
    ("emergency_contact_relation", sa.String(length=64)),
    ("mobile_is_bkash", sa.Boolean()),
    ("salary_payment_method", sa.String(length=16)),
    # Bank details (all optional)
    ("bank_account_name", sa.String(length=128)),
    ("bank_account_number", sa.String(length=64)),
    ("bank_name", sa.String(length=128)),
    ("bank_branch", sa.String(length=128)),
    ("bank_routing_no", sa.String(length=32)),
    # Employment
    ("probation_months", sa.Integer()),
    ("facilities", postgresql.JSONB(astext_type=sa.Text())),
]


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for name, column_type in _COLUMNS:
        op.add_column(TABLE, sa.Column(name, column_type, nullable=True))


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for name, _ in reversed(_COLUMNS):
        op.drop_column(TABLE, name)
