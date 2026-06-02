"""Inventory stock balance snapshots + payroll run line composite index (perf).

Revision ID: 179
Revises: 178
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "179"
down_revision: Union[str, None] = "178"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inventory_stock_balance_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_dim_id", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("in_qty", sa.Numeric(precision=24, scale=6), nullable=False, server_default="0"),
        sa.Column("out_qty", sa.Numeric(precision=24, scale=6), nullable=False, server_default="0"),
        sa.Column("on_hand_qty", sa.Numeric(precision=24, scale=6), nullable=False, server_default="0"),
        sa.Column("computed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "item_id", "warehouse_dim_id", name="uq_inv_stock_snap_tenant_item_wh"),
    )
    op.create_index(
        "ix_inv_stock_snapshots_tenant_id",
        "inventory_stock_balance_snapshots",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_inv_stock_snapshots_tenant_item",
        "inventory_stock_balance_snapshots",
        ["tenant_id", "item_id"],
        unique=False,
    )
    op.create_index(
        "ix_inv_stock_snapshots_wh_dim",
        "inventory_stock_balance_snapshots",
        ["warehouse_dim_id"],
        unique=False,
    )

    # Hot path: payroll report lines filtered by tenant + run (Finding #3 / HR reports).
    op.execute(sa.text("SET lock_timeout = '30s'"))
    op.create_index(
        "ix_hr_payroll_run_lines_tenant_run",
        "hr_payroll_run_lines",
        ["tenant_id", "run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_hr_payroll_run_lines_tenant_run", table_name="hr_payroll_run_lines")
    op.drop_index("ix_inv_stock_snapshots_wh_dim", table_name="inventory_stock_balance_snapshots")
    op.drop_index("ix_inv_stock_snapshots_tenant_item", table_name="inventory_stock_balance_snapshots")
    op.drop_index("ix_inv_stock_snapshots_tenant_id", table_name="inventory_stock_balance_snapshots")
    op.drop_table("inventory_stock_balance_snapshots")
