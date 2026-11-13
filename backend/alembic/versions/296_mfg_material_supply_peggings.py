"""mfg_material_supply_peggings: pegs of open purchase-order supply to orders (Manufacturing Intelligence Phase 2, R2).

New tenant table. Nothing reads it while the strict tenant flag ``mfg_material_allocation_v1`` is OFF (default), so
every existing output is unchanged.

A peg says "this much of the not-yet-received balance of this PO line is promised to this order". It never moves
stock and never posts a voucher.

* ``order_id`` ON DELETE RESTRICT (the order delete guard explains why an order with pegs cannot be deleted),
  ``purchase_order_item_id`` / ``purchase_order_id`` ON DELETE SET NULL (reconcile marks such pegs RELEASED),
  ``bom_item_id`` SET NULL, ``item_id`` RESTRICT, ``tenant_id`` NOT NULL (CASCADE with the tenant).
* CHECK peg_kind (HARD / TENTATIVE), status (ACTIVE / RELEASED / CONSUMED), pegged_qty > 0.
* Unique partial index: one ACTIVE peg per (tenant, PO line, order, BOM line, kind) (top-ups update the row).
* RLS policy ``p7_tenant_isolation`` in this same migration (pattern of 291; guarded by tests/test_rls_policies.py).

Rollback: ``alembic downgrade 295`` drops the table. Export ACTIVE pegs first, the data is lost.

Revision ID: 296
Revises: 295
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "296"
down_revision: Union[str, None] = "295"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLE = "mfg_material_supply_peggings"
UQ_ACTIVE = "uq_mfg_supply_pegs_active"
IX_ACTIVE_ITEM = "ix_mfg_supply_pegs_active_item"
IX_ACTIVE_LINE = "ix_mfg_supply_pegs_active_po_line"


def _enable_rls(table: str) -> None:
    expr = " OR ".join(f"({p})" for p in (_RLS_BYPASS, _RLS_SAME_TENANT))
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(
        f"CREATE POLICY {RLS_POLICY_NAME} ON {table} AS PERMISSIVE FOR ALL USING ({expr}) WITH CHECK ({expr})"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def _disable_rls(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("purchase_order_item_id", sa.Integer(), nullable=True),
        sa.Column("purchase_order_id", sa.Integer(), nullable=True),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("bom_item_id", sa.Integer(), nullable=True),
        sa.Column("peg_kind", sa.String(length=12), nullable=False),
        sa.Column("pegged_qty", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="ACTIVE"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("release_reason", sa.Text(), nullable=True),
        sa.Column("lock_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("released_by_user_id", sa.Integer(), nullable=True),
        sa.Column("released_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("peg_kind IN ('HARD','TENTATIVE')", name="ck_mfg_supply_pegs_kind"),
        sa.CheckConstraint("status IN ('ACTIVE','RELEASED','CONSUMED')", name="ck_mfg_supply_pegs_status"),
        sa.CheckConstraint("pegged_qty > 0", name="ck_mfg_supply_pegs_qty_positive"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["purchase_order_item_id"], ["purchase_order_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["purchase_order_id"], ["purchase_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["bom_item_id"], ["bom_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["released_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_mfg_material_supply_peggings_tenant_id"), TABLE, ["tenant_id"], unique=False)
    op.create_index(op.f("ix_mfg_material_supply_peggings_order_id"), TABLE, ["order_id"], unique=False)
    op.execute(f"CREATE INDEX {IX_ACTIVE_ITEM} ON {TABLE} (tenant_id, item_id) WHERE status = 'ACTIVE'")
    op.execute(
        f"CREATE INDEX {IX_ACTIVE_LINE} ON {TABLE} (tenant_id, purchase_order_item_id) WHERE status = 'ACTIVE'"
    )
    op.execute(
        f"CREATE UNIQUE INDEX {UQ_ACTIVE} ON {TABLE} "
        f"(tenant_id, purchase_order_item_id, order_id, COALESCE(bom_item_id, 0), peg_kind) "
        f"WHERE status = 'ACTIVE'"
    )
    _enable_rls(TABLE)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _disable_rls(TABLE)
    op.execute(f"DROP INDEX IF EXISTS {UQ_ACTIVE}")
    op.execute(f"DROP INDEX IF EXISTS {IX_ACTIVE_LINE}")
    op.execute(f"DROP INDEX IF EXISTS {IX_ACTIVE_ITEM}")
    op.drop_index(op.f("ix_mfg_material_supply_peggings_order_id"), table_name=TABLE)
    op.drop_index(op.f("ix_mfg_material_supply_peggings_tenant_id"), table_name=TABLE)
    op.drop_table(TABLE)
