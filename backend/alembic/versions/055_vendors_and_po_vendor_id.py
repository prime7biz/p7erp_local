"""Vendors table and PO.vendor_id (Phase C).

Revision ID: 055
Revises: 054
Create Date: 2026-03-13

Adds vendors master and optional vendor_id on purchase_orders.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "055"
down_revision: Union[str, None] = "054"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendors",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("vendor_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("contact_person", sa.String(length=128), nullable=True),
        sa.Column("email", sa.String(length=128), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vendors_tenant_id", "vendors", ["tenant_id"], unique=False)
    op.create_index("ix_vendors_vendor_code", "vendors", ["vendor_code"], unique=False)

    op.add_column("purchase_orders", sa.Column("vendor_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_purchase_orders_vendor_id_vendors",
        "purchase_orders",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_purchase_orders_vendor_id", "purchase_orders", ["vendor_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_purchase_orders_vendor_id", table_name="purchase_orders")
    op.drop_constraint("fk_purchase_orders_vendor_id_vendors", "purchase_orders", type_="foreignkey")
    op.drop_column("purchase_orders", "vendor_id")

    op.drop_index("ix_vendors_vendor_code", table_name="vendors")
    op.drop_index("ix_vendors_tenant_id", table_name="vendors")
    op.drop_table("vendors")
