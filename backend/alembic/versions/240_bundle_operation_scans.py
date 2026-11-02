"""Shop-floor bundle × operation scans (idempotent client keys).

Revision ID: 240
Revises: 239
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "240"
down_revision: Union[str, None] = "239"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bundle_operation_scans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_key", sa.String(64), nullable=False),
        sa.Column("bundle_id", sa.Integer(), sa.ForeignKey("cutting_bundles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ob_op_id", sa.Integer(), sa.ForeignKey("operation_bulletin_ops.id", ondelete="CASCADE"), nullable=False),
        sa.Column("operation_name", sa.String(255), nullable=False),
        sa.Column("smv", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("pieces", sa.Integer(), nullable=False),
        sa.Column("sewing_line_id", sa.Integer(), sa.ForeignKey("sewing_lines.id", ondelete="SET NULL"), nullable=True),
        sa.Column("operator_code", sa.String(32), nullable=True),
        sa.Column("device_id", sa.String(64), nullable=True),
        sa.Column("scanned_at", sa.DateTime(), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("tenant_id", "client_key", name="uq_bundle_scan_client_key"),
        sa.UniqueConstraint("bundle_id", "ob_op_id", name="uq_bundle_scan_bundle_op"),
        sa.CheckConstraint("pieces >= 0", name="ck_bundle_scan_pieces"),
    )
    for col in ("tenant_id", "bundle_id", "order_id", "ob_op_id", "sewing_line_id", "operator_code", "scanned_at"):
        op.create_index(f"ix_bundle_operation_scans_{col}", "bundle_operation_scans", [col])


def downgrade() -> None:
    for col in ("tenant_id", "bundle_id", "order_id", "ob_op_id", "sewing_line_id", "operator_code", "scanned_at"):
        op.drop_index(f"ix_bundle_operation_scans_{col}", table_name="bundle_operation_scans")
    op.drop_table("bundle_operation_scans")
