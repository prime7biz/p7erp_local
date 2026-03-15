"""Payment run FX settlement persistence fields.

Revision ID: 068
Revises: 067
Create Date: 2026-03-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "068"
down_revision: Union[str, None] = "067"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payment_runs",
        sa.Column("base_currency", sa.String(length=10), nullable=False, server_default="BDT"),
    )
    op.add_column(
        "payment_run_items",
        sa.Column("source_currency", sa.String(length=10), nullable=False, server_default="BDT"),
    )
    op.add_column(
        "payment_run_items",
        sa.Column("fx_rate_to_base", sa.String(length=32), nullable=False, server_default="1"),
    )
    op.add_column(
        "payment_run_items",
        sa.Column("base_amount", sa.String(length=32), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("payment_run_items", "base_amount")
    op.drop_column("payment_run_items", "fx_rate_to_base")
    op.drop_column("payment_run_items", "source_currency")
    op.drop_column("payment_runs", "base_currency")
