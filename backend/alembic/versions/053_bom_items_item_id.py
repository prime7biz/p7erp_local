"""Add item_id to bom_items for BOM–inventory link.

Revision ID: 053
Revises: 052
Create Date: 2026-03-13

Part of BOM → Inventory → PO architecture (Phase A).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "053"
down_revision: Union[str, None] = "052"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bom_items", sa.Column("item_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_bom_items_item_id_items",
        "bom_items",
        "items",
        ["item_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_bom_items_item_id", "bom_items", ["item_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_bom_items_item_id", table_name="bom_items")
    op.drop_constraint("fk_bom_items_item_id_items", "bom_items", type_="foreignkey")
    op.drop_column("bom_items", "item_id")
