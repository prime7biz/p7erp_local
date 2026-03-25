"""AI usage log, tenant AI budgets, platform_settings kill switch.

Revision ID: 117
Revises: 116
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "117"
down_revision: Union[str, None] = "116"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="gemini"),
        sa.Column("model", sa.String(length=64), nullable=True),
        sa.Column("feature", sa.String(length=64), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_usage_log_tenant_id", "ai_usage_log", ["tenant_id"], unique=False)
    op.create_index("ix_ai_usage_log_created_at", "ai_usage_log", ["created_at"], unique=False)

    op.create_table(
        "tenant_ai_budgets",
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("monthly_token_limit", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("monthly_cost_limit_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("current_month_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_month_cost_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("is_throttled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("throttled_at", sa.DateTime(), nullable=True),
        sa.Column("alert_threshold_pct", sa.Integer(), nullable=False, server_default="80"),
        sa.Column("reset_day", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("tenant_id"),
    )

    op.create_table(
        "platform_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("gemini_kill_switch", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("id = 1", name="ck_platform_settings_singleton"),
    )
    op.execute("INSERT INTO platform_settings (id, gemini_kill_switch) VALUES (1, false)")


def downgrade() -> None:
    op.drop_table("platform_settings")
    op.drop_table("tenant_ai_budgets")
    op.drop_index("ix_ai_usage_log_created_at", table_name="ai_usage_log")
    op.drop_index("ix_ai_usage_log_tenant_id", table_name="ai_usage_log")
    op.drop_table("ai_usage_log")
