"""Enhance stock_groups: sales/purchase accounts + default valuation method."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "199"
down_revision: Union[str, None] = "198"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stock_groups",
        sa.Column("sales_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "stock_groups",
        sa.Column("purchase_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "stock_groups",
        sa.Column(
            "default_valuation_method",
            sa.String(length=8),
            nullable=False,
            server_default="FIFO",
        ),
    )
    op.create_foreign_key(
        "fk_stock_groups_sales_account_id",
        "stock_groups",
        "chart_of_accounts",
        ["sales_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_stock_groups_purchase_account_id",
        "stock_groups",
        "chart_of_accounts",
        ["purchase_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_stock_groups_sales_account_id", "stock_groups", ["sales_account_id"])
    op.create_index("ix_stock_groups_purchase_account_id", "stock_groups", ["purchase_account_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_groups_purchase_account_id", table_name="stock_groups")
    op.drop_index("ix_stock_groups_sales_account_id", table_name="stock_groups")
    op.drop_constraint("fk_stock_groups_purchase_account_id", "stock_groups", type_="foreignkey")
    op.drop_constraint("fk_stock_groups_sales_account_id", "stock_groups", type_="foreignkey")
    op.drop_column("stock_groups", "default_valuation_method")
    op.drop_column("stock_groups", "purchase_account_id")
    op.drop_column("stock_groups", "sales_account_id")
