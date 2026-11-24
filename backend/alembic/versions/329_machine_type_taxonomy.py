"""Phase 1B: optional machine type taxonomy + nullable machine_type_code columns.

Additive only. Catalog starts empty; seed from distinct free-text values via
``scripts/list_machine_type_values.py`` then admin confirmation.
Also creates idempotent machine-swap request log for plan-swap.

Rollback: ``alembic downgrade 328``.

Revision ID: 329
Revises: 328
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "329"
down_revision: Union[str, None] = "328"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"


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
        "production_machine_type_codes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("aliases_json", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "code", name="uq_prod_machine_type_codes_tenant_code"),
    )
    op.create_index("ix_prod_machine_type_codes_tenant", "production_machine_type_codes", ["tenant_id"])
    _enable_rls("production_machine_type_codes")

    op.add_column(
        "department_machines",
        sa.Column("machine_type_code", sa.String(32), nullable=True),
    )
    op.add_column(
        "operation_bulletin_ops",
        sa.Column("machine_type_code", sa.String(32), nullable=True),
    )
    op.add_column(
        "ie_operations_library",
        sa.Column("machine_type_code", sa.String(32), nullable=True),
    )

    op.create_table(
        "production_machine_swap_requests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=False),
        sa.Column("target_line_id", sa.Integer(), sa.ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.Column("result_json", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="APPLIED"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "request_id", name="uq_prod_machine_swap_req_tenant_rid"),
    )
    op.create_index("ix_prod_machine_swap_req_tenant", "production_machine_swap_requests", ["tenant_id"])
    _enable_rls("production_machine_swap_requests")


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _disable_rls("production_machine_swap_requests")
    op.drop_table("production_machine_swap_requests")
    op.drop_column("ie_operations_library", "machine_type_code")
    op.drop_column("operation_bulletin_ops", "machine_type_code")
    op.drop_column("department_machines", "machine_type_code")
    _disable_rls("production_machine_type_codes")
    op.drop_table("production_machine_type_codes")
