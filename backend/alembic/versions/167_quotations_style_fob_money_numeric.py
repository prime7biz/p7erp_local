"""Quotations header money + garment_styles.target_fob String -> Numeric (Phase 3B slice 2).

Revision ID: 167
Revises: 166
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "167"
down_revision: Union[str, None] = "166"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_QUOT_MONEY_4 = (
    "target_price",
    "material_cost",
    "manufacturing_cost",
    "other_cost",
    "total_cost",
    "cost_per_piece",
    "profit_percentage",
    "quoted_price",
    "total_amount",
)


def _clean_varchar_money(table: str, col: str) -> None:
    op.execute(
        sa.text(
            f"UPDATE {table} SET {col} = NULL "
            f"WHERE {col} IS NOT NULL AND trim({col}::text) = ''"
        )
    )
    op.execute(
        sa.text(
            f"UPDATE {table} SET {col} = NULL "
            f"WHERE {col} IS NOT NULL AND trim({col}::text) !~ '^-?[0-9]+(\\.[0-9]*)?$'"
        )
    )


def upgrade() -> None:
    for col in _QUOT_MONEY_4:
        _clean_varchar_money("quotations", col)
    _clean_varchar_money("quotations", "exchange_rate")
    _clean_varchar_money("garment_styles", "target_fob")

    for col in _QUOT_MONEY_4:
        op.alter_column(
            "quotations",
            col,
            existing_type=sa.String(length=32),
            type_=sa.Numeric(18, 4),
            existing_nullable=True,
            postgresql_using=f"NULLIF(trim({col}::text), '')::numeric(18,4)",
        )
    op.alter_column(
        "quotations",
        "exchange_rate",
        existing_type=sa.String(length=32),
        type_=sa.Numeric(18, 6),
        existing_nullable=True,
        postgresql_using="NULLIF(trim(exchange_rate::text), '')::numeric(18,6)",
    )
    op.alter_column(
        "garment_styles",
        "target_fob",
        existing_type=sa.String(length=32),
        type_=sa.Numeric(18, 4),
        existing_nullable=True,
        postgresql_using="NULLIF(trim(target_fob::text), '')::numeric(18,4)",
    )


def downgrade() -> None:
    op.alter_column(
        "garment_styles",
        "target_fob",
        existing_type=sa.Numeric(18, 4),
        type_=sa.String(length=32),
        existing_nullable=True,
        postgresql_using=(
            "CASE WHEN target_fob IS NULL THEN NULL "
            "ELSE trim(to_char(target_fob, 'FM999999999999999999.9999')) END"
        ),
    )
    op.alter_column(
        "quotations",
        "exchange_rate",
        existing_type=sa.Numeric(18, 6),
        type_=sa.String(length=32),
        existing_nullable=True,
        postgresql_using=(
            "CASE WHEN exchange_rate IS NULL THEN NULL "
            "ELSE trim(to_char(exchange_rate, 'FM999999999999999999.999999')) END"
        ),
    )
    for col in reversed(_QUOT_MONEY_4):
        op.alter_column(
            "quotations",
            col,
            existing_type=sa.Numeric(18, 4),
            type_=sa.String(length=32),
            existing_nullable=True,
            postgresql_using=(
                f"CASE WHEN {col} IS NULL THEN NULL "
                f"ELSE trim(to_char({col}, 'FM999999999999999999.9999')) END"
            ),
        )
