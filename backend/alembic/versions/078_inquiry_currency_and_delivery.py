"""Add inquiry currency, exchange rate, and expected delivery date.

Revision ID: 078
Revises: 077
Create Date: 2026-03-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "078"
down_revision: Union[str, None] = "077"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inquiries", sa.Column("target_price_currency", sa.String(length=10), nullable=True))
    op.add_column("inquiries", sa.Column("currency", sa.String(length=8), nullable=True))
    op.add_column("inquiries", sa.Column("exchange_rate", sa.String(length=32), nullable=True))
    op.add_column("inquiries", sa.Column("expected_delivery_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("inquiries", "expected_delivery_date")
    op.drop_column("inquiries", "exchange_rate")
    op.drop_column("inquiries", "currency")
    op.drop_column("inquiries", "target_price_currency")
