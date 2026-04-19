"""Inquiries: target_price + exchange_rate String(32) -> Numeric (Phase 3B slice 1).

Revision ID: 166
Revises: 165
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "166"
down_revision: Union[str, None] = "165"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Normalize empty / whitespace-only strings so ::numeric does not fail
    op.execute(sa.text("UPDATE inquiries SET target_price = NULL WHERE target_price IS NOT NULL AND trim(target_price) = ''"))
    op.execute(sa.text("UPDATE inquiries SET exchange_rate = NULL WHERE exchange_rate IS NOT NULL AND trim(exchange_rate) = ''"))
    # Best-effort: drop values that are not plain decimal strings (keeps migration robust on dirty data)
    op.execute(
        sa.text(
            "UPDATE inquiries SET target_price = NULL "
            "WHERE target_price IS NOT NULL AND trim(target_price) !~ '^-?[0-9]+(\\.[0-9]*)?$'"
        )
    )
    op.execute(
        sa.text(
            "UPDATE inquiries SET exchange_rate = NULL "
            "WHERE exchange_rate IS NOT NULL AND trim(exchange_rate) !~ '^-?[0-9]+(\\.[0-9]*)?$'"
        )
    )
    op.alter_column(
        "inquiries",
        "target_price",
        existing_type=sa.String(length=32),
        type_=sa.Numeric(18, 4),
        existing_nullable=True,
        postgresql_using="NULLIF(trim(target_price::text), '')::numeric(18,4)",
    )
    op.alter_column(
        "inquiries",
        "exchange_rate",
        existing_type=sa.String(length=32),
        type_=sa.Numeric(18, 6),
        existing_nullable=True,
        postgresql_using="NULLIF(trim(exchange_rate::text), '')::numeric(18,6)",
    )


def downgrade() -> None:
    op.alter_column(
        "inquiries",
        "exchange_rate",
        existing_type=sa.Numeric(18, 6),
        type_=sa.String(length=32),
        existing_nullable=True,
        postgresql_using="CASE WHEN exchange_rate IS NULL THEN NULL ELSE trim(to_char(exchange_rate, 'FM999999999999999999.999999')) END",
    )
    op.alter_column(
        "inquiries",
        "target_price",
        existing_type=sa.Numeric(18, 4),
        type_=sa.String(length=32),
        existing_nullable=True,
        postgresql_using="CASE WHEN target_price IS NULL THEN NULL ELSE trim(to_char(target_price, 'FM999999999999999999.9999')) END",
    )
