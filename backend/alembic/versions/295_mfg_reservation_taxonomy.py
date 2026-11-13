"""stock_reservations: reservation taxonomy columns (Manufacturing Intelligence Phase 2, run R1).

Additive only. Existing rows keep status SOFT / HARD / RELEASED and every new column stays NULL, so all legacy
readers behave exactly as before. New rows written by the (flagged, default OFF) material allocation feature use
status ``ACTIVE`` plus a ``reservation_kind`` (HARD_ATP / TENTATIVE / INFORMATIONAL); legacy readers only read
SOFT / HARD, so ACTIVE rows can never leak into them.

Changes on ``stock_reservations`` (existing tenant table: the RLS policy from 270 already covers it):
* ``reservation_kind`` String(16), ``reservation_source`` String(24), ``expires_at`` DateTime,
  ``bom_item_id`` (FK bom_items, ON DELETE SET NULL), ``lock_version`` Integer NOT NULL server default 0
  (a constant default is a metadata-only change on PostgreSQL 11+).
* CHECK (kind allowlist) and CHECK (an ACTIVE row must carry a kind), both added NOT VALID then VALIDATEd.
* Partial indexes on ACTIVE rows: (tenant_id, item_id) and (tenant_id, order_id, bom_item_id).
* Unique partial index: one ACTIVE row per (tenant, order, bom item, item, kind). NULL order / bom item are
  folded to 0 with COALESCE so the rule also holds for holds without a BOM line (ids are always > 0).

Operational note: index builds take a short write lock on stock_reservations (small table). ``lock_timeout`` is
10 s so the migration fails fast instead of queueing behind long transactions.

Rollback: `alembic downgrade 294` drops the indexes, checks and columns. Export ACTIVE reservations first: the
taxonomy data is lost (legacy SOFT / HARD rows are untouched).

Revision ID: 295
Revises: 294
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "295"
down_revision: Union[str, None] = "294"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KINDS = ("HARD_ATP", "TENTATIVE", "INFORMATIONAL")
CK_KIND = "ck_stock_reservations_kind"
CK_ACTIVE_KIND = "ck_stock_reservations_active_has_kind"
IX_ACTIVE_ITEM = "ix_stock_reservations_active_item"
IX_ACTIVE_ORDER_BOM = "ix_stock_reservations_active_order_bom"
UQ_ACTIVE = "uq_stock_reservations_active_hold"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.add_column("stock_reservations", sa.Column("reservation_kind", sa.String(length=16), nullable=True))
    op.add_column("stock_reservations", sa.Column("reservation_source", sa.String(length=24), nullable=True))
    op.add_column("stock_reservations", sa.Column("expires_at", sa.DateTime(), nullable=True))
    op.add_column(
        "stock_reservations",
        sa.Column("bom_item_id", sa.Integer(), sa.ForeignKey("bom_items.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "stock_reservations",
        sa.Column("lock_version", sa.Integer(), nullable=False, server_default="0"),
    )

    kinds_sql = ", ".join(f"'{k}'" for k in KINDS)
    op.execute(
        f"ALTER TABLE stock_reservations ADD CONSTRAINT {CK_KIND} "
        f"CHECK (reservation_kind IS NULL OR reservation_kind IN ({kinds_sql})) NOT VALID"
    )
    op.execute(
        f"ALTER TABLE stock_reservations ADD CONSTRAINT {CK_ACTIVE_KIND} "
        f"CHECK (status <> 'ACTIVE' OR reservation_kind IS NOT NULL) NOT VALID"
    )
    op.execute(f"ALTER TABLE stock_reservations VALIDATE CONSTRAINT {CK_KIND}")
    op.execute(f"ALTER TABLE stock_reservations VALIDATE CONSTRAINT {CK_ACTIVE_KIND}")

    op.execute(
        f"CREATE INDEX {IX_ACTIVE_ITEM} ON stock_reservations (tenant_id, item_id) WHERE status = 'ACTIVE'"
    )
    op.execute(
        f"CREATE INDEX {IX_ACTIVE_ORDER_BOM} ON stock_reservations (tenant_id, order_id, bom_item_id) "
        f"WHERE status = 'ACTIVE'"
    )
    op.execute(
        f"CREATE UNIQUE INDEX {UQ_ACTIVE} ON stock_reservations "
        f"(tenant_id, COALESCE(order_id, 0), COALESCE(bom_item_id, 0), item_id, reservation_kind) "
        f"WHERE status = 'ACTIVE'"
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute(f"DROP INDEX IF EXISTS {UQ_ACTIVE}")
    op.execute(f"DROP INDEX IF EXISTS {IX_ACTIVE_ORDER_BOM}")
    op.execute(f"DROP INDEX IF EXISTS {IX_ACTIVE_ITEM}")
    op.execute(f"ALTER TABLE stock_reservations DROP CONSTRAINT IF EXISTS {CK_ACTIVE_KIND}")
    op.execute(f"ALTER TABLE stock_reservations DROP CONSTRAINT IF EXISTS {CK_KIND}")
    op.drop_column("stock_reservations", "lock_version")
    op.drop_column("stock_reservations", "bom_item_id")
    op.drop_column("stock_reservations", "expires_at")
    op.drop_column("stock_reservations", "reservation_source")
    op.drop_column("stock_reservations", "reservation_kind")
