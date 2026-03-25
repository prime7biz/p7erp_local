"""Audit log request fields and tenant_usage_daily.

Revision ID: 115
Revises: 114
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "115"
down_revision: Union[str, None] = "114"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("ip_address", sa.String(length=45), nullable=True))
    op.add_column("audit_logs", sa.Column("user_agent", sa.Text(), nullable=True))
    op.add_column("audit_logs", sa.Column("request_method", sa.String(length=10), nullable=True))
    op.add_column("audit_logs", sa.Column("request_path", sa.String(length=512), nullable=True))
    op.add_column("audit_logs", sa.Column("response_status", sa.Integer(), nullable=True))
    op.add_column("audit_logs", sa.Column("duration_ms", sa.Integer(), nullable=True))

    op.create_table(
        "tenant_usage_daily",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("api_calls_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("api_errors_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active_users_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("login_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("storage_bytes_used", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("ai_calls_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ai_tokens_used", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "date", name="uq_tenant_usage_daily_tenant_date"),
    )
    op.create_index("ix_tenant_usage_daily_tenant_id", "tenant_usage_daily", ["tenant_id"], unique=False)
    op.create_index("ix_tenant_usage_daily_date", "tenant_usage_daily", ["date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tenant_usage_daily_date", table_name="tenant_usage_daily")
    op.drop_index("ix_tenant_usage_daily_tenant_id", table_name="tenant_usage_daily")
    op.drop_table("tenant_usage_daily")

    op.drop_column("audit_logs", "duration_ms")
    op.drop_column("audit_logs", "response_status")
    op.drop_column("audit_logs", "request_path")
    op.drop_column("audit_logs", "request_method")
    op.drop_column("audit_logs", "user_agent")
    op.drop_column("audit_logs", "ip_address")
