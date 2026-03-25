"""Add country_code and timezone to tenants.

Revision ID: 109
Revises: 108
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "109"
down_revision: Union[str, None] = "108"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("country_code", sa.String(length=4), nullable=True))
    op.add_column("tenants", sa.Column("timezone", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "timezone")
    op.drop_column("tenants", "country_code")
