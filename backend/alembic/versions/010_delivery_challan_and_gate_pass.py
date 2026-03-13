"""Add delivery challan and enhanced gate pass

Revision ID: 010
Revises: 009
Create Date: 2026-03-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "delivery_challans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("challan_code", sa.String(length=32), nullable=False),
        sa.Column("customer_name", sa.String(length=128), nullable=False),
        sa.Column("delivery_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_delivery_challans_tenant_id", "delivery_challans", ["tenant_id"])
    op.create_index("ix_delivery_challans_challan_code", "delivery_challans", ["challan_code"])
    op.create_index("ix_delivery_challans_status", "delivery_challans", ["status"])

    op.create_table(
        "delivery_challan_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("challan_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["challan_id"], ["delivery_challans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_delivery_challan_items_tenant_id", "delivery_challan_items", ["tenant_id"])
    op.create_index("ix_delivery_challan_items_challan_id", "delivery_challan_items", ["challan_id"])
    op.create_index("ix_delivery_challan_items_item_id", "delivery_challan_items", ["item_id"])

    op.create_table(
        "enhanced_gate_passes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("gate_pass_code", sa.String(length=32), nullable=False),
        sa.Column("challan_id", sa.Integer(), nullable=True),
        sa.Column("purpose", sa.String(length=128), nullable=False),
        sa.Column("destination", sa.String(length=255), nullable=True),
        sa.Column("vehicle_no", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("guard_acknowledged", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["challan_id"], ["delivery_challans.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_enhanced_gate_passes_tenant_id", "enhanced_gate_passes", ["tenant_id"])
    op.create_index("ix_enhanced_gate_passes_gate_pass_code", "enhanced_gate_passes", ["gate_pass_code"])
    op.create_index("ix_enhanced_gate_passes_challan_id", "enhanced_gate_passes", ["challan_id"])
    op.create_index("ix_enhanced_gate_passes_status", "enhanced_gate_passes", ["status"])


def downgrade() -> None:
    op.drop_index("ix_enhanced_gate_passes_status", table_name="enhanced_gate_passes")
    op.drop_index("ix_enhanced_gate_passes_challan_id", table_name="enhanced_gate_passes")
    op.drop_index("ix_enhanced_gate_passes_gate_pass_code", table_name="enhanced_gate_passes")
    op.drop_index("ix_enhanced_gate_passes_tenant_id", table_name="enhanced_gate_passes")
    op.drop_table("enhanced_gate_passes")

    op.drop_index("ix_delivery_challan_items_item_id", table_name="delivery_challan_items")
    op.drop_index("ix_delivery_challan_items_challan_id", table_name="delivery_challan_items")
    op.drop_index("ix_delivery_challan_items_tenant_id", table_name="delivery_challan_items")
    op.drop_table("delivery_challan_items")

    op.drop_index("ix_delivery_challans_status", table_name="delivery_challans")
    op.drop_index("ix_delivery_challans_challan_code", table_name="delivery_challans")
    op.drop_index("ix_delivery_challans_tenant_id", table_name="delivery_challans")
    op.drop_table("delivery_challans")
