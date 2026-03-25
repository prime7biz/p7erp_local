"""Sewing line style configs for line plan board.

Revision ID: 094
Revises: 093
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "094"
down_revision: Union[str, None] = "093"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sewing_line_style_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("line_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("style_id", sa.Integer(), nullable=True),
        sa.Column("ob_id", sa.Integer(), nullable=True),
        sa.Column("machine_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("operator_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("helper_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("target_efficiency_pct", sa.Numeric(8, 2), nullable=False, server_default="65"),
        sa.Column("shift_id", sa.Integer(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("planned_end_date", sa.Date(), nullable=True),
        sa.Column("actual_end_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="planned"),
        sa.Column("planned_qty", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("completed_qty", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["line_id"], ["sewing_lines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["ob_id"], ["operation_bulletins.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["shift_id"], ["production_shifts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sewing_line_style_configs_tenant_id", "sewing_line_style_configs", ["tenant_id"])
    op.create_index("ix_sewing_line_style_configs_line_id", "sewing_line_style_configs", ["line_id"])
    op.create_index("ix_sewing_line_style_configs_order_id", "sewing_line_style_configs", ["order_id"])
    op.create_index("ix_sewing_line_style_configs_start_date", "sewing_line_style_configs", ["start_date"])


def downgrade() -> None:
    op.drop_index("ix_sewing_line_style_configs_start_date", table_name="sewing_line_style_configs")
    op.drop_index("ix_sewing_line_style_configs_order_id", table_name="sewing_line_style_configs")
    op.drop_index("ix_sewing_line_style_configs_line_id", table_name="sewing_line_style_configs")
    op.drop_index("ix_sewing_line_style_configs_tenant_id", table_name="sewing_line_style_configs")
    op.drop_table("sewing_line_style_configs")
