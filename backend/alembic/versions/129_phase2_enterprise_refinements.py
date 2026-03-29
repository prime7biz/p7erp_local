"""Phase-2 enterprise: approval artifacts, policies, ingestion jobs, feedback, task simulation.

Revision ID: 129
Revises: 128
Create Date: 2026-03-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "129"
down_revision: Union[str, None] = "128"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_system_tasks",
        sa.Column("simulation", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_table(
        "ai_approval_artifacts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("artifact_code", sa.String(64), nullable=False),
        sa.Column("artifact_type", sa.String(64), nullable=False),
        sa.Column("source_tool", sa.String(128), nullable=False),
        sa.Column("source_module", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="created"),
        sa.Column("original_input_json", sa.JSON(), nullable=True),
        sa.Column("generated_payload_json", sa.JSON(), nullable=True),
        sa.Column("diff_json", sa.JSON(), nullable=True),
        sa.Column("committed_payload_json", sa.JSON(), nullable=True),
        sa.Column("commit_reference", sa.String(255), nullable=True),
        sa.Column("reviewer_user_id", sa.Integer(), nullable=True),
        sa.Column("reviewer_comments", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("committed_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("rollback_reason", sa.Text(), nullable=True),
        sa.Column("rolled_back_at", sa.DateTime(), nullable=True),
        sa.Column("rolled_back_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["ai_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewer_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["rolled_back_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "artifact_code", name="uq_ai_approval_artifacts_tenant_code"),
    )
    op.create_index("ix_ai_approval_artifacts_tenant_id", "ai_approval_artifacts", ["tenant_id"])
    op.create_index("ix_ai_approval_artifacts_status", "ai_approval_artifacts", ["status"])
    op.create_index("ix_ai_approval_artifacts_created_at", "ai_approval_artifacts", ["created_at"])

    op.create_table(
        "ai_permission_policies",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=True),
        sa.Column("module", sa.String(64), nullable=False, server_default="*"),
        sa.Column("tool_name", sa.String(128), nullable=False, server_default="*"),
        sa.Column("safety_class_allowed", sa.String(24), nullable=False, server_default="*"),
        sa.Column("action", sa.String(16), nullable=False, server_default="allow"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_permission_policies_tenant_role", "ai_permission_policies", ["tenant_id", "role_id"])
    op.create_index("ix_ai_permission_policies_module_tool", "ai_permission_policies", ["tenant_id", "module", "tool_name"])

    op.create_table(
        "ai_task_policies",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("task_type", sa.String(64), nullable=False, server_default="*"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("max_frequency_per_hour", sa.Integer(), nullable=True),
        sa.Column("cooldown_seconds", sa.Integer(), nullable=True),
        sa.Column("allow_simulation", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("require_approval", sa.Boolean(), nullable=True),
        sa.Column("max_retries_override", sa.Integer(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_task_policies_tenant_type", "ai_task_policies", ["tenant_id", "task_type"])

    op.create_table(
        "ai_ingestion_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="queued"),
        sa.Column("trigger", sa.String(32), nullable=False, server_default="manual"),
        sa.Column("source_checksum", sa.String(64), nullable=True),
        sa.Column("previous_checksum", sa.String(64), nullable=True),
        sa.Column("chunks_processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunks_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunks_skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_retries", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_ingestion_jobs_tenant_source_status", "ai_ingestion_jobs", ["tenant_id", "source_type", "status"])

    op.create_table(
        "ai_feedback",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("trace_id", sa.String(64), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correction_text", sa.Text(), nullable=True),
        sa.Column("feedback_category", sa.String(64), nullable=True),
        sa.Column("flagged_for_review", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("detected_intent", sa.String(64), nullable=True),
        sa.Column("route_used", sa.String(64), nullable=True),
        sa.Column("tools_used", sa.JSON(), nullable=True),
        sa.Column("retrieval_method", sa.String(64), nullable=True),
        sa.Column("model_used", sa.String(128), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("reviewed_by_admin_id", sa.Integer(), nullable=True),
        sa.Column("admin_notes", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["ai_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["message_id"], ["ai_messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by_admin_id"], ["platform_admins.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_feedback_tenant_message", "ai_feedback", ["tenant_id", "message_id"])
    op.create_index("ix_ai_feedback_flagged", "ai_feedback", ["flagged_for_review"])


def downgrade() -> None:
    op.drop_index("ix_ai_feedback_flagged", table_name="ai_feedback")
    op.drop_index("ix_ai_feedback_tenant_message", table_name="ai_feedback")
    op.drop_table("ai_feedback")
    op.drop_index("ix_ai_ingestion_jobs_tenant_source_status", table_name="ai_ingestion_jobs")
    op.drop_table("ai_ingestion_jobs")
    op.drop_index("ix_ai_task_policies_tenant_type", table_name="ai_task_policies")
    op.drop_table("ai_task_policies")
    op.drop_index("ix_ai_permission_policies_module_tool", table_name="ai_permission_policies")
    op.drop_index("ix_ai_permission_policies_tenant_role", table_name="ai_permission_policies")
    op.drop_table("ai_permission_policies")
    op.drop_index("ix_ai_approval_artifacts_created_at", table_name="ai_approval_artifacts")
    op.drop_index("ix_ai_approval_artifacts_status", table_name="ai_approval_artifacts")
    op.drop_index("ix_ai_approval_artifacts_tenant_id", table_name="ai_approval_artifacts")
    op.drop_table("ai_approval_artifacts")
    op.drop_column("ai_system_tasks", "simulation")
