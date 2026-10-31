"""Create consignment_stocks (Sprint I4)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "223"
down_revision: Union[str, None] = "222"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "consignment_stocks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=False),
        sa.Column("consigned_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("consumed_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("remaining_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("billed_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("is_billed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("agreement_date", sa.Date(), nullable=True),
        sa.Column("settlement_terms_days", sa.Integer(), nullable=True),
        sa.Column("unit_cost", sa.Numeric(18, 4), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("last_settled_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_consignment_stocks_tenant_id", "consignment_stocks", ["tenant_id"])
    op.create_index("ix_consignment_stocks_vendor_id", "consignment_stocks", ["vendor_id"])
    op.create_index("ix_consignment_stocks_item_id", "consignment_stocks", ["item_id"])
    op.create_index("ix_consignment_stocks_warehouse_id", "consignment_stocks", ["warehouse_id"])
    op.create_index(
        "ix_consignment_stocks_tenant_vendor_item",
        "consignment_stocks",
        ["tenant_id", "vendor_id", "item_id", "warehouse_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_consignment_stocks_tenant_vendor_item", table_name="consignment_stocks")
    op.drop_index("ix_consignment_stocks_warehouse_id", table_name="consignment_stocks")
    op.drop_index("ix_consignment_stocks_item_id", table_name="consignment_stocks")
    op.drop_index("ix_consignment_stocks_vendor_id", table_name="consignment_stocks")
    op.drop_index("ix_consignment_stocks_tenant_id", table_name="consignment_stocks")
    op.drop_table("consignment_stocks")
