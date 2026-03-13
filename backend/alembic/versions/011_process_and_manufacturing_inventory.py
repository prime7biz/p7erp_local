"""Add process orders and manufacturing workflow tables

Revision ID: 011
Revises: 010
Create Date: 2026-03-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "process_orders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("process_number", sa.String(length=32), nullable=False),
        sa.Column("process_type", sa.String(length=32), nullable=False),
        sa.Column("process_method", sa.String(length=16), nullable=False, server_default="in_house"),
        sa.Column("linked_order_id", sa.Integer(), nullable=True),
        sa.Column("warehouse_id", sa.Integer(), nullable=True),
        sa.Column("input_item_id", sa.Integer(), nullable=False),
        sa.Column("output_item_id", sa.Integer(), nullable=False),
        sa.Column("input_quantity", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("expected_output_qty", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("actual_output_qty", sa.String(length=32), nullable=True),
        sa.Column("processing_charges", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["linked_order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["input_item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["output_item_id"], ["items.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_process_orders_tenant_id", "process_orders", ["tenant_id"])
    op.create_index("ix_process_orders_number", "process_orders", ["process_number"])
    op.create_index("ix_process_orders_status", "process_orders", ["status"])

    op.create_table(
        "manufacturing_orders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("mo_number", sa.String(length=32), nullable=False),
        sa.Column("finished_item_id", sa.Integer(), nullable=False),
        sa.Column("planned_quantity", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("completed_quantity", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("current_stage", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["finished_item_id"], ["items.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_manufacturing_orders_tenant_id", "manufacturing_orders", ["tenant_id"])
    op.create_index("ix_manufacturing_orders_number", "manufacturing_orders", ["mo_number"])
    op.create_index("ix_manufacturing_orders_status", "manufacturing_orders", ["status"])

    op.create_table(
        "manufacturing_stages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("manufacturing_order_id", sa.Integer(), nullable=False),
        sa.Column("stage_name", sa.String(length=64), nullable=False),
        sa.Column("stage_order", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("input_quantity", sa.String(length=32), nullable=True),
        sa.Column("output_quantity", sa.String(length=32), nullable=True),
        sa.Column("process_loss_percentage", sa.String(length=16), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["manufacturing_order_id"], ["manufacturing_orders.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_manufacturing_stages_tenant_id", "manufacturing_stages", ["tenant_id"])
    op.create_index("ix_manufacturing_stages_order_id", "manufacturing_stages", ["manufacturing_order_id"])
    op.create_index("ix_manufacturing_stages_status", "manufacturing_stages", ["status"])


def downgrade() -> None:
    op.drop_index("ix_manufacturing_stages_status", table_name="manufacturing_stages")
    op.drop_index("ix_manufacturing_stages_order_id", table_name="manufacturing_stages")
    op.drop_index("ix_manufacturing_stages_tenant_id", table_name="manufacturing_stages")
    op.drop_table("manufacturing_stages")

    op.drop_index("ix_manufacturing_orders_status", table_name="manufacturing_orders")
    op.drop_index("ix_manufacturing_orders_number", table_name="manufacturing_orders")
    op.drop_index("ix_manufacturing_orders_tenant_id", table_name="manufacturing_orders")
    op.drop_table("manufacturing_orders")

    op.drop_index("ix_process_orders_status", table_name="process_orders")
    op.drop_index("ix_process_orders_number", table_name="process_orders")
    op.drop_index("ix_process_orders_tenant_id", table_name="process_orders")
    op.drop_table("process_orders")
