"""stock_groups.stock_nature (nullable) + deterministic backfill (finance statements, PLAN 2B).

Additive: one nullable column plus an allowlist check (added NOT VALID, validated after the backfill).
Existing tenant table, so no new RLS policy. Valuation (FIFO) is untouched; this only labels stock groups.

Backfill (only rows whose stock_nature is still NULL), from the mapped inventory ledger's system_code:
- RAW_MATERIAL_INVENTORY  -> RAW_MATERIAL
- FINISHED_GOODS          -> FINISHED_GOODS
- WORK_IN_PROGRESS        -> WORK_IN_PROCESS (as the inventory account, or from wip_account_id when the group
  has no inventory account)
Packing material, unmapped and custom ledgers stay NULL (PLAN open question 4: shown as Unclassified Stock).

Rollback: `alembic downgrade 293` drops the check and the column.

Revision ID: 294
Revises: 293
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "294"
down_revision: Union[str, None] = "293"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CHECK_NAME = "ck_stock_groups_stock_nature"
ALLOWED = ("RAW_MATERIAL", "WORK_IN_PROCESS", "FINISHED_GOODS", "OTHER")


def upgrade() -> None:
    op.add_column("stock_groups", sa.Column("stock_nature", sa.String(length=16), nullable=True))
    allowed_sql = ", ".join(f"'{c}'" for c in ALLOWED)
    op.execute(
        f"ALTER TABLE stock_groups ADD CONSTRAINT {CHECK_NAME} "
        f"CHECK (stock_nature IS NULL OR stock_nature IN ({allowed_sql})) NOT VALID"
    )

    bind = op.get_bind()
    by_inventory_account = (
        ("RAW_MATERIAL_INVENTORY", "RAW_MATERIAL"),
        ("FINISHED_GOODS", "FINISHED_GOODS"),
        ("WORK_IN_PROGRESS", "WORK_IN_PROCESS"),
    )
    for system_code, nature in by_inventory_account:
        bind.execute(
            sa.text(
                "UPDATE stock_groups sg SET stock_nature = :nature FROM chart_of_accounts a "
                "WHERE sg.inventory_account_id = a.id AND a.tenant_id = sg.tenant_id "
                "AND a.system_code = :sc AND sg.stock_nature IS NULL"
            ),
            {"nature": nature, "sc": system_code},
        )
    bind.execute(
        sa.text(
            "UPDATE stock_groups sg SET stock_nature = 'WORK_IN_PROCESS' FROM chart_of_accounts a "
            "WHERE sg.inventory_account_id IS NULL AND sg.wip_account_id = a.id "
            "AND a.tenant_id = sg.tenant_id AND a.system_code = 'WORK_IN_PROGRESS' "
            "AND sg.stock_nature IS NULL"
        )
    )
    op.execute(f"ALTER TABLE stock_groups VALIDATE CONSTRAINT {CHECK_NAME}")


def downgrade() -> None:
    op.execute(f"ALTER TABLE stock_groups DROP CONSTRAINT IF EXISTS {CHECK_NAME}")
    op.drop_column("stock_groups", "stock_nature")
