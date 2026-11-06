"""At most one *active* order BOM per order (partial unique index).

`POST /merch/order-boms/from-order` checked "is there an active BOM?" and then inserted, so two
clicks at the same time could create two active BOMs for one order. The app now locks the order
row; this index is the backstop. Inactive BOMs and style-only (classic) BOMs with no order are not
affected, so older versions can still be kept with is_active = false.

Production safety: if an order already has more than one active BOM, those legacy rows are left
as they are and the index only covers rows newer than the last duplicate (a warning is logged).
Read-only duplicate check: `SELECT tenant_id, order_id, count(*) FROM boms WHERE is_active AND
order_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1`.

Rollback: `alembic downgrade 265` (drops the index only).

Revision ID: 266
Revises: 265
"""

from __future__ import annotations

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "266"
down_revision: Union[str, None] = "265"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "uq_boms_one_active_per_order"
log = logging.getLogger("alembic.runtime.migration")


def _legacy_duplicate_cutoff() -> int:
    """Highest id among orders' duplicate active BOMs (0 = no duplicates)."""
    return int(
        op.get_bind().execute(
            sa.text(
                """
                SELECT COALESCE(MAX(b.id), 0)
                FROM boms b
                JOIN (
                    SELECT tenant_id, order_id
                    FROM boms
                    WHERE is_active AND order_id IS NOT NULL
                    GROUP BY tenant_id, order_id
                    HAVING COUNT(*) > 1
                ) d USING (tenant_id, order_id)
                WHERE b.is_active
                """
            )
        ).scalar()
        or 0
    )


def upgrade() -> None:
    cutoff = _legacy_duplicate_cutoff()
    where = "is_active AND order_id IS NOT NULL"
    if cutoff:
        log.warning(
            "boms has orders with more than one active BOM (ids <= %s); unique index covers only id > %s",
            cutoff,
            cutoff,
        )
        where += f" AND id > {cutoff}"
    with op.get_context().autocommit_block():
        # A failed CONCURRENTLY build leaves an INVALID index behind; drop it so the retry rebuilds it.
        is_invalid = op.get_bind().execute(
            sa.text("SELECT NOT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:name)"),
            {"name": INDEX_NAME},
        ).scalar()
        if is_invalid:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX_NAME}")
        op.execute(f"CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS {INDEX_NAME} ON boms (tenant_id, order_id) WHERE {where}")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX_NAME}")
