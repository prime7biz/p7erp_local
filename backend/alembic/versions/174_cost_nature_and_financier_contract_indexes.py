"""Chart of accounts cost_nature, voucher line override, performance indexes for financier contract command.

Revision ID: 174
Revises: 173
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "174"
down_revision: Union[str, None] = "173"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chart_of_accounts",
        sa.Column("cost_nature", sa.String(length=24), nullable=True),
    )
    op.create_index(
        "ix_chart_of_accounts_tenant_cost_nature",
        "chart_of_accounts",
        ["tenant_id", "cost_nature"],
        unique=False,
    )
    op.add_column(
        "voucher_lines",
        sa.Column("cost_nature_override", sa.String(length=24), nullable=True),
    )
    op.create_index(
        "ix_orders_tenant_master_contract",
        "orders",
        ["tenant_id", "master_contract_id"],
        unique=False,
    )
    op.create_index(
        "ix_purchase_orders_tenant_source_order",
        "purchase_orders",
        ["tenant_id", "source_order_id"],
        unique=False,
    )
    op.create_index(
        "ix_btb_lcs_tenant_master_contract",
        "btb_lcs",
        ["tenant_id", "master_contract_id"],
        unique=False,
    )
    op.create_index(
        "ix_voucher_lines_tenant_cost_center",
        "voucher_lines",
        ["tenant_id", "cost_center_id"],
        unique=False,
    )
    op.create_index(
        "ix_hourly_production_entries_tenant_order_date",
        "hourly_production_entries",
        ["tenant_id", "order_id", "production_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_hourly_production_entries_tenant_order_date", table_name="hourly_production_entries")
    op.drop_index("ix_voucher_lines_tenant_cost_center", table_name="voucher_lines")
    op.drop_index("ix_btb_lcs_tenant_master_contract", table_name="btb_lcs")
    op.drop_index("ix_purchase_orders_tenant_source_order", table_name="purchase_orders")
    op.drop_index("ix_orders_tenant_master_contract", table_name="orders")
    op.drop_column("voucher_lines", "cost_nature_override")
    op.drop_index("ix_chart_of_accounts_tenant_cost_nature", table_name="chart_of_accounts")
    op.drop_column("chart_of_accounts", "cost_nature")
