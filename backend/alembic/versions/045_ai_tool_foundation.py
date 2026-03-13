"""AI Tool phase-1 foundation tables.

Revision ID: 045
Revises: 044
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "045"
down_revision: Union[str, None] = "044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("session_code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default=sa.text("'ACTIVE'")),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("model_name", sa.String(length=128), nullable=True),
        sa.Column("context_json", sa.JSON(), nullable=True),
        sa.Column("last_message_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "session_code", name="uq_ai_sessions_tenant_session_code"),
    )
    op.create_index("ix_ai_sessions_tenant_id", "ai_sessions", ["tenant_id"], unique=False)
    op.create_index("ix_ai_sessions_user_id", "ai_sessions", ["user_id"], unique=False)
    op.create_index("ix_ai_sessions_status", "ai_sessions", ["status"], unique=False)
    op.create_index("ix_ai_sessions_created_at", "ai_sessions", ["created_at"], unique=False)
    op.create_index("ix_ai_sessions_last_message_at", "ai_sessions", ["last_message_at"], unique=False)

    op.create_table(
        "ai_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("sender_user_id", sa.Integer(), nullable=True),
        sa.Column("message_index", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_json", sa.JSON(), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["ai_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sender_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "session_id", "message_index", name="uq_ai_messages_tenant_session_index"),
    )
    op.create_index("ix_ai_messages_tenant_id", "ai_messages", ["tenant_id"], unique=False)
    op.create_index("ix_ai_messages_session_id", "ai_messages", ["session_id"], unique=False)
    op.create_index("ix_ai_messages_role", "ai_messages", ["role"], unique=False)
    op.create_index("ix_ai_messages_created_at", "ai_messages", ["created_at"], unique=False)
    op.create_index("ix_ai_messages_session_created_at", "ai_messages", ["session_id", "created_at"], unique=False)

    op.create_table(
        "ai_tool_invocations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("invocation_code", sa.String(length=64), nullable=False),
        sa.Column("tool_name", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default=sa.text("'PENDING'")),
        sa.Column("input_json", sa.JSON(), nullable=True),
        sa.Column("output_json", sa.JSON(), nullable=True),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["ai_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["ai_messages.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "invocation_code", name="uq_ai_tool_invocations_tenant_invocation_code"),
    )
    op.create_index("ix_ai_tool_invocations_tenant_id", "ai_tool_invocations", ["tenant_id"], unique=False)
    op.create_index("ix_ai_tool_invocations_session_id", "ai_tool_invocations", ["session_id"], unique=False)
    op.create_index("ix_ai_tool_invocations_message_id", "ai_tool_invocations", ["message_id"], unique=False)
    op.create_index("ix_ai_tool_invocations_tool_name", "ai_tool_invocations", ["tool_name"], unique=False)
    op.create_index("ix_ai_tool_invocations_status", "ai_tool_invocations", ["status"], unique=False)
    op.create_index("ix_ai_tool_invocations_started_at", "ai_tool_invocations", ["started_at"], unique=False)

    op.create_table(
        "ai_audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("tool_invocation_id", sa.Integer(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default=sa.text("'INFO'")),
        sa.Column("resource", sa.String(length=64), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("details_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["ai_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["message_id"], ["ai_messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tool_invocation_id"], ["ai_tool_invocations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_audit_logs_tenant_id", "ai_audit_logs", ["tenant_id"], unique=False)
    op.create_index("ix_ai_audit_logs_created_at", "ai_audit_logs", ["created_at"], unique=False)
    op.create_index("ix_ai_audit_logs_action", "ai_audit_logs", ["action"], unique=False)
    op.create_index("ix_ai_audit_logs_severity", "ai_audit_logs", ["severity"], unique=False)
    op.create_index("ix_ai_audit_logs_session_id", "ai_audit_logs", ["session_id"], unique=False)
    op.create_index("ix_ai_audit_logs_request_id", "ai_audit_logs", ["request_id"], unique=False)

    op.create_table(
        "ai_saved_prompts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "key", name="uq_ai_saved_prompts_tenant_key"),
    )
    op.create_index("ix_ai_saved_prompts_tenant_id", "ai_saved_prompts", ["tenant_id"], unique=False)
    op.create_index("ix_ai_saved_prompts_is_active", "ai_saved_prompts", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_saved_prompts_is_active", table_name="ai_saved_prompts")
    op.drop_index("ix_ai_saved_prompts_tenant_id", table_name="ai_saved_prompts")
    op.drop_table("ai_saved_prompts")

    op.drop_index("ix_ai_audit_logs_request_id", table_name="ai_audit_logs")
    op.drop_index("ix_ai_audit_logs_session_id", table_name="ai_audit_logs")
    op.drop_index("ix_ai_audit_logs_severity", table_name="ai_audit_logs")
    op.drop_index("ix_ai_audit_logs_action", table_name="ai_audit_logs")
    op.drop_index("ix_ai_audit_logs_created_at", table_name="ai_audit_logs")
    op.drop_index("ix_ai_audit_logs_tenant_id", table_name="ai_audit_logs")
    op.drop_table("ai_audit_logs")

    op.drop_index("ix_ai_tool_invocations_started_at", table_name="ai_tool_invocations")
    op.drop_index("ix_ai_tool_invocations_status", table_name="ai_tool_invocations")
    op.drop_index("ix_ai_tool_invocations_tool_name", table_name="ai_tool_invocations")
    op.drop_index("ix_ai_tool_invocations_message_id", table_name="ai_tool_invocations")
    op.drop_index("ix_ai_tool_invocations_session_id", table_name="ai_tool_invocations")
    op.drop_index("ix_ai_tool_invocations_tenant_id", table_name="ai_tool_invocations")
    op.drop_table("ai_tool_invocations")

    op.drop_index("ix_ai_messages_session_created_at", table_name="ai_messages")
    op.drop_index("ix_ai_messages_created_at", table_name="ai_messages")
    op.drop_index("ix_ai_messages_role", table_name="ai_messages")
    op.drop_index("ix_ai_messages_session_id", table_name="ai_messages")
    op.drop_index("ix_ai_messages_tenant_id", table_name="ai_messages")
    op.drop_table("ai_messages")

    op.drop_index("ix_ai_sessions_last_message_at", table_name="ai_sessions")
    op.drop_index("ix_ai_sessions_created_at", table_name="ai_sessions")
    op.drop_index("ix_ai_sessions_status", table_name="ai_sessions")
    op.drop_index("ix_ai_sessions_user_id", table_name="ai_sessions")
    op.drop_index("ix_ai_sessions_tenant_id", table_name="ai_sessions")
    op.drop_table("ai_sessions")
