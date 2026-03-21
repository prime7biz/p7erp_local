"""Add source_bom_id to purchase_orders for BOM-generated PO linkage.

Revision ID: 080
Revises: 079
Create Date: 2026-03-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "080"
down_revision: Union[str, None] = "079"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "purchase_orders",
        sa.Column("source_bom_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_purchase_orders_source_bom_id", "purchase_orders", ["source_bom_id"], unique=False)
    op.create_foreign_key(
        "fk_purchase_orders_source_bom_id_boms",
        "purchase_orders",
        "boms",
        ["source_bom_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_purchase_orders_source_bom_id_boms", "purchase_orders", type_="foreignkey")
    op.drop_index("ix_purchase_orders_source_bom_id", table_name="purchase_orders")
    op.drop_column("purchase_orders", "source_bom_id")
