"""Admin sessions and tenant rate limits.

Revision ID: 120
Revises: 119
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "120"
down_revision: Union[str, None] = "119"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["admin_id"], ["platform_admins.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_sessions_admin_id", "admin_sessions", ["admin_id"], unique=False)
    op.create_index("ix_admin_sessions_token_hash", "admin_sessions", ["token_hash"], unique=False)

    op.create_table(
        "tenant_rate_limits",
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("requests_per_minute", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("requests_per_hour", sa.Integer(), nullable=False, server_default="10000"),
        sa.Column("is_custom", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("tenant_id"),
    )


def downgrade() -> None:
    op.drop_table("tenant_rate_limits")
    op.drop_index("ix_admin_sessions_token_hash", table_name="admin_sessions")
    op.drop_index("ix_admin_sessions_admin_id", table_name="admin_sessions")
    op.drop_table("admin_sessions")
