"""One amendment number per order: unique (tenant_id, order_id, amendment_no).

`POST /orders/{id}/amendments` used max(amendment_no)+1 without a lock, so two saves at the same
time could both get the same number. The app now locks the order row; this index is the backstop.

Production safety: if old duplicate numbers already exist, the index is created as a *partial*
index that only covers rows newer than the last duplicate (legacy rows are left untouched and
reported in the log). Built with CREATE UNIQUE INDEX CONCURRENTLY (no long table lock).
Read-only duplicate check: `SELECT tenant_id, order_id, amendment_no, count(*) FROM order_amendments
GROUP BY 1,2,3 HAVING count(*) > 1`.

Rollback: `alembic downgrade 250` (drops the index only).

Revision ID: 265
Revises: 250
"""

from __future__ import annotations

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "265"
down_revision: Union[str, None] = "250"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "uq_order_amendments_tenant_order_no"
log = logging.getLogger("alembic.runtime.migration")


def _legacy_duplicate_cutoff() -> int:
    """Highest id among rows that share a number with another row (0 = no duplicates)."""
    return int(
        op.get_bind().execute(
            sa.text(
                """
                SELECT COALESCE(MAX(a.id), 0)
                FROM order_amendments a
                JOIN (
                    SELECT tenant_id, order_id, amendment_no
                    FROM order_amendments
                    GROUP BY tenant_id, order_id, amendment_no
                    HAVING COUNT(*) > 1
                ) d USING (tenant_id, order_id, amendment_no)
                """
            )
        ).scalar()
        or 0
    )


def upgrade() -> None:
    cutoff = _legacy_duplicate_cutoff()
    where = ""
    if cutoff:
        log.warning(
            "order_amendments has duplicate amendment numbers (ids <= %s); unique index covers only id > %s",
            cutoff,
            cutoff,
        )
        where = f" WHERE id > {cutoff}"
    with op.get_context().autocommit_block():
        # A failed CONCURRENTLY build leaves an INVALID index behind; drop it so the retry rebuilds it.
        is_invalid = op.get_bind().execute(
            sa.text("SELECT NOT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:name)"),
            {"name": INDEX_NAME},
        ).scalar()
        if is_invalid:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX_NAME}")
        op.execute(
            f"CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS {INDEX_NAME} "
            f"ON order_amendments (tenant_id, order_id, amendment_no){where}"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX_NAME}")
