"""Performance pass 2: list-friendly indexes for items and manufacturing orders.

Revision ID: 142
Revises: 141
Create Date: 2026-03-30
"""

from typing import Sequence, Union

from alembic import op


revision: str = "142"
down_revision: Union[str, None] = "141"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tenant-scoped catalog sort (inventory item list / typeahead).
    op.create_index("ix_items_tenant_id_item_code", "items", ["tenant_id", "item_code"], unique=False)
    # MO list: filter by tenant_id and order by id (planners can use backward index scan for DESC).
    op.create_index(
        "ix_manufacturing_orders_tenant_id_id",
        "manufacturing_orders",
        ["tenant_id", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_manufacturing_orders_tenant_id_id", table_name="manufacturing_orders")
    op.drop_index("ix_items_tenant_id_item_code", table_name="items")
