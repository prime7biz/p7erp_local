"""Phase 7 lite: material rolls/shade + landed-cost docs + GRN shade/width columns.

Behind ``material_budget_plan_v1`` (rolls) and ``material_landed_cost_v1`` (landed cost).
Rollback: ``alembic downgrade 325``.

Revision ID: 326
Revises: 325
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "326"
down_revision: Union[str, None] = "325"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLES = (
    "material_rolls",
    "material_landed_cost_docs",
    "material_landed_cost_lines",
)


def _enable_rls(table: str) -> None:
    expr = " OR ".join(f"({p})" for p in (_RLS_BYPASS, _RLS_SAME_TENANT))
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(
        f"CREATE POLICY {RLS_POLICY_NAME} ON {table} AS PERMISSIVE FOR ALL "
        f"USING ({expr}) WITH CHECK ({expr})"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def _disable_rls(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns(table)}
    return column in cols


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    if not _has_column("goods_receiving_items", "shade_band"):
        op.add_column("goods_receiving_items", sa.Column("shade_band", sa.String(32), nullable=True))
    if not _has_column("goods_receiving_items", "width_cm"):
        op.add_column("goods_receiving_items", sa.Column("width_cm", sa.String(16), nullable=True))

    op.create_table(
        "material_rolls",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("roll_code", sa.String(64), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False),
        sa.Column(
            "grn_item_id",
            sa.Integer(),
            sa.ForeignKey("goods_receiving_items.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "cost_layer_id",
            sa.Integer(),
            sa.ForeignKey("inventory_cost_layers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("style_id", sa.Integer(), sa.ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "colorway_id", sa.Integer(), sa.ForeignKey("style_colorways.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("lot_number", sa.String(64), nullable=True),
        sa.Column("shade_band", sa.String(32), nullable=True),
        sa.Column("width_cm", sa.String(16), nullable=True),
        sa.Column("qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("qty_remaining", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("status", sa.String(24), nullable=False, server_default="AVAILABLE"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "roll_code", name="uq_material_roll_code"),
    )
    op.create_index("ix_mroll_tenant_id", "material_rolls", ["tenant_id"])
    op.create_index("ix_mroll_item_wh", "material_rolls", ["tenant_id", "item_id", "warehouse_id"])
    op.create_index("ix_mroll_shade", "material_rolls", ["tenant_id", "shade_band"])
    op.execute(
        """
        CREATE UNIQUE INDEX uq_mroll_tenant_request_id
        ON material_rolls (tenant_id, request_id)
        WHERE request_id IS NOT NULL
        """
    )

    op.create_table(
        "material_landed_cost_docs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("doc_no", sa.String(32), nullable=False),
        sa.Column(
            "goods_receiving_id",
            sa.Integer(),
            sa.ForeignKey("goods_receiving.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("status", sa.String(24), nullable=False, server_default="DRAFT"),
        sa.Column("total_amount", sa.String(32), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="BDT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "doc_no", name="uq_mlcd_doc_no"),
    )
    op.create_index("ix_mlcd_tenant_id", "material_landed_cost_docs", ["tenant_id"])
    op.create_index("ix_mlcd_grn", "material_landed_cost_docs", ["tenant_id", "goods_receiving_id"])
    op.execute(
        """
        CREATE UNIQUE INDEX uq_mlcd_tenant_request_id
        ON material_landed_cost_docs (tenant_id, request_id)
        WHERE request_id IS NOT NULL
        """
    )

    op.create_table(
        "material_landed_cost_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "doc_id",
            sa.Integer(),
            sa.ForeignKey("material_landed_cost_docs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("cost_kind", sa.String(32), nullable=False, server_default="FREIGHT"),
        sa.Column("amount", sa.String(32), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_mlcl_tenant", "material_landed_cost_lines", ["tenant_id"])
    op.create_index("ix_mlcl_doc", "material_landed_cost_lines", ["doc_id"])

    for table in TABLES:
        _enable_rls(table)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in reversed(TABLES):
        _disable_rls(table)
    op.drop_table("material_landed_cost_lines")
    op.execute("DROP INDEX IF EXISTS uq_mlcd_tenant_request_id")
    op.drop_table("material_landed_cost_docs")
    op.execute("DROP INDEX IF EXISTS uq_mroll_tenant_request_id")
    op.drop_table("material_rolls")
    if _has_column("goods_receiving_items", "width_cm"):
        op.drop_column("goods_receiving_items", "width_cm")
    if _has_column("goods_receiving_items", "shade_band"):
        op.drop_column("goods_receiving_items", "shade_band")
