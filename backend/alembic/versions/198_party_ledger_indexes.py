"""Add composite performance indexes for party ledger bills (Sprint 1)."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "198"
down_revision: Union[str, None] = "197"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "idx_party_bills_status_due",
        "party_ledger_bills",
        ["party_ledger_id", "status", "due_date"],
    )
    op.create_index(
        "idx_party_ledgers_tenant_active_type",
        "party_ledgers",
        ["tenant_id", "is_active", "party_type"],
    )


def downgrade() -> None:
    op.drop_index("idx_party_ledgers_tenant_active_type", table_name="party_ledgers")
    op.drop_index("idx_party_bills_status_due", table_name="party_ledger_bills")
