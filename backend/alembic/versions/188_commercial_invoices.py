"""Add commercial_invoices, lines, and CI receipt allocations."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "188"
down_revision: Union[str, None] = "187"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "commercial_invoices",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("invoice_code", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("source_delivery_challan_id", sa.Integer(), nullable=True),
        sa.Column("invoice_date", sa.Date(), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("exchange_rate_to_base", sa.Numeric(18, 6), nullable=True),
        sa.Column("total_amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("base_total_amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ar_voucher_id", sa.Integer(), nullable=True),
        sa.Column("price_review_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["source_delivery_challan_id"], ["delivery_challans.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["ar_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "invoice_code", name="uq_commercial_invoices_tenant_code"),
        sa.UniqueConstraint(
            "tenant_id",
            "source_delivery_challan_id",
            "customer_id",
            "currency",
            "idempotency_key",
            name="uq_ci_from_challan_idempotency",
        ),
    )
    op.create_index("ix_commercial_invoices_tenant_id", "commercial_invoices", ["tenant_id"])
    op.create_index("ix_commercial_invoices_status", "commercial_invoices", ["status"])
    op.create_index("ix_commercial_invoices_customer_id", "commercial_invoices", ["customer_id"])
    op.create_index(
        "ix_commercial_invoices_source_delivery_challan_id",
        "commercial_invoices",
        ["source_delivery_challan_id"],
    )
    op.create_index("ix_commercial_invoices_ar_voucher_id", "commercial_invoices", ["ar_voucher_id"])

    op.create_table(
        "commercial_invoice_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("commercial_invoice_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=True),
        sa.Column("delivery_challan_item_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("quantity", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("unit_price", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("line_amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("price_source", sa.String(length=32), nullable=False, server_default="MISSING"),
        sa.Column("price_source_ref", sa.JSON(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["commercial_invoice_id"], ["commercial_invoices.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["delivery_challan_item_id"], ["delivery_challan_items.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_commercial_invoice_lines_tenant_id", "commercial_invoice_lines", ["tenant_id"]
    )
    op.create_index(
        "ix_commercial_invoice_lines_invoice_id",
        "commercial_invoice_lines",
        ["commercial_invoice_id"],
    )
    op.create_index("ix_commercial_invoice_lines_order_id", "commercial_invoice_lines", ["order_id"])
    op.create_index("ix_commercial_invoice_lines_item_id", "commercial_invoice_lines", ["item_id"])

    op.create_table(
        "commercial_invoice_receipt_allocations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("commercial_invoice_id", sa.Integer(), nullable=False),
        sa.Column("voucher_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("allocated_amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("allocated_base_amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("exchange_rate_to_base", sa.Numeric(18, 6), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="PENDING"),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["commercial_invoice_id"], ["commercial_invoices.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "commercial_invoice_id",
            "voucher_id",
            name="uq_ci_receipt_alloc_tenant_ci_voucher",
        ),
        sa.UniqueConstraint(
            "tenant_id",
            "commercial_invoice_id",
            "idempotency_key",
            name="uq_ci_receipt_alloc_tenant_ci_idempotency",
        ),
    )
    op.create_index(
        "ix_ci_receipt_alloc_tenant_id",
        "commercial_invoice_receipt_allocations",
        ["tenant_id"],
    )
    op.create_index(
        "ix_ci_receipt_alloc_ci_id",
        "commercial_invoice_receipt_allocations",
        ["commercial_invoice_id"],
    )
    op.create_index(
        "ix_ci_receipt_alloc_voucher_id",
        "commercial_invoice_receipt_allocations",
        ["voucher_id"],
    )
    op.create_index(
        "ix_ci_receipt_alloc_status",
        "commercial_invoice_receipt_allocations",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_ci_receipt_alloc_status", table_name="commercial_invoice_receipt_allocations")
    op.drop_index("ix_ci_receipt_alloc_voucher_id", table_name="commercial_invoice_receipt_allocations")
    op.drop_index("ix_ci_receipt_alloc_ci_id", table_name="commercial_invoice_receipt_allocations")
    op.drop_index("ix_ci_receipt_alloc_tenant_id", table_name="commercial_invoice_receipt_allocations")
    op.drop_table("commercial_invoice_receipt_allocations")

    op.drop_index("ix_commercial_invoice_lines_item_id", table_name="commercial_invoice_lines")
    op.drop_index("ix_commercial_invoice_lines_order_id", table_name="commercial_invoice_lines")
    op.drop_index("ix_commercial_invoice_lines_invoice_id", table_name="commercial_invoice_lines")
    op.drop_index("ix_commercial_invoice_lines_tenant_id", table_name="commercial_invoice_lines")
    op.drop_table("commercial_invoice_lines")

    op.drop_index("ix_commercial_invoices_ar_voucher_id", table_name="commercial_invoices")
    op.drop_index(
        "ix_commercial_invoices_source_delivery_challan_id", table_name="commercial_invoices"
    )
    op.drop_index("ix_commercial_invoices_customer_id", table_name="commercial_invoices")
    op.drop_index("ix_commercial_invoices_status", table_name="commercial_invoices")
    op.drop_index("ix_commercial_invoices_tenant_id", table_name="commercial_invoices")
    op.drop_table("commercial_invoices")
