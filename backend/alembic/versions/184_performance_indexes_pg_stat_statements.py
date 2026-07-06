"""Composite tenant/status indexes + pg_stat_statements extension."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "184"
down_revision: Union[str, None] = "183"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements")

    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_orders_tenant_status "
            "ON orders (tenant_id, status)"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_btb_lcs_tenant_status "
            "ON btb_lcs (tenant_id, status)"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_btb_lcs_tenant_status")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_orders_tenant_status")
