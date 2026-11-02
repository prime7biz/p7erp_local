"""Commission engine: settings, rules, shipments, entries, statements.

Revision ID: 236
Revises: 235
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "236"
down_revision: Union[str, None] = "235"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _coa(name: str) -> sa.Column:
    return sa.Column(name, sa.Integer(), sa.ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True)


def upgrade() -> None:
    op.create_table(
        "commission_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("tds_rate_pct", sa.Numeric(6, 3), nullable=False, server_default="0"),
        sa.Column("vds_rate_pct", sa.Numeric(6, 3), nullable=False, server_default="0"),
        _coa("income_account_id"),
        _coa("receivable_account_id"),
        _coa("expense_account_id"),
        _coa("payable_account_id"),
        _coa("tds_receivable_account_id"),
        _coa("tds_payable_account_id"),
        _coa("vds_receivable_account_id"),
        _coa("vds_payable_account_id"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "commission_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("scope", sa.String(16), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=True),
        sa.Column("intermediary_id", sa.Integer(), sa.ForeignKey("intermediaries.id", ondelete="CASCADE"), nullable=True),
        sa.Column("rate_type", sa.String(16), nullable=False, server_default="PERCENTAGE"),
        sa.Column("rate", sa.Numeric(12, 4), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("rate >= 0", name="ck_commission_rules_rate_nonneg"),
    )
    op.create_index("ix_commission_rules_tenant_id", "commission_rules", ["tenant_id"])
    op.create_index("ix_commission_rules_customer_id", "commission_rules", ["customer_id"])
    op.create_index("ix_commission_rules_vendor_id", "commission_rules", ["vendor_id"])
    op.create_index("ix_commission_rules_intermediary_id", "commission_rules", ["intermediary_id"])

    op.create_table(
        "commission_shipments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("shipment_ref", sa.String(64), nullable=False),
        sa.Column("shipment_date", sa.Date(), nullable=False),
        sa.Column("shipped_qty", sa.Integer(), nullable=True),
        sa.Column("shipped_value", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("exchange_rate_to_base", sa.Numeric(18, 6), nullable=False, server_default="1"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "order_id", "shipment_ref", name="uq_commission_shipment_ref"),
        sa.CheckConstraint("shipped_value >= 0", name="ck_commission_shipments_value_nonneg"),
        sa.CheckConstraint("exchange_rate_to_base > 0", name="ck_commission_shipments_rate_pos"),
    )
    op.create_index("ix_commission_shipments_tenant_id", "commission_shipments", ["tenant_id"])
    op.create_index("ix_commission_shipments_order_id", "commission_shipments", ["order_id"])
    op.create_index("ix_commission_shipments_vendor_id", "commission_shipments", ["vendor_id"])

    op.create_table(
        "commission_statements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("statement_code", sa.String(32), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("counterparty_type", sa.String(16), nullable=False),
        sa.Column("counterparty_id", sa.Integer(), nullable=False),
        sa.Column("statement_date", sa.Date(), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("gross_total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("tds_total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("vds_total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("net_total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("base_gross_total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("status", sa.String(16), nullable=False, server_default="DRAFT"),
        sa.Column("voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("issued_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "statement_code", name="uq_commission_statement_code"),
    )
    op.create_index("ix_commission_statements_tenant_id", "commission_statements", ["tenant_id"])
    op.create_index("ix_commission_statements_direction", "commission_statements", ["direction"])
    op.create_index("ix_commission_statements_status", "commission_statements", ["status"])

    op.create_table(
        "commission_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shipment_id", sa.Integer(), sa.ForeignKey("commission_shipments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("counterparty_type", sa.String(16), nullable=False),
        sa.Column("counterparty_id", sa.Integer(), nullable=False),
        sa.Column("rate_type", sa.String(16), nullable=False),
        sa.Column("rate", sa.Numeric(12, 4), nullable=False),
        sa.Column("rate_source", sa.String(40), nullable=False),
        sa.Column("base_amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("gross_amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("tds_rate_pct", sa.Numeric(6, 3), nullable=False, server_default="0"),
        sa.Column("tds_amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("vds_rate_pct", sa.Numeric(6, 3), nullable=False, server_default="0"),
        sa.Column("vds_amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("net_amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
        sa.Column("statement_id", sa.Integer(), sa.ForeignKey("commission_statements.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_commission_entries_tenant_id", "commission_entries", ["tenant_id"])
    op.create_index("ix_commission_entries_shipment_id", "commission_entries", ["shipment_id"])
    op.create_index("ix_commission_entries_direction", "commission_entries", ["direction"])
    op.create_index("ix_commission_entries_status", "commission_entries", ["status"])
    op.create_index("ix_commission_entries_statement_id", "commission_entries", ["statement_id"])


def downgrade() -> None:
    op.drop_table("commission_entries")
    op.drop_table("commission_statements")
    op.drop_table("commission_shipments")
    op.drop_table("commission_rules")
    op.drop_table("commission_settings")
