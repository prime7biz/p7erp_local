"""Packing list carton detail lines (carton range × colour × size).

Revision ID: 238
Revises: 237
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "238"
down_revision: Union[str, None] = "237"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "packing_list_carton_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("packing_list_id", sa.Integer(), sa.ForeignKey("packing_lists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("carton_from", sa.Integer(), nullable=False),
        sa.Column("carton_to", sa.Integer(), nullable=False),
        sa.Column("color_name", sa.String(100), nullable=False),
        sa.Column("size", sa.String(16), nullable=False),
        sa.Column("pcs_per_carton", sa.Integer(), nullable=False),
        sa.Column("net_kg_per_carton", sa.Numeric(10, 3), nullable=True),
        sa.Column("gross_kg_per_carton", sa.Numeric(10, 3), nullable=True),
        sa.Column("length_cm", sa.Numeric(8, 2), nullable=True),
        sa.Column("width_cm", sa.Numeric(8, 2), nullable=True),
        sa.Column("height_cm", sa.Numeric(8, 2), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("carton_from >= 1 AND carton_to >= carton_from", name="ck_carton_lines_range"),
        sa.CheckConstraint("pcs_per_carton >= 1", name="ck_carton_lines_pcs"),
    )
    op.create_index("ix_packing_list_carton_lines_tenant_id", "packing_list_carton_lines", ["tenant_id"])
    op.create_index("ix_packing_list_carton_lines_packing_list_id", "packing_list_carton_lines", ["packing_list_id"])


def downgrade() -> None:
    op.drop_index("ix_packing_list_carton_lines_packing_list_id", table_name="packing_list_carton_lines")
    op.drop_index("ix_packing_list_carton_lines_tenant_id", table_name="packing_list_carton_lines")
    op.drop_table("packing_list_carton_lines")
