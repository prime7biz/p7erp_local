"""Phase 2B: FIFO layer allocations + UD material utilization events + RLS.

Behind tenant flag ``material_alloc_ud_v1`` (default OFF).
Rollback: ``alembic downgrade 320`` (export rows first).

Revision ID: 321
Revises: 320
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "321"
down_revision: Union[str, None] = "320"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLES = (
    "material_layer_allocations",
    "ud_material_utilization_events",
)


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


def _tenant_col() -> sa.Column:
    return sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    op.create_table(
        "material_layer_allocations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column(
            "cost_layer_id",
            sa.Integer(),
            sa.ForeignKey("inventory_cost_layers.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column(
            "warehouse_id",
            sa.Integer(),
            sa.ForeignKey("warehouses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "style_id",
            sa.Integer(),
            sa.ForeignKey("garment_styles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "colorway_id",
            sa.Integer(),
            sa.ForeignKey("style_colorways.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("qty_allocated", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("qty_consumed", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("qty_released", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("status", sa.String(16), nullable=False, server_default="ACTIVE"),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint(
            "status IN ('ACTIVE','RELEASED','CONSUMED')",
            name="ck_material_layer_alloc_status",
        ),
    )
    op.create_index("ix_mla_tenant_id", "material_layer_allocations", ["tenant_id"])
    op.create_index("ix_mla_tenant_order", "material_layer_allocations", ["tenant_id", "order_id"])
    op.create_index("ix_mla_tenant_layer", "material_layer_allocations", ["tenant_id", "cost_layer_id"])
    op.create_index("ix_mla_cost_layer_id", "material_layer_allocations", ["cost_layer_id"])
    op.create_index("ix_mla_item_id", "material_layer_allocations", ["item_id"])
    op.create_index("ix_mla_warehouse_id", "material_layer_allocations", ["warehouse_id"])
    op.create_index("ix_mla_created_by", "material_layer_allocations", ["created_by_user_id"])
    op.execute(
        """
        CREATE UNIQUE INDEX uq_mla_tenant_request_id
        ON material_layer_allocations (tenant_id, request_id)
        WHERE request_id IS NOT NULL
        """
    )

    op.create_table(
        "ud_material_utilization_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column(
            "ud_entitlement_id",
            sa.Integer(),
            sa.ForeignKey("bd_ud_entitlements.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "master_contract_id",
            sa.Integer(),
            sa.ForeignKey("master_contracts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "btb_lc_id",
            sa.Integer(),
            sa.ForeignKey("btb_lcs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "purchase_order_id",
            sa.Integer(),
            sa.ForeignKey("purchase_orders.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "style_id",
            sa.Integer(),
            sa.ForeignKey("garment_styles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "colorway_id",
            sa.Integer(),
            sa.ForeignKey("style_colorways.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_document_type", sa.String(64), nullable=False),
        sa.Column("source_document_id", sa.Integer(), nullable=False),
        sa.Column("source_line_id", sa.Integer(), nullable=True),
        sa.Column("source_stage_key", sa.String(64), nullable=False, server_default=""),
        sa.Column("event_kind", sa.String(32), nullable=False),
        sa.Column("qty_normalized", sa.String(32), nullable=False),
        sa.Column("factor_snapshot", sa.String(64), nullable=True),
        sa.Column(
            "reversal_of_event_id",
            sa.Integer(),
            sa.ForeignKey("ud_material_utilization_events.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint(
            "event_kind IN ('ORDERED','RECEIVED','ISSUED','CONVERSION_LOSS','SHIPPED','REVERSED')",
            name="ck_ud_mat_util_event_kind",
        ),
        sa.UniqueConstraint(
            "tenant_id",
            "source_document_type",
            "source_document_id",
            "source_line_id",
            "source_stage_key",
            "event_kind",
            name="uq_ud_mat_util_source_event",
        ),
    )
    op.create_index("ix_ud_mat_util_tenant_id", "ud_material_utilization_events", ["tenant_id"])
    op.create_index(
        "ix_ud_mat_util_tenant_entitlement",
        "ud_material_utilization_events",
        ["tenant_id", "ud_entitlement_id"],
    )
    op.create_index("ix_ud_mat_util_created_by", "ud_material_utilization_events", ["created_by_user_id"])

    for table in TABLES:
        _enable_rls(table)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in reversed(TABLES):
        _disable_rls(table)
    op.drop_table("ud_material_utilization_events")
    op.execute("DROP INDEX IF EXISTS uq_mla_tenant_request_id")
    op.drop_table("material_layer_allocations")
