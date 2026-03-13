"""Add currency_exchange_rates table (PrimeX parity)

Revision ID: 007
Revises: 006
Create Date: 2025-03-09

- currency_exchange_rates: tenant-scoped pair-based rates (from_currency, to_currency,
  exchange_rate, effective_date, source, is_active)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "currency_exchange_rates",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("from_currency", sa.String(length=10), nullable=False),
        sa.Column("to_currency", sa.String(length=10), nullable=False),
        sa.Column("exchange_rate", sa.String(length=24), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False, server_default="manual"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_currency_exchange_rates_tenant_id",
        "currency_exchange_rates",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_currency_exchange_rates_from_to",
        "currency_exchange_rates",
        ["tenant_id", "from_currency", "to_currency"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_currency_exchange_rates_from_to", "currency_exchange_rates")
    op.drop_index("ix_currency_exchange_rates_tenant_id", "currency_exchange_rates")
    op.drop_table("currency_exchange_rates")
