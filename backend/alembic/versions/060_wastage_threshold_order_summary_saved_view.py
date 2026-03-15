"""Wastage Phase 3: threshold rules, order summary, saved views.

Revision ID: 060
Revises: 059
Create Date: 2026-03-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "060"
down_revision: Union[str, None] = "059"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wastage_threshold_rules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("scope_type", sa.String(32), nullable=False),
        sa.Column("scope_id", sa.Integer(), nullable=True),
        sa.Column("allowed_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("critical_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_wastage_threshold_rules_tenant_id", "wastage_threshold_rules", ["tenant_id"], unique=False)
    op.create_index(
        "ix_wastage_threshold_rules_tenant_scope",
        "wastage_threshold_rules",
        ["tenant_id", "scope_type", "scope_id"],
        unique=False,
    )

    op.create_table(
        "wastage_order_summaries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("planned_fabric_cons", sa.String(32), nullable=False, server_default="0"),
        sa.Column("actual_fabric_cons", sa.String(32), nullable=False, server_default="0"),
        sa.Column("fabric_variance_pct", sa.String(16), nullable=False, server_default="0"),
        sa.Column("trim_wastage_value", sa.String(32), nullable=False, server_default="0"),
        sa.Column("total_wastage_value", sa.String(32), nullable=False, server_default="0"),
        sa.Column("above_threshold", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("snapshot_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_wastage_order_summaries_tenant_id", "wastage_order_summaries", ["tenant_id"], unique=False)
    op.create_index("ix_wastage_order_summaries_order_id", "wastage_order_summaries", ["order_id"], unique=False)
    op.create_index(
        "ix_wastage_order_summaries_tenant_snapshot",
        "wastage_order_summaries",
        ["tenant_id", "snapshot_at"],
        unique=False,
    )

    op.create_table(
        "wastage_saved_views",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("filter_json", sa.JSON(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_wastage_saved_views_tenant_id", "wastage_saved_views", ["tenant_id"], unique=False)
    op.create_index("ix_wastage_saved_views_user_id", "wastage_saved_views", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_wastage_saved_views_user_id", table_name="wastage_saved_views")
    op.drop_index("ix_wastage_saved_views_tenant_id", table_name="wastage_saved_views")
    op.drop_table("wastage_saved_views")
    op.drop_index("ix_wastage_order_summaries_tenant_snapshot", table_name="wastage_order_summaries")
    op.drop_index("ix_wastage_order_summaries_order_id", table_name="wastage_order_summaries")
    op.drop_index("ix_wastage_order_summaries_tenant_id", table_name="wastage_order_summaries")
    op.drop_table("wastage_order_summaries")
    op.drop_index("ix_wastage_threshold_rules_tenant_scope", table_name="wastage_threshold_rules")
    op.drop_index("ix_wastage_threshold_rules_tenant_id", table_name="wastage_threshold_rules")
    op.drop_table("wastage_threshold_rules")
