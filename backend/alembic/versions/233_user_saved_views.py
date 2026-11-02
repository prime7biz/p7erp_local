"""Generic per-user saved list views for data grids.

Revision ID: 233
Revises: 232
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "233"
down_revision: Union[str, None] = "232"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_saved_views",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("table_key", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_shared", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_user_saved_views_tenant_id", "user_saved_views", ["tenant_id"])
    op.create_index("ix_user_saved_views_user_id", "user_saved_views", ["user_id"])
    op.create_index("ix_user_saved_views_tenant_table", "user_saved_views", ["tenant_id", "table_key"])


def downgrade() -> None:
    op.drop_index("ix_user_saved_views_tenant_table", table_name="user_saved_views")
    op.drop_index("ix_user_saved_views_user_id", table_name="user_saved_views")
    op.drop_index("ix_user_saved_views_tenant_id", table_name="user_saved_views")
    op.drop_table("user_saved_views")
