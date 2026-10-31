"""Create party_ledger_bill_allocations table (Sprint 1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "197"
down_revision: Union[str, None] = "196"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "party_ledger_bill_allocations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("bill_id", sa.Integer(), nullable=False),
        sa.Column("voucher_id", sa.Integer(), nullable=False),
        sa.Column("voucher_line_id", sa.Integer(), nullable=True),
        sa.Column("allocated_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("allocated_date", sa.Date(), nullable=False),
        sa.Column("bill_balance_after", sa.Numeric(15, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bill_id"], ["party_ledger_bills.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voucher_line_id"], ["voucher_lines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "bill_id",
            "voucher_id",
            name="uq_party_ledger_alloc_tenant_bill_voucher",
        ),
    )
    op.create_index(
        "ix_party_ledger_bill_allocations_tenant_id", "party_ledger_bill_allocations", ["tenant_id"]
    )
    op.create_index(
        "ix_party_ledger_bill_allocations_bill_id", "party_ledger_bill_allocations", ["bill_id"]
    )
    op.create_index(
        "ix_party_ledger_bill_allocations_voucher_id", "party_ledger_bill_allocations", ["voucher_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_party_ledger_bill_allocations_voucher_id", table_name="party_ledger_bill_allocations")
    op.drop_index("ix_party_ledger_bill_allocations_bill_id", table_name="party_ledger_bill_allocations")
    op.drop_index("ix_party_ledger_bill_allocations_tenant_id", table_name="party_ledger_bill_allocations")
    op.drop_table("party_ledger_bill_allocations")
