"""Enhance items for batch tracking, units, valuation caches, GST."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "200"
down_revision: Union[str, None] = "199"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("items", sa.Column("base_unit", sa.String(length=32), nullable=True))
    op.add_column("items", sa.Column("alternate_unit", sa.String(length=32), nullable=True))
    op.add_column(
        "items",
        sa.Column("conversion_factor", sa.Numeric(18, 6), nullable=True),
    )
    op.add_column(
        "items",
        sa.Column("standard_price", sa.Numeric(18, 4), nullable=True),
    )
    op.add_column(
        "items",
        sa.Column("current_stock", sa.Numeric(18, 4), nullable=False, server_default="0"),
    )
    op.add_column(
        "items",
        sa.Column("current_value", sa.Numeric(18, 4), nullable=False, server_default="0"),
    )
    op.add_column(
        "items",
        sa.Column("avg_cost", sa.Numeric(18, 6), nullable=False, server_default="0"),
    )
    op.add_column(
        "items",
        sa.Column("batch_tracking", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "items",
        sa.Column("expiry_tracking", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "items",
        sa.Column("gst_applicable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("items", sa.Column("gst_rate", sa.Numeric(8, 4), nullable=True))
    op.add_column("items", sa.Column("hsn_code", sa.String(length=32), nullable=True))
    op.add_column(
        "items",
        sa.Column(
            "default_valuation_method",
            sa.String(length=8),
            nullable=True,
        ),
    )
    op.add_column(
        "items",
        sa.Column("reorder_level", sa.Numeric(18, 4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("items", "reorder_level")
    op.drop_column("items", "default_valuation_method")
    op.drop_column("items", "hsn_code")
    op.drop_column("items", "gst_rate")
    op.drop_column("items", "gst_applicable")
    op.drop_column("items", "expiry_tracking")
    op.drop_column("items", "batch_tracking")
    op.drop_column("items", "avg_cost")
    op.drop_column("items", "current_value")
    op.drop_column("items", "current_stock")
    op.drop_column("items", "standard_price")
    op.drop_column("items", "conversion_factor")
    op.drop_column("items", "alternate_unit")
    op.drop_column("items", "base_unit")
