"""Vendor advanced fields: ledger_id, default_currency, payment_terms_days.

Revision ID: 067
Revises: 066
Create Date: 2026-03-15

Adds ledger link (FK to chart_of_accounts) and currency/payment basics to vendors.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "067"
down_revision: Union[str, None] = "066"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vendors", sa.Column("ledger_id", sa.Integer(), nullable=True))
    op.add_column("vendors", sa.Column("default_currency", sa.String(length=10), nullable=True))
    op.add_column("vendors", sa.Column("payment_terms_days", sa.Integer(), nullable=True))
    op.add_column("vendors", sa.Column("vendor_type", sa.String(length=16), nullable=True))
    op.add_column("vendors", sa.Column("country", sa.String(length=128), nullable=True))
    op.add_column("vendors", sa.Column("city", sa.String(length=128), nullable=True))
    op.add_column("vendors", sa.Column("tax_id", sa.String(length=64), nullable=True))
    op.add_column("vendors", sa.Column("bank_name", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("bank_account_no", sa.String(length=128), nullable=True))
    op.add_column("vendors", sa.Column("swift_code", sa.String(length=64), nullable=True))
    op.add_column("vendors", sa.Column("credit_limit", sa.Numeric(18, 2), nullable=True))
    op.create_foreign_key(
        "fk_vendors_ledger_id_chart_of_accounts",
        "vendors",
        "chart_of_accounts",
        ["ledger_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_vendors_ledger_id", "vendors", ["ledger_id"], unique=False)
    op.create_index("ix_vendors_vendor_type", "vendors", ["vendor_type"], unique=False)

    op.add_column("purchase_orders", sa.Column("currency", sa.String(length=10), nullable=True))
    op.add_column("purchase_orders", sa.Column("exchange_rate_to_base", sa.Numeric(18, 6), nullable=True))
    op.add_column("purchase_orders", sa.Column("base_total_amount", sa.Numeric(18, 2), nullable=True))
    op.add_column("purchase_orders", sa.Column("btb_lc_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_purchase_orders_btb_lc_id",
        "purchase_orders",
        "btb_lcs",
        ["btb_lc_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_purchase_orders_btb_lc_id", "purchase_orders", ["btb_lc_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_purchase_orders_btb_lc_id", table_name="purchase_orders")
    op.drop_constraint("fk_purchase_orders_btb_lc_id", "purchase_orders", type_="foreignkey")
    op.drop_column("purchase_orders", "btb_lc_id")
    op.drop_column("purchase_orders", "base_total_amount")
    op.drop_column("purchase_orders", "exchange_rate_to_base")
    op.drop_column("purchase_orders", "currency")

    op.drop_index("ix_vendors_vendor_type", table_name="vendors")
    op.drop_index("ix_vendors_ledger_id", table_name="vendors")
    op.drop_constraint("fk_vendors_ledger_id_chart_of_accounts", "vendors", type_="foreignkey")
    op.drop_column("vendors", "credit_limit")
    op.drop_column("vendors", "swift_code")
    op.drop_column("vendors", "bank_account_no")
    op.drop_column("vendors", "bank_name")
    op.drop_column("vendors", "tax_id")
    op.drop_column("vendors", "city")
    op.drop_column("vendors", "country")
    op.drop_column("vendors", "vendor_type")
    op.drop_column("vendors", "payment_terms_days")
    op.drop_column("vendors", "default_currency")
    op.drop_column("vendors", "ledger_id")
