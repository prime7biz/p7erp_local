"""Warehouse transfers, stock adjustments, stock_movements composite index.

Revision ID: 081
Revises: 080
Create Date: 2026-03-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "081"
down_revision: Union[str, None] = "080"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "warehouse_transfers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("transfer_code", sa.String(length=32), nullable=False),
        sa.Column("from_warehouse_id", sa.Integer(), nullable=False),
        sa.Column("to_warehouse_id", sa.Integer(), nullable=False),
        sa.Column("transfer_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["from_warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["to_warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_warehouse_transfers_tenant_id", "warehouse_transfers", ["tenant_id"])
    op.create_index("ix_warehouse_transfers_transfer_code", "warehouse_transfers", ["transfer_code"])
    op.create_index("ix_warehouse_transfers_status", "warehouse_transfers", ["status"])

    op.create_table(
        "warehouse_transfer_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("transfer_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["transfer_id"], ["warehouse_transfers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_warehouse_transfer_lines_tenant_id", "warehouse_transfer_lines", ["tenant_id"])
    op.create_index("ix_warehouse_transfer_lines_transfer_id", "warehouse_transfer_lines", ["transfer_id"])

    op.create_table(
        "stock_adjustments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("adjust_code", sa.String(length=32), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.String(length=32), nullable=False),
        sa.Column("reason_code", sa.String(length=32), nullable=False, server_default="OTHER"),
        sa.Column("adjustment_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_stock_adjustments_tenant_id", "stock_adjustments", ["tenant_id"])
    op.create_index("ix_stock_adjustments_adjust_code", "stock_adjustments", ["adjust_code"])
    op.create_index("ix_stock_adjustments_status", "stock_adjustments", ["status"])

    op.create_index(
        "ix_stock_movements_tenant_item_wh",
        "stock_movements",
        ["tenant_id", "item_id", "warehouse_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_stock_movements_tenant_item_wh", table_name="stock_movements")
    op.drop_index("ix_stock_adjustments_status", table_name="stock_adjustments")
    op.drop_index("ix_stock_adjustments_adjust_code", table_name="stock_adjustments")
    op.drop_index("ix_stock_adjustments_tenant_id", table_name="stock_adjustments")
    op.drop_table("stock_adjustments")
    op.drop_index("ix_warehouse_transfer_lines_transfer_id", table_name="warehouse_transfer_lines")
    op.drop_index("ix_warehouse_transfer_lines_tenant_id", table_name="warehouse_transfer_lines")
    op.drop_table("warehouse_transfer_lines")
    op.drop_index("ix_warehouse_transfers_status", table_name="warehouse_transfers")
    op.drop_index("ix_warehouse_transfers_transfer_code", table_name="warehouse_transfers")
    op.drop_index("ix_warehouse_transfers_tenant_id", table_name="warehouse_transfers")
    op.drop_table("warehouse_transfers")
