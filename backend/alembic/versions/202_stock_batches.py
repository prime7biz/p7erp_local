"""Create stock_batches and add batch_id to stock_movements."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "202"
down_revision: Union[str, None] = "201"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stock_batches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("stock_item_id", sa.Integer(), nullable=False),
        sa.Column("batch_number", sa.String(length=64), nullable=False),
        sa.Column("manufacturing_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("opening_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("received_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("issued_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("current_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("cost_per_unit", sa.Numeric(18, 6), nullable=False, server_default="0"),
        sa.Column("godown_id", sa.Integer(), nullable=True),
        sa.Column("source_movement_id", sa.Integer(), nullable=True),
        sa.Column("goods_receiving_item_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="ACTIVE"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'EXPIRED', 'CLOSED')",
            name="ck_stock_batches_status",
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stock_item_id"], ["items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["godown_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_movement_id"], ["stock_movements.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["goods_receiving_item_id"], ["goods_receiving_items.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "stock_item_id",
            "batch_number",
            "godown_id",
            name="uq_stock_batches_item_batch_godown",
        ),
    )
    op.create_index("ix_stock_batches_tenant_id", "stock_batches", ["tenant_id"])
    op.create_index("ix_stock_batches_stock_item_id", "stock_batches", ["stock_item_id"])
    op.create_index("ix_stock_batches_godown_id", "stock_batches", ["godown_id"])
    op.create_index("ix_stock_batches_expiry_date", "stock_batches", ["expiry_date"])
    op.create_index("ix_stock_batches_status", "stock_batches", ["status"])
    op.create_index(
        "idx_stock_batches_item_godown_status",
        "stock_batches",
        ["stock_item_id", "godown_id", "status"],
    )

    op.add_column("stock_movements", sa.Column("batch_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_stock_movements_batch_id",
        "stock_movements",
        "stock_batches",
        ["batch_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_stock_movements_batch_id", "stock_movements", ["batch_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_movements_batch_id", table_name="stock_movements")
    op.drop_constraint("fk_stock_movements_batch_id", "stock_movements", type_="foreignkey")
    op.drop_column("stock_movements", "batch_id")

    op.drop_index("idx_stock_batches_item_godown_status", table_name="stock_batches")
    op.drop_index("ix_stock_batches_status", table_name="stock_batches")
    op.drop_index("ix_stock_batches_expiry_date", table_name="stock_batches")
    op.drop_index("ix_stock_batches_godown_id", table_name="stock_batches")
    op.drop_index("ix_stock_batches_stock_item_id", table_name="stock_batches")
    op.drop_index("ix_stock_batches_tenant_id", table_name="stock_batches")
    op.drop_table("stock_batches")
