"""Create party_ledger_bills table (Sprint 1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "196"
down_revision: Union[str, None] = "195"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "party_ledger_bills",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("party_ledger_id", sa.Integer(), nullable=False),
        sa.Column("bill_number", sa.String(length=64), nullable=False),
        sa.Column("bill_date", sa.Date(), nullable=False),
        sa.Column("bill_type", sa.String(length=16), nullable=False),
        sa.Column("source_module", sa.String(length=32), nullable=True),
        sa.Column("source_module_ref", sa.String(length=128), nullable=True),
        sa.Column("voucher_id", sa.Integer(), nullable=True),
        sa.Column("voucher_line_id", sa.Integer(), nullable=True),
        sa.Column("commercial_invoice_id", sa.Integer(), nullable=True),
        sa.Column("vendor_bill_id", sa.Integer(), nullable=True),
        sa.Column("original_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("amount_type", sa.String(length=6), nullable=False),
        sa.Column("pending_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("settled_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="PENDING"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("interest_rate_monthly", sa.Numeric(5, 2), nullable=True),
        sa.Column("interest_accrued", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("interest_last_calculated_at", sa.DateTime(), nullable=True),
        sa.Column("narration", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("amount_type IN ('DR', 'CR')", name="ck_party_ledger_bills_amount_type"),
        sa.CheckConstraint(
            "status IN ('PENDING', 'PARTIAL', 'SETTLED', 'OVERDUE', 'CANCELLED')",
            name="ck_party_ledger_bills_status",
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["party_ledger_id"], ["party_ledgers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["voucher_line_id"], ["voucher_lines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["commercial_invoice_id"], ["commercial_invoices.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["vendor_bill_id"], ["vendor_bills.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "bill_number", name="uq_party_ledger_bills_tenant_bill_number"),
    )
    op.create_index("ix_party_ledger_bills_tenant_id", "party_ledger_bills", ["tenant_id"])
    op.create_index("ix_party_ledger_bills_party_ledger_id", "party_ledger_bills", ["party_ledger_id"])
    op.create_index("ix_party_ledger_bills_bill_number", "party_ledger_bills", ["bill_number"])
    op.create_index("ix_party_ledger_bills_status", "party_ledger_bills", ["status"])
    op.create_index("ix_party_ledger_bills_due_date", "party_ledger_bills", ["due_date"])
    op.create_index("ix_party_ledger_bills_voucher_id", "party_ledger_bills", ["voucher_id"])
    op.create_index("ix_party_ledger_bills_source_module", "party_ledger_bills", ["source_module"])
    op.create_index(
        "ix_party_ledger_bills_commercial_invoice_id", "party_ledger_bills", ["commercial_invoice_id"]
    )
    op.create_index("ix_party_ledger_bills_vendor_bill_id", "party_ledger_bills", ["vendor_bill_id"])


def downgrade() -> None:
    op.drop_index("ix_party_ledger_bills_vendor_bill_id", table_name="party_ledger_bills")
    op.drop_index("ix_party_ledger_bills_commercial_invoice_id", table_name="party_ledger_bills")
    op.drop_index("ix_party_ledger_bills_source_module", table_name="party_ledger_bills")
    op.drop_index("ix_party_ledger_bills_voucher_id", table_name="party_ledger_bills")
    op.drop_index("ix_party_ledger_bills_due_date", table_name="party_ledger_bills")
    op.drop_index("ix_party_ledger_bills_status", table_name="party_ledger_bills")
    op.drop_index("ix_party_ledger_bills_bill_number", table_name="party_ledger_bills")
    op.drop_index("ix_party_ledger_bills_party_ledger_id", table_name="party_ledger_bills")
    op.drop_index("ix_party_ledger_bills_tenant_id", table_name="party_ledger_bills")
    op.drop_table("party_ledger_bills")
