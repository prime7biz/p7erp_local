"""Upgrade customers table with advanced profile fields.

Revision ID: 041
Revises: 040
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "041"
down_revision: Union[str, None] = "040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("legal_entity_name", sa.String(length=255), nullable=True))
    op.add_column("customers", sa.Column("trade_name", sa.String(length=255), nullable=True))
    op.add_column("customers", sa.Column("tax_id_vat_number", sa.String(length=128), nullable=True))
    op.add_column("customers", sa.Column("customer_type", sa.String(length=50), nullable=True))
    op.add_column(
        "customers",
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'active'")),
    )
    op.add_column("customers", sa.Column("primary_contact_name", sa.String(length=255), nullable=True))
    op.add_column("customers", sa.Column("designation", sa.String(length=128), nullable=True))
    op.add_column("customers", sa.Column("contact_email", sa.String(length=255), nullable=True))
    op.add_column("customers", sa.Column("contact_phone", sa.String(length=64), nullable=True))
    op.add_column("customers", sa.Column("phone_country_code", sa.String(length=16), nullable=True))
    op.add_column(
        "customers",
        sa.Column("subscribe_newsletter", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("customers", sa.Column("company_logo_url", sa.String(length=512), nullable=True))
    op.add_column("customers", sa.Column("billing_address_line1", sa.String(length=255), nullable=True))
    op.add_column("customers", sa.Column("billing_city", sa.String(length=128), nullable=True))
    op.add_column("customers", sa.Column("billing_postal_code", sa.String(length=32), nullable=True))
    op.add_column("customers", sa.Column("billing_country", sa.String(length=64), nullable=True))
    op.add_column("customers", sa.Column("shipping_address_line1", sa.String(length=255), nullable=True))
    op.add_column("customers", sa.Column("shipping_city", sa.String(length=128), nullable=True))
    op.add_column("customers", sa.Column("shipping_postal_code", sa.String(length=32), nullable=True))
    op.add_column("customers", sa.Column("shipping_country", sa.String(length=64), nullable=True))
    op.add_column(
        "customers",
        sa.Column("same_as_billing", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    op.create_index("ix_customers_status", "customers", ["status"], unique=False)
    op.create_index("ix_customers_customer_type", "customers", ["customer_type"], unique=False)
    op.create_index("ix_customers_billing_country", "customers", ["billing_country"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_customers_billing_country", table_name="customers")
    op.drop_index("ix_customers_customer_type", table_name="customers")
    op.drop_index("ix_customers_status", table_name="customers")

    op.drop_column("customers", "same_as_billing")
    op.drop_column("customers", "shipping_country")
    op.drop_column("customers", "shipping_postal_code")
    op.drop_column("customers", "shipping_city")
    op.drop_column("customers", "shipping_address_line1")
    op.drop_column("customers", "billing_country")
    op.drop_column("customers", "billing_postal_code")
    op.drop_column("customers", "billing_city")
    op.drop_column("customers", "billing_address_line1")
    op.drop_column("customers", "company_logo_url")
    op.drop_column("customers", "subscribe_newsletter")
    op.drop_column("customers", "phone_country_code")
    op.drop_column("customers", "contact_phone")
    op.drop_column("customers", "contact_email")
    op.drop_column("customers", "designation")
    op.drop_column("customers", "primary_contact_name")
    op.drop_column("customers", "status")
    op.drop_column("customers", "customer_type")
    op.drop_column("customers", "tax_id_vat_number")
    op.drop_column("customers", "trade_name")
    op.drop_column("customers", "legal_entity_name")
