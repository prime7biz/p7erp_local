"""Create stock_item_prices for multiple price lists per item."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "201"
down_revision: Union[str, None] = "200"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stock_item_prices",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("stock_item_id", sa.Integer(), nullable=False),
        sa.Column("price_list_name", sa.String(length=64), nullable=False),
        sa.Column("price", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="BDT"),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stock_item_id"], ["items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "stock_item_id",
            "price_list_name",
            "effective_from",
            name="uq_stock_item_prices_list_effective",
        ),
    )
    op.create_index("ix_stock_item_prices_tenant_id", "stock_item_prices", ["tenant_id"])
    op.create_index("ix_stock_item_prices_stock_item_id", "stock_item_prices", ["stock_item_id"])
    op.create_index("ix_stock_item_prices_price_list_name", "stock_item_prices", ["price_list_name"])


def downgrade() -> None:
    op.drop_index("ix_stock_item_prices_price_list_name", table_name="stock_item_prices")
    op.drop_index("ix_stock_item_prices_stock_item_id", table_name="stock_item_prices")
    op.drop_index("ix_stock_item_prices_tenant_id", table_name="stock_item_prices")
    op.drop_table("stock_item_prices")
