"""Phase 4: leftover returns + Gate/Challan class-chain columns + RLS.

Behind ``material_conversion_v1`` (default OFF). Additive columns only on gate/challan.
Rollback: ``alembic downgrade 321``.

Revision ID: 322
Revises: 321
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "322"
down_revision: Union[str, None] = "321"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLES = ("material_leftover_returns",)


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


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns(table)}
    return column in cols


def _add_class_chain_cols(table: str) -> None:
    if not _has_column(table, "recommended_by_user_id"):
        op.add_column(
            table,
            sa.Column(
                "recommended_by_user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index(f"ix_{table}_recommended_by", table, ["recommended_by_user_id"])
    if not _has_column(table, "recommended_at"):
        op.add_column(table, sa.Column("recommended_at", sa.DateTime(), nullable=True))
    if not _has_column(table, "class_approval_status"):
        op.add_column(table, sa.Column("class_approval_status", sa.String(24), nullable=True))
        op.create_index(f"ix_{table}_class_approval_status", table, ["class_approval_status"])


def _drop_class_chain_cols(table: str) -> None:
    if _has_column(table, "class_approval_status"):
        op.drop_index(f"ix_{table}_class_approval_status", table_name=table)
        op.drop_column(table, "class_approval_status")
    if _has_column(table, "recommended_at"):
        op.drop_column(table, "recommended_at")
    if _has_column(table, "recommended_by_user_id"):
        op.drop_index(f"ix_{table}_recommended_by", table_name=table)
        op.drop_column(table, "recommended_by_user_id")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    op.create_table(
        "material_leftover_returns",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "style_id", sa.Integer(), sa.ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column(
            "warehouse_id", sa.Integer(), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column(
            "cost_layer_id",
            sa.Integer(),
            sa.ForeignKey("inventory_cost_layers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(24), nullable=False, server_default="DRAFT"),
        sa.Column(
            "stock_movement_id",
            sa.Integer(),
            sa.ForeignKey("stock_movements.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_mlr_tenant_id", "material_leftover_returns", ["tenant_id"])
    op.create_index("ix_mlr_tenant_order", "material_leftover_returns", ["tenant_id", "order_id"])
    op.create_index("ix_mlr_tenant_request", "material_leftover_returns", ["tenant_id", "request_id"])
    op.create_index("ix_mlr_item_id", "material_leftover_returns", ["item_id"])
    op.create_index("ix_mlr_warehouse_id", "material_leftover_returns", ["warehouse_id"])
    op.create_index("ix_mlr_created_by", "material_leftover_returns", ["created_by_user_id"])
    op.execute(
        """
        CREATE UNIQUE INDEX uq_mlr_tenant_request_id
        ON material_leftover_returns (tenant_id, request_id)
        WHERE request_id IS NOT NULL
        """
    )
    _enable_rls("material_leftover_returns")

    _add_class_chain_cols("enhanced_gate_passes")
    _add_class_chain_cols("delivery_challans")


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _drop_class_chain_cols("delivery_challans")
    _drop_class_chain_cols("enhanced_gate_passes")
    _disable_rls("material_leftover_returns")
    op.execute("DROP INDEX IF EXISTS uq_mlr_tenant_request_id")
    op.drop_table("material_leftover_returns")
