"""Phase 5: lot numbers, tenant stock policy & defaults, CoA inventory GL links, physical count sessions.

Revision ID: 084
Revises: 083
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "084"
down_revision: Union[str, None] = "083"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("allow_negative_stock", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.alter_column("tenants", "allow_negative_stock", server_default=None)

    op.add_column("tenants", sa.Column("default_rm_warehouse_id", sa.Integer(), nullable=True))
    op.add_column("tenants", sa.Column("default_fg_warehouse_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_tenants_default_rm_warehouse_id",
        "tenants",
        "warehouses",
        ["default_rm_warehouse_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_tenants_default_fg_warehouse_id",
        "tenants",
        "warehouses",
        ["default_fg_warehouse_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "coa_config",
        sa.Column("inventory_stock_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "coa_config",
        sa.Column("inventory_clearing_account_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_coa_config_inventory_stock_account",
        "coa_config",
        "chart_of_accounts",
        ["inventory_stock_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_coa_config_inventory_clearing_account",
        "coa_config",
        "chart_of_accounts",
        ["inventory_clearing_account_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("stock_movements", sa.Column("lot_number", sa.String(length=64), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("lot_number", sa.String(length=64), nullable=True))

    op.create_table(
        "physical_inventory_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=False),
        sa.Column("session_code", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("count_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "session_code", name="uq_physical_inventory_sessions_tenant_code"),
    )
    op.create_index("ix_physical_inventory_sessions_tenant_id", "physical_inventory_sessions", ["tenant_id"])

    op.create_table(
        "physical_inventory_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("expected_qty", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("counted_qty", sa.String(length=32), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["physical_inventory_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_physical_inventory_lines_session_id", "physical_inventory_lines", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_physical_inventory_lines_session_id", table_name="physical_inventory_lines")
    op.drop_table("physical_inventory_lines")
    op.drop_index("ix_physical_inventory_sessions_tenant_id", table_name="physical_inventory_sessions")
    op.drop_table("physical_inventory_sessions")

    op.drop_column("goods_receiving_items", "lot_number")
    op.drop_column("stock_movements", "lot_number")

    op.drop_constraint("fk_coa_config_inventory_clearing_account", "coa_config", type_="foreignkey")
    op.drop_constraint("fk_coa_config_inventory_stock_account", "coa_config", type_="foreignkey")
    op.drop_column("coa_config", "inventory_clearing_account_id")
    op.drop_column("coa_config", "inventory_stock_account_id")

    op.drop_constraint("fk_tenants_default_fg_warehouse_id", "tenants", type_="foreignkey")
    op.drop_constraint("fk_tenants_default_rm_warehouse_id", "tenants", type_="foreignkey")
    op.drop_column("tenants", "default_fg_warehouse_id")
    op.drop_column("tenants", "default_rm_warehouse_id")
    op.drop_column("tenants", "allow_negative_stock")
