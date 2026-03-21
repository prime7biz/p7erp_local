"""Per-item default warehouse for PO/GRN line suggestions.

Revision ID: 086
Revises: 085
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "086"
down_revision: Union[str, None] = "085"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("items", sa.Column("default_warehouse_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_items_default_warehouse_id",
        "items",
        "warehouses",
        ["default_warehouse_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_items_default_warehouse_id", "items", ["default_warehouse_id"])


def downgrade() -> None:
    op.drop_index("ix_items_default_warehouse_id", table_name="items")
    op.drop_constraint("fk_items_default_warehouse_id", "items", type_="foreignkey")
    op.drop_column("items", "default_warehouse_id")
