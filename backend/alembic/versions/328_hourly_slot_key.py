"""Phase 0: add hourly_production_entries.slot_key (nullable) + backfill + non-unique index.

Additive only. Unique constraint comes in a later revision after duplicates are cleaned.
No behaviour change for tenants until application matching uses slot_key.

Rollback: ``alembic downgrade 327``.

Revision ID: 328
Revises: 327
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "328"
down_revision: Union[str, None] = "327"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.add_column(
        "hourly_production_entries",
        sa.Column("slot_key", sa.String(128), nullable=True),
    )
    # Stable key: dept|date|hour|line|machine|shift (0 when null FKs).
    op.execute(
        """
        UPDATE hourly_production_entries
        SET slot_key = CONCAT_WS(
            '|',
            department_type,
            production_date::text,
            hour_slot::text,
            COALESCE(line_id::text, '0'),
            COALESCE(machine_id::text, '0'),
            COALESCE(shift_id::text, '0')
        )
        WHERE slot_key IS NULL
        """
    )
    op.create_index(
        "ix_hourly_prod_tenant_slot_key",
        "hourly_production_entries",
        ["tenant_id", "slot_key"],
        unique=False,
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.drop_index("ix_hourly_prod_tenant_slot_key", table_name="hourly_production_entries")
    op.drop_column("hourly_production_entries", "slot_key")
