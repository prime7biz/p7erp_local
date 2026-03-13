"""Add retention support indexes for AI high-volume tables.

Revision ID: 052
Revises: 051
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op


revision: str = "052"
down_revision: Union[str, None] = "051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_ai_audit_logs_tenant_created_at", "ai_audit_logs", ["tenant_id", "created_at"], unique=False)
    op.create_index("ix_ai_messages_tenant_created_at", "ai_messages", ["tenant_id", "created_at"], unique=False)
    op.create_index(
        "ix_ai_tool_invocations_tenant_started_at",
        "ai_tool_invocations",
        ["tenant_id", "started_at"],
        unique=False,
    )
    op.create_index("ix_ai_action_runs_tenant_created_at", "ai_action_runs", ["tenant_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_action_runs_tenant_created_at", table_name="ai_action_runs")
    op.drop_index("ix_ai_tool_invocations_tenant_started_at", table_name="ai_tool_invocations")
    op.drop_index("ix_ai_messages_tenant_created_at", table_name="ai_messages")
    op.drop_index("ix_ai_audit_logs_tenant_created_at", table_name="ai_audit_logs")
