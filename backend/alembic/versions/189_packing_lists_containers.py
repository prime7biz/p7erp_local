"""Add packing_lists and shipment_containers (Phase 1.1 MVP)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "189"
down_revision: Union[str, None] = "188"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "packing_lists",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("packing_list_number", sa.String(length=32), nullable=False),
        sa.Column("shipment_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("delivery_challan_id", sa.Integer(), nullable=True),
        sa.Column("packing_date", sa.Date(), nullable=True),
        sa.Column("total_cartons", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("gross_weight", sa.Numeric(18, 4), nullable=True),
        sa.Column("net_weight", sa.Numeric(18, 4), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["delivery_challan_id"], ["delivery_challans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id", "packing_list_number", name="uq_packing_lists_tenant_number"
        ),
    )
    op.create_index("ix_packing_lists_tenant_id", "packing_lists", ["tenant_id"])
    op.create_index("ix_packing_lists_shipment_id", "packing_lists", ["shipment_id"])
    op.create_index("ix_packing_lists_order_id", "packing_lists", ["order_id"])
    op.create_index("ix_packing_lists_delivery_challan_id", "packing_lists", ["delivery_challan_id"])
    op.create_index("ix_packing_lists_status", "packing_lists", ["status"])

    op.create_table(
        "shipment_containers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("shipment_id", sa.Integer(), nullable=False),
        sa.Column("container_number", sa.String(length=64), nullable=False),
        sa.Column("container_type", sa.String(length=32), nullable=True),
        sa.Column("seal_number", sa.String(length=64), nullable=True),
        sa.Column("loading_status", sa.String(length=32), nullable=False, server_default="EMPTY"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "shipment_id",
            "container_number",
            name="uq_shipment_containers_tenant_shipment_number",
        ),
    )
    op.create_index("ix_shipment_containers_tenant_id", "shipment_containers", ["tenant_id"])
    op.create_index("ix_shipment_containers_shipment_id", "shipment_containers", ["shipment_id"])
    op.create_index("ix_shipment_containers_loading_status", "shipment_containers", ["loading_status"])


def downgrade() -> None:
    op.drop_index("ix_shipment_containers_loading_status", table_name="shipment_containers")
    op.drop_index("ix_shipment_containers_shipment_id", table_name="shipment_containers")
    op.drop_index("ix_shipment_containers_tenant_id", table_name="shipment_containers")
    op.drop_table("shipment_containers")

    op.drop_index("ix_packing_lists_status", table_name="packing_lists")
    op.drop_index("ix_packing_lists_delivery_challan_id", table_name="packing_lists")
    op.drop_index("ix_packing_lists_order_id", table_name="packing_lists")
    op.drop_index("ix_packing_lists_shipment_id", table_name="packing_lists")
    op.drop_index("ix_packing_lists_tenant_id", table_name="packing_lists")
    op.drop_table("packing_lists")
