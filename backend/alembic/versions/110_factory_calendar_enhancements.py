"""Factory calendar enhancements: category, source, is_paid, affects_hr.

Revision ID: 110
Revises: 109
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "110"
down_revision: Union[str, None] = "109"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("factory_calendar_overrides", sa.Column("category", sa.String(length=32), nullable=True))
    op.add_column("factory_calendar_overrides", sa.Column("source", sa.String(length=32), nullable=True))
    op.add_column(
        "factory_calendar_overrides",
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "factory_calendar_overrides",
        sa.Column("affects_hr", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("factory_calendar_overrides", "affects_hr")
    op.drop_column("factory_calendar_overrides", "is_paid")
    op.drop_column("factory_calendar_overrides", "source")
    op.drop_column("factory_calendar_overrides", "category")
