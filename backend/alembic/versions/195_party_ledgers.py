"""Create party_ledgers table (Sprint 1 bill-wise AR/AP)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "195"
down_revision: Union[str, None] = "194"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "party_ledgers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("party_type", sa.String(length=16), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=True),
        sa.Column("vendor_id", sa.Integer(), nullable=True),
        sa.Column("ledger_account_id", sa.Integer(), nullable=False),
        sa.Column("credit_limit", sa.Numeric(15, 2), nullable=True),
        sa.Column("credit_days", sa.Integer(), nullable=True),
        sa.Column("interest_rate_monthly", sa.Numeric(5, 2), nullable=True),
        sa.Column("opening_balance", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("opening_balance_type", sa.String(length=6), nullable=False, server_default="DR"),
        sa.Column("opening_balance_date", sa.Date(), nullable=True),
        sa.Column("current_balance", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("current_balance_type", sa.String(length=6), nullable=False, server_default="DR"),
        sa.Column("total_dr_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("total_cr_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("bill_wise_tracking", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.CheckConstraint("party_type IN ('CUSTOMER', 'VENDOR')", name="ck_party_ledgers_party_type"),
        sa.CheckConstraint(
            "(customer_id IS NOT NULL AND vendor_id IS NULL) OR "
            "(customer_id IS NULL AND vendor_id IS NOT NULL)",
            name="ck_party_ledgers_xor_party",
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ledger_account_id"], ["chart_of_accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "customer_id", name="uq_party_ledgers_tenant_customer"),
        sa.UniqueConstraint("tenant_id", "vendor_id", name="uq_party_ledgers_tenant_vendor"),
    )
    op.create_index("ix_party_ledgers_tenant_id", "party_ledgers", ["tenant_id"])
    op.create_index("ix_party_ledgers_customer_id", "party_ledgers", ["customer_id"])
    op.create_index("ix_party_ledgers_vendor_id", "party_ledgers", ["vendor_id"])
    op.create_index("ix_party_ledgers_ledger_account_id", "party_ledgers", ["ledger_account_id"])


def downgrade() -> None:
    op.drop_index("ix_party_ledgers_ledger_account_id", table_name="party_ledgers")
    op.drop_index("ix_party_ledgers_vendor_id", table_name="party_ledgers")
    op.drop_index("ix_party_ledgers_customer_id", table_name="party_ledgers")
    op.drop_index("ix_party_ledgers_tenant_id", table_name="party_ledgers")
    op.drop_table("party_ledgers")
