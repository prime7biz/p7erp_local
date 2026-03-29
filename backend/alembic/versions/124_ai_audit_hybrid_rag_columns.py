"""AI audit log columns for hybrid RAG routing and cost tracking.

Revision ID: 124
Revises: 123
Create Date: 2026-03-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "124"
down_revision: Union[str, None] = "123"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing = {c["name"] for c in insp.get_columns("ai_audit_logs")}

    cols = [
        ("trace_id", sa.String(64), True),
        ("route_selected", sa.String(64), True),
        ("tools_called", sa.JSON(), False),
        ("model_used", sa.String(128), False),
        ("prompt_tokens", sa.Integer(), False),
        ("completion_tokens", sa.Integer(), False),
        ("total_tokens", sa.Integer(), False),
        ("latency_ms", sa.Integer(), False),
        ("cost_estimate_usd", sa.Float(), False),
        ("approval_status", sa.String(24), False),
        ("escalation_reason", sa.String(512), False),
        ("prompt_category", sa.String(64), False),
    ]
    for name, col_type, indexed in cols:
        if name not in existing:
            op.add_column("ai_audit_logs", sa.Column(name, col_type, nullable=True))
            if indexed:
                op.create_index(f"ix_ai_audit_logs_{name}", "ai_audit_logs", [name])


def downgrade() -> None:
    for name in (
        "trace_id",
        "route_selected",
        "tools_called",
        "model_used",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "latency_ms",
        "cost_estimate_usd",
        "approval_status",
        "escalation_reason",
        "prompt_category",
    ):
        try:
            op.drop_index(f"ix_ai_audit_logs_{name}", table_name="ai_audit_logs")
        except Exception:
            pass
        try:
            op.drop_column("ai_audit_logs", name)
        except Exception:
            pass
