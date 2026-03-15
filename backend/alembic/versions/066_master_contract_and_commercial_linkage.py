"""Master contract and commercial linkage: master_contracts, ProformaInvoice/BtbLc fields.

Revision ID: 066
Revises: 065
Create Date: 2026-03-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "066"
down_revision: Union[str, None] = "065"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create master_contracts table
    op.create_table(
        "master_contracts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("contract_type", sa.String(length=24), nullable=False, server_default="EXPORT_LC"),
        sa.Column("reference", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("contract_date", sa.Date(), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("buyer_name", sa.String(length=255), nullable=True),
        sa.Column("bank_name", sa.String(length=255), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("btb_utilized_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_master_contracts_tenant_id", "master_contracts", ["tenant_id"])
    op.create_index("ix_master_contracts_reference", "master_contracts", ["reference"])
    op.create_index("ix_master_contracts_status", "master_contracts", ["status"])
    op.create_index("ix_master_contracts_contract_type", "master_contracts", ["contract_type"])

    # Add fields to proforma_invoices
    op.add_column(
        "proforma_invoices",
        sa.Column("direction", sa.String(length=16), nullable=False, server_default="EXPORT"),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("vendor_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("master_contract_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_proforma_invoices_vendor_id",
        "proforma_invoices",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_proforma_invoices_master_contract_id",
        "proforma_invoices",
        "master_contracts",
        ["master_contract_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_proforma_invoices_master_contract_id",
        "proforma_invoices",
        ["master_contract_id"],
    )
    op.create_index(
        "ix_proforma_invoices_vendor_id",
        "proforma_invoices",
        ["vendor_id"],
    )
    op.create_index(
        "ix_proforma_invoices_direction",
        "proforma_invoices",
        ["direction"],
    )

    # Add new columns to btb_lcs
    op.add_column(
        "btb_lcs",
        sa.Column("master_contract_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("proforma_invoice_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("vendor_proforma_invoice_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("purchase_order_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("vendor_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("bank_account_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("currency", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("open_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("expiry_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("maturity_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("maturity_amount", sa.Numeric(18, 2), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("exchange_rate_to_base", sa.Numeric(18, 6), nullable=True),
    )
    op.add_column(
        "btb_lcs",
        sa.Column("base_currency_amount", sa.Numeric(18, 2), nullable=True),
    )
    op.create_foreign_key(
        "fk_btb_lcs_master_contract_id",
        "btb_lcs",
        "master_contracts",
        ["master_contract_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_btb_lcs_proforma_invoice_id",
        "btb_lcs",
        "proforma_invoices",
        ["proforma_invoice_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_btb_lcs_vendor_proforma_invoice_id",
        "btb_lcs",
        "proforma_invoices",
        ["vendor_proforma_invoice_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_btb_lcs_purchase_order_id",
        "btb_lcs",
        "purchase_orders",
        ["purchase_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_btb_lcs_vendor_id",
        "btb_lcs",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_btb_lcs_bank_account_id",
        "btb_lcs",
        "bank_accounts",
        ["bank_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_btb_lcs_master_contract_id", "btb_lcs", ["master_contract_id"])
    op.create_index("ix_btb_lcs_proforma_invoice_id", "btb_lcs", ["proforma_invoice_id"])
    op.create_index("ix_btb_lcs_vendor_proforma_invoice_id", "btb_lcs", ["vendor_proforma_invoice_id"])
    op.create_index("ix_btb_lcs_purchase_order_id", "btb_lcs", ["purchase_order_id"])
    op.create_index("ix_btb_lcs_vendor_id", "btb_lcs", ["vendor_id"])
    op.create_index("ix_btb_lcs_bank_account_id", "btb_lcs", ["bank_account_id"])


def downgrade() -> None:
    op.drop_index("ix_btb_lcs_bank_account_id", table_name="btb_lcs")
    op.drop_index("ix_btb_lcs_vendor_id", table_name="btb_lcs")
    op.drop_index("ix_btb_lcs_purchase_order_id", table_name="btb_lcs")
    op.drop_index("ix_btb_lcs_vendor_proforma_invoice_id", table_name="btb_lcs")
    op.drop_index("ix_btb_lcs_proforma_invoice_id", table_name="btb_lcs")
    op.drop_index("ix_btb_lcs_master_contract_id", table_name="btb_lcs")
    op.drop_constraint("fk_btb_lcs_bank_account_id", "btb_lcs", type_="foreignkey")
    op.drop_constraint("fk_btb_lcs_vendor_id", "btb_lcs", type_="foreignkey")
    op.drop_constraint("fk_btb_lcs_purchase_order_id", "btb_lcs", type_="foreignkey")
    op.drop_constraint("fk_btb_lcs_vendor_proforma_invoice_id", "btb_lcs", type_="foreignkey")
    op.drop_constraint("fk_btb_lcs_proforma_invoice_id", "btb_lcs", type_="foreignkey")
    op.drop_constraint("fk_btb_lcs_master_contract_id", "btb_lcs", type_="foreignkey")
    op.drop_column("btb_lcs", "base_currency_amount")
    op.drop_column("btb_lcs", "exchange_rate_to_base")
    op.drop_column("btb_lcs", "maturity_amount")
    op.drop_column("btb_lcs", "maturity_date")
    op.drop_column("btb_lcs", "expiry_date")
    op.drop_column("btb_lcs", "open_date")
    op.drop_column("btb_lcs", "currency")
    op.drop_column("btb_lcs", "bank_account_id")
    op.drop_column("btb_lcs", "vendor_id")
    op.drop_column("btb_lcs", "purchase_order_id")
    op.drop_column("btb_lcs", "vendor_proforma_invoice_id")
    op.drop_column("btb_lcs", "proforma_invoice_id")
    op.drop_column("btb_lcs", "master_contract_id")

    op.drop_index("ix_proforma_invoices_direction", table_name="proforma_invoices")
    op.drop_index("ix_proforma_invoices_vendor_id", table_name="proforma_invoices")
    op.drop_index("ix_proforma_invoices_master_contract_id", table_name="proforma_invoices")
    op.drop_constraint("fk_proforma_invoices_vendor_id", "proforma_invoices", type_="foreignkey")
    op.drop_constraint(
        "fk_proforma_invoices_master_contract_id",
        "proforma_invoices",
        type_="foreignkey",
    )
    op.drop_column("proforma_invoices", "master_contract_id")
    op.drop_column("proforma_invoices", "vendor_id")
    op.drop_column("proforma_invoices", "direction")

    op.drop_index("ix_master_contracts_contract_type", table_name="master_contracts")
    op.drop_index("ix_master_contracts_status", table_name="master_contracts")
    op.drop_index("ix_master_contracts_reference", table_name="master_contracts")
    op.drop_index("ix_master_contracts_tenant_id", table_name="master_contracts")
    op.drop_table("master_contracts")
