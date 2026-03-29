"""AI system tasks + dead-letter queue.

Revision ID: 127
Revises: 126
Create Date: 2026-03-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "127"
down_revision: Union[str, None] = "126"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_system_tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("task_code", sa.String(64), nullable=False),
        sa.Column("task_type", sa.String(64), nullable=False),
        sa.Column("task_category", sa.String(24), nullable=False, server_default="informational"),
        sa.Column("status", sa.String(24), nullable=False, server_default="created"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("execution_conditions", sa.JSON(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("result_json", sa.JSON(), nullable=True),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("approved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_retries", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("celery_task_id", sa.String(128), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(), nullable=True),
        sa.Column("queued_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["ai_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "task_code", name="uq_ai_system_tasks_tenant_task_code"),
        sa.UniqueConstraint("idempotency_key", name="uq_ai_system_tasks_idempotency_key"),
    )
    op.create_index("ix_ai_system_tasks_tenant_id", "ai_system_tasks", ["tenant_id"])
    op.create_index("ix_ai_system_tasks_task_type", "ai_system_tasks", ["task_type"])
    op.create_index("ix_ai_system_tasks_status", "ai_system_tasks", ["status"])
    op.create_index("ix_ai_system_tasks_celery_task_id", "ai_system_tasks", ["celery_task_id"])

    op.create_table(
        "ai_system_task_dead_letters",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("original_task_id", sa.Integer(), nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=False),
        sa.Column("last_payload", sa.JSON(), nullable=True),
        sa.Column("retry_exhausted", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("acknowledged", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["original_task_id"], ["ai_system_tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_system_task_dead_letters_tenant_id", "ai_system_task_dead_letters", ["tenant_id"])
    op.create_index(
        "ix_ai_system_task_dead_letters_original_task_id",
        "ai_system_task_dead_letters",
        ["original_task_id"],
    )


def downgrade() -> None:
    op.drop_table("ai_system_task_dead_letters")
    op.drop_table("ai_system_tasks")
