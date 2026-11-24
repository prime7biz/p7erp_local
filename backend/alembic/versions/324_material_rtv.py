"""Phase 6: material RTV (vendor return/exchange) documents + RLS.

Behind ``material_returns_v1`` (default OFF).
Rollback: ``alembic downgrade 323``.

Revision ID: 324
Revises: 323
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "324"
down_revision: Union[str, None] = "323"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLES = ("material_rtv_documents", "material_rtv_lines")


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
        "material_rtv_documents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rtv_no", sa.String(32), nullable=False),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False),
        sa.Column(
            "warehouse_id", sa.Integer(), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("status", sa.String(24), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "stock_movement_id",
            sa.Integer(),
            sa.ForeignKey("stock_movements.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "rtv_no", name="uq_material_rtv_no"),
    )
    op.create_index("ix_mrtv_tenant_id", "material_rtv_documents", ["tenant_id"])
    op.create_index("ix_mrtv_vendor_id", "material_rtv_documents", ["vendor_id"])
    op.create_index("ix_mrtv_warehouse_id", "material_rtv_documents", ["warehouse_id"])
    op.create_index("ix_mrtv_created_by", "material_rtv_documents", ["created_by_user_id"])

    op.create_table(
        "material_rtv_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "rtv_id",
            sa.Integer(),
            sa.ForeignKey("material_rtv_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("unit_cost", sa.String(32), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_mrtv_line_tenant", "material_rtv_lines", ["tenant_id"])
    op.create_index("ix_mrtv_line_rtv", "material_rtv_lines", ["rtv_id"])

    for table in TABLES:
        _enable_rls(table)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in reversed(TABLES):
        _disable_rls(table)
    op.drop_table("material_rtv_lines")
    op.drop_table("material_rtv_documents")
