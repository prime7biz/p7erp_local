"""BOM items + consumption plan lines: qty fields String -> Numeric (Phase 3B slice 3).

Revision ID: 168
Revises: 167
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "168"
down_revision: Union[str, None] = "167"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- bom_items.base_consumption (NOT NULL) ---
    op.execute(
        sa.text(
            "UPDATE bom_items SET base_consumption = '0' "
            "WHERE base_consumption IS NOT NULL AND trim(base_consumption::text) = ''"
        )
    )
    op.execute(
        sa.text(
            "UPDATE bom_items SET base_consumption = '0' "
            "WHERE base_consumption IS NOT NULL AND trim(base_consumption::text) !~ '^-?[0-9]+(\\.[0-9]*)?$'"
        )
    )
    op.alter_column(
        "bom_items",
        "base_consumption",
        existing_type=sa.String(length=32),
        type_=sa.Numeric(18, 6),
        existing_nullable=False,
        postgresql_using="NULLIF(trim(base_consumption::text), '')::numeric(18,6)",
    )

    # --- bom_items.wastage_pct (nullable) ---
    op.execute(
        sa.text(
            "UPDATE bom_items SET wastage_pct = NULL "
            "WHERE wastage_pct IS NOT NULL AND trim(wastage_pct::text) = ''"
        )
    )
    op.execute(
        sa.text(
            "UPDATE bom_items SET wastage_pct = NULL "
            "WHERE wastage_pct IS NOT NULL AND trim(wastage_pct::text) !~ '^-?[0-9]+(\\.[0-9]*)?$'"
        )
    )
    op.alter_column(
        "bom_items",
        "wastage_pct",
        existing_type=sa.String(length=16),
        type_=sa.Numeric(10, 4),
        existing_nullable=True,
        postgresql_using="NULLIF(trim(wastage_pct::text), '')::numeric(10,4)",
    )

    # --- consumption_plan_items.required_qty (NOT NULL) ---
    op.execute(
        sa.text(
            "UPDATE consumption_plan_items SET required_qty = '0' "
            "WHERE required_qty IS NOT NULL AND trim(required_qty::text) = ''"
        )
    )
    op.execute(
        sa.text(
            "UPDATE consumption_plan_items SET required_qty = '0' "
            "WHERE required_qty IS NOT NULL AND trim(required_qty::text) !~ '^-?[0-9]+(\\.[0-9]*)?$'"
        )
    )
    op.alter_column(
        "consumption_plan_items",
        "required_qty",
        existing_type=sa.String(length=32),
        type_=sa.Numeric(18, 4),
        existing_nullable=False,
        postgresql_using="NULLIF(trim(required_qty::text), '')::numeric(18,4)",
    )


def downgrade() -> None:
    op.alter_column(
        "consumption_plan_items",
        "required_qty",
        existing_type=sa.Numeric(18, 4),
        type_=sa.String(length=32),
        existing_nullable=False,
        postgresql_using=(
            "CASE WHEN required_qty IS NULL THEN '0' "
            "ELSE trim(to_char(required_qty, 'FM999999999999999999.9999')) END"
        ),
    )
    op.alter_column(
        "bom_items",
        "wastage_pct",
        existing_type=sa.Numeric(10, 4),
        type_=sa.String(length=16),
        existing_nullable=True,
        postgresql_using=(
            "CASE WHEN wastage_pct IS NULL THEN NULL "
            "ELSE trim(to_char(wastage_pct, 'FM9999999999.9999')) END"
        ),
    )
    op.alter_column(
        "bom_items",
        "base_consumption",
        existing_type=sa.Numeric(18, 6),
        type_=sa.String(length=32),
        existing_nullable=False,
        postgresql_using=(
            "CASE WHEN base_consumption IS NULL THEN '0' "
            "ELSE trim(to_char(base_consumption, 'FM999999999999999999.999999')) END"
        ),
    )
