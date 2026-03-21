"""Phase 1.7: created_by_user_id on stock-affecting documents and movements.

Revision ID: 085
Revises: 084
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "085"
down_revision: Union[str, None] = "084"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("stock_movements", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_stock_movements_created_by_user_id",
        "stock_movements",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_stock_movements_created_by_user_id", "stock_movements", ["created_by_user_id"])

    op.add_column("goods_receiving", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_goods_receiving_created_by_user_id",
        "goods_receiving",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_goods_receiving_created_by_user_id", "goods_receiving", ["created_by_user_id"])

    op.add_column("delivery_challans", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_delivery_challans_created_by_user_id",
        "delivery_challans",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_delivery_challans_created_by_user_id", "delivery_challans", ["created_by_user_id"])

    op.add_column("warehouse_transfers", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_warehouse_transfers_created_by_user_id",
        "warehouse_transfers",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_warehouse_transfers_created_by_user_id", "warehouse_transfers", ["created_by_user_id"])

    op.add_column("stock_adjustments", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_stock_adjustments_created_by_user_id",
        "stock_adjustments",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_stock_adjustments_created_by_user_id", "stock_adjustments", ["created_by_user_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_adjustments_created_by_user_id", table_name="stock_adjustments")
    op.drop_constraint("fk_stock_adjustments_created_by_user_id", "stock_adjustments", type_="foreignkey")
    op.drop_column("stock_adjustments", "created_by_user_id")

    op.drop_index("ix_warehouse_transfers_created_by_user_id", table_name="warehouse_transfers")
    op.drop_constraint("fk_warehouse_transfers_created_by_user_id", "warehouse_transfers", type_="foreignkey")
    op.drop_column("warehouse_transfers", "created_by_user_id")

    op.drop_index("ix_delivery_challans_created_by_user_id", table_name="delivery_challans")
    op.drop_constraint("fk_delivery_challans_created_by_user_id", "delivery_challans", type_="foreignkey")
    op.drop_column("delivery_challans", "created_by_user_id")

    op.drop_index("ix_goods_receiving_created_by_user_id", table_name="goods_receiving")
    op.drop_constraint("fk_goods_receiving_created_by_user_id", "goods_receiving", type_="foreignkey")
    op.drop_column("goods_receiving", "created_by_user_id")

    op.drop_index("ix_stock_movements_created_by_user_id", table_name="stock_movements")
    op.drop_constraint("fk_stock_movements_created_by_user_id", "stock_movements", type_="foreignkey")
    op.drop_column("stock_movements", "created_by_user_id")
