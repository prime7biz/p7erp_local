"""Proforma invoice commercial export: new columns and proforma_invoice_orders.

Revision ID: 065
Revises: 064
Create Date: 2026-03-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "065"
down_revision: Union[str, None] = "064"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns to proforma_invoices (all nullable)
    op.add_column(
        "proforma_invoices",
        sa.Column("buyer_name", sa.Text(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("buyer_address", sa.Text(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("buyer_bank_details", sa.Text(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("consignee_name", sa.Text(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("consignee_address", sa.Text(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("notify_party_name", sa.Text(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("notify_party_address", sa.Text(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("beneficiary_name", sa.Text(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("beneficiary_address", sa.Text(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("terms_of_shipping", sa.String(64), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("terms_of_payment", sa.String(64), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("currency", sa.String(10), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("shipping_country", sa.String(128), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("destination_port_or_airport", sa.String(255), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("shipment_port", sa.String(255), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("documents_to_provide", sa.JSON(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("terms_and_conditions", sa.JSON(), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("shipper_bank_name", sa.String(255), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("shipper_bank_branch", sa.String(255), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("shipper_bank_account_number", sa.String(255), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("shipper_bank_account_name", sa.String(255), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("shipper_bank_address", sa.String(255), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("shipper_bank_swift", sa.String(255), nullable=True),
    )
    op.add_column(
        "proforma_invoices",
        sa.Column(
            "shipper_bank_account_id",
            sa.Integer(),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_proforma_invoices_shipper_bank_account_id",
        "proforma_invoices",
        "bank_accounts",
        ["shipper_bank_account_id"],
        ["id"],
    )
    op.add_column(
        "proforma_invoices",
        sa.Column("verification_token", sa.String(255), nullable=True),
    )
    op.create_index(
        "ix_proforma_invoices_verification_token",
        "proforma_invoices",
        ["verification_token"],
        unique=True,
    )

    # Create proforma_invoice_orders
    op.create_table(
        "proforma_invoice_orders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "proforma_invoice_id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "order_id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["proforma_invoice_id"],
            ["proforma_invoices.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_proforma_invoice_orders_proforma_invoice_id",
        "proforma_invoice_orders",
        ["proforma_invoice_id"],
    )
    op.create_index(
        "ix_proforma_invoice_orders_order_id",
        "proforma_invoice_orders",
        ["order_id"],
    )
    op.create_unique_constraint(
        "uq_proforma_invoice_orders_pi_order",
        "proforma_invoice_orders",
        ["proforma_invoice_id", "order_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_proforma_invoice_orders_pi_order",
        "proforma_invoice_orders",
        type_="unique",
    )
    op.drop_index(
        "ix_proforma_invoice_orders_order_id",
        table_name="proforma_invoice_orders",
    )
    op.drop_index(
        "ix_proforma_invoice_orders_proforma_invoice_id",
        table_name="proforma_invoice_orders",
    )
    op.drop_table("proforma_invoice_orders")

    op.drop_index(
        "ix_proforma_invoices_verification_token",
        table_name="proforma_invoices",
    )
    op.drop_column("proforma_invoices", "verification_token")
    op.drop_constraint(
        "fk_proforma_invoices_shipper_bank_account_id",
        "proforma_invoices",
        type_="foreignkey",
    )
    op.drop_column("proforma_invoices", "shipper_bank_account_id")
    op.drop_column("proforma_invoices", "shipper_bank_swift")
    op.drop_column("proforma_invoices", "shipper_bank_address")
    op.drop_column("proforma_invoices", "shipper_bank_account_name")
    op.drop_column("proforma_invoices", "shipper_bank_account_number")
    op.drop_column("proforma_invoices", "shipper_bank_branch")
    op.drop_column("proforma_invoices", "shipper_bank_name")
    op.drop_column("proforma_invoices", "terms_and_conditions")
    op.drop_column("proforma_invoices", "documents_to_provide")
    op.drop_column("proforma_invoices", "shipment_port")
    op.drop_column("proforma_invoices", "destination_port_or_airport")
    op.drop_column("proforma_invoices", "shipping_country")
    op.drop_column("proforma_invoices", "currency")
    op.drop_column("proforma_invoices", "terms_of_payment")
    op.drop_column("proforma_invoices", "terms_of_shipping")
    op.drop_column("proforma_invoices", "beneficiary_address")
    op.drop_column("proforma_invoices", "beneficiary_name")
    op.drop_column("proforma_invoices", "notify_party_address")
    op.drop_column("proforma_invoices", "notify_party_name")
    op.drop_column("proforma_invoices", "consignee_address")
    op.drop_column("proforma_invoices", "consignee_name")
    op.drop_column("proforma_invoices", "buyer_bank_details")
    op.drop_column("proforma_invoices", "buyer_address")
    op.drop_column("proforma_invoices", "buyer_name")
