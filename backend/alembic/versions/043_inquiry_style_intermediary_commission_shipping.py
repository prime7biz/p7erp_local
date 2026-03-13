"""Inquiry/style/intermediary/commission/shipping foundation.

Revision ID: 043
Revises: 042
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "043"
down_revision: Union[str, None] = "042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("garment_styles", sa.Column("style_image_url", sa.String(length=512), nullable=True))

    op.create_table(
        "intermediaries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("contact_name", sa.String(length=255), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("contact_phone", sa.String(length=64), nullable=True),
        sa.Column("contact_address", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_intermediaries_tenant_code"),
    )
    op.create_index("ix_intermediaries_tenant_id", "intermediaries", ["tenant_id"], unique=False)
    op.create_index("ix_intermediaries_kind", "intermediaries", ["kind"], unique=False)

    op.create_table(
        "customer_intermediaries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("intermediary_id", sa.Integer(), nullable=False),
        sa.Column("commission_type", sa.String(length=32), nullable=True),
        sa.Column("commission_value", sa.Numeric(12, 4), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["intermediary_id"], ["intermediaries.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "customer_id",
            "intermediary_id",
            name="uq_customer_intermediaries_tenant_customer_intermediary",
        ),
    )
    op.create_index(
        "ix_customer_intermediaries_tenant_id",
        "customer_intermediaries",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_customer_intermediaries_customer_id",
        "customer_intermediaries",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        "ix_customer_intermediaries_intermediary_id",
        "customer_intermediaries",
        ["intermediary_id"],
        unique=False,
    )

    op.add_column("inquiries", sa.Column("style_id", sa.Integer(), nullable=True))
    op.add_column("inquiries", sa.Column("customer_intermediary_id", sa.Integer(), nullable=True))
    op.add_column("inquiries", sa.Column("shipping_term", sa.String(length=64), nullable=True))
    op.add_column("inquiries", sa.Column("commission_mode", sa.String(length=32), nullable=True))
    op.add_column("inquiries", sa.Column("commission_type", sa.String(length=32), nullable=True))
    op.add_column("inquiries", sa.Column("commission_value", sa.Numeric(12, 4), nullable=True))
    op.create_foreign_key(
        "fk_inquiries_style_id_garment_styles",
        "inquiries",
        "garment_styles",
        ["style_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_inquiries_customer_intermediary_id",
        "inquiries",
        "customer_intermediaries",
        ["customer_intermediary_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_inquiries_style_id", "inquiries", ["style_id"], unique=False)
    op.create_index(
        "ix_inquiries_customer_intermediary_id",
        "inquiries",
        ["customer_intermediary_id"],
        unique=False,
    )

    op.add_column("quotations", sa.Column("customer_intermediary_id", sa.Integer(), nullable=True))
    op.add_column("quotations", sa.Column("shipping_term", sa.String(length=64), nullable=True))
    op.add_column("quotations", sa.Column("commission_mode", sa.String(length=32), nullable=True))
    op.add_column("quotations", sa.Column("commission_type", sa.String(length=32), nullable=True))
    op.add_column("quotations", sa.Column("commission_value", sa.Numeric(12, 4), nullable=True))
    op.create_foreign_key(
        "fk_quotations_customer_intermediary_id",
        "quotations",
        "customer_intermediaries",
        ["customer_intermediary_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_quotations_customer_intermediary_id",
        "quotations",
        ["customer_intermediary_id"],
        unique=False,
    )

    op.add_column("orders", sa.Column("customer_intermediary_id", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("shipping_term", sa.String(length=64), nullable=True))
    op.add_column("orders", sa.Column("commission_mode", sa.String(length=32), nullable=True))
    op.add_column("orders", sa.Column("commission_type", sa.String(length=32), nullable=True))
    op.add_column("orders", sa.Column("commission_value", sa.Numeric(12, 4), nullable=True))
    op.create_foreign_key(
        "fk_orders_customer_intermediary_id",
        "orders",
        "customer_intermediaries",
        ["customer_intermediary_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_orders_customer_intermediary_id",
        "orders",
        ["customer_intermediary_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_orders_customer_intermediary_id", table_name="orders")
    op.drop_constraint("fk_orders_customer_intermediary_id", "orders", type_="foreignkey")
    op.drop_column("orders", "commission_value")
    op.drop_column("orders", "commission_type")
    op.drop_column("orders", "commission_mode")
    op.drop_column("orders", "shipping_term")
    op.drop_column("orders", "customer_intermediary_id")

    op.drop_index("ix_quotations_customer_intermediary_id", table_name="quotations")
    op.drop_constraint("fk_quotations_customer_intermediary_id", "quotations", type_="foreignkey")
    op.drop_column("quotations", "commission_value")
    op.drop_column("quotations", "commission_type")
    op.drop_column("quotations", "commission_mode")
    op.drop_column("quotations", "shipping_term")
    op.drop_column("quotations", "customer_intermediary_id")

    op.drop_index("ix_inquiries_customer_intermediary_id", table_name="inquiries")
    op.drop_index("ix_inquiries_style_id", table_name="inquiries")
    op.drop_constraint("fk_inquiries_customer_intermediary_id", "inquiries", type_="foreignkey")
    op.drop_constraint("fk_inquiries_style_id_garment_styles", "inquiries", type_="foreignkey")
    op.drop_column("inquiries", "commission_value")
    op.drop_column("inquiries", "commission_type")
    op.drop_column("inquiries", "commission_mode")
    op.drop_column("inquiries", "shipping_term")
    op.drop_column("inquiries", "customer_intermediary_id")
    op.drop_column("inquiries", "style_id")

    op.drop_index("ix_customer_intermediaries_intermediary_id", table_name="customer_intermediaries")
    op.drop_index("ix_customer_intermediaries_customer_id", table_name="customer_intermediaries")
    op.drop_index("ix_customer_intermediaries_tenant_id", table_name="customer_intermediaries")
    op.drop_table("customer_intermediaries")

    op.drop_index("ix_intermediaries_kind", table_name="intermediaries")
    op.drop_index("ix_intermediaries_tenant_id", table_name="intermediaries")
    op.drop_table("intermediaries")

    op.drop_column("garment_styles", "style_image_url")
