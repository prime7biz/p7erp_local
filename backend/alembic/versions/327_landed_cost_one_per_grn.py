"""One ALLOCATED landed-cost document per GRN (partial unique).

Prevents concurrent double-bump of FIFO layers for the same GRN.
Rollback: ``alembic downgrade 326``.

Revision ID: 327
Revises: 326
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "327"
down_revision: Union[str, None] = "326"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_mlcd_one_allocated_per_grn
        ON material_landed_cost_docs (tenant_id, goods_receiving_id)
        WHERE status = 'ALLOCATED'
        """
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute("DROP INDEX IF EXISTS uq_mlcd_one_allocated_per_grn")
