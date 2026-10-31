"""Add proforma_receipt_allocations for partial PI receipts."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "187"
down_revision: Union[str, None] = "186"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "proforma_receipt_allocations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("proforma_invoice_id", sa.Integer(), nullable=False),
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
            ["proforma_invoice_id"], ["proforma_invoices.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "proforma_invoice_id",
            "voucher_id",
            name="uq_pi_receipt_alloc_tenant_pi_voucher",
        ),
        sa.UniqueConstraint(
            "tenant_id",
            "proforma_invoice_id",
            "idempotency_key",
            name="uq_pi_receipt_alloc_tenant_pi_idempotency",
        ),
    )
    op.create_index(
        "ix_proforma_receipt_allocations_tenant_id",
        "proforma_receipt_allocations",
        ["tenant_id"],
    )
    op.create_index(
        "ix_proforma_receipt_allocations_proforma_invoice_id",
        "proforma_receipt_allocations",
        ["proforma_invoice_id"],
    )
    op.create_index(
        "ix_proforma_receipt_allocations_voucher_id",
        "proforma_receipt_allocations",
        ["voucher_id"],
    )
    op.create_index(
        "ix_proforma_receipt_allocations_order_id",
        "proforma_receipt_allocations",
        ["order_id"],
    )
    op.create_index(
        "ix_proforma_receipt_allocations_status",
        "proforma_receipt_allocations",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_proforma_receipt_allocations_status", table_name="proforma_receipt_allocations")
    op.drop_index("ix_proforma_receipt_allocations_order_id", table_name="proforma_receipt_allocations")
    op.drop_index("ix_proforma_receipt_allocations_voucher_id", table_name="proforma_receipt_allocations")
    op.drop_index(
        "ix_proforma_receipt_allocations_proforma_invoice_id",
        table_name="proforma_receipt_allocations",
    )
    op.drop_index("ix_proforma_receipt_allocations_tenant_id", table_name="proforma_receipt_allocations")
    op.drop_table("proforma_receipt_allocations")
