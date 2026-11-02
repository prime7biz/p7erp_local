"""Colour × size quantity breakdown per order.

Revision ID: 235
Revises: 234
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "235"
down_revision: Union[str, None] = "234"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "order_color_size_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("color_name", sa.String(100), nullable=False),
        sa.Column("color_code", sa.String(32), nullable=True),
        sa.Column("size", sa.String(16), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("color_sort", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("size_sort", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("order_id", "color_name", "size", name="uq_order_color_size_cell"),
        sa.CheckConstraint("quantity >= 0", name="ck_order_color_size_qty_nonneg"),
    )
    op.create_index("ix_order_color_size_lines_tenant_id", "order_color_size_lines", ["tenant_id"])
    op.create_index("ix_order_color_size_lines_order_id", "order_color_size_lines", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_order_color_size_lines_order_id", table_name="order_color_size_lines")
    op.drop_index("ix_order_color_size_lines_tenant_id", table_name="order_color_size_lines")
    op.drop_table("order_color_size_lines")
