"""Add AI anomaly events table for phase 7.

Revision ID: 050
Revises: 049
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "050"
down_revision: Union[str, None] = "049"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_anomaly_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("source_area", sa.String(length=64), nullable=False),
        sa.Column("rule_code", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default=sa.text("'MEDIUM'")),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("metrics_json", sa.JSON(), nullable=True),
        sa.Column("dimensions_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["ai_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_anomaly_events_tenant_id", "ai_anomaly_events", ["tenant_id"], unique=False)
    op.create_index("ix_ai_anomaly_events_user_id", "ai_anomaly_events", ["user_id"], unique=False)
    op.create_index("ix_ai_anomaly_events_session_id", "ai_anomaly_events", ["session_id"], unique=False)
    op.create_index("ix_ai_anomaly_events_request_id", "ai_anomaly_events", ["request_id"], unique=False)
    op.create_index("ix_ai_anomaly_events_source_area", "ai_anomaly_events", ["source_area"], unique=False)
    op.create_index("ix_ai_anomaly_events_rule_code", "ai_anomaly_events", ["rule_code"], unique=False)
    op.create_index("ix_ai_anomaly_events_severity", "ai_anomaly_events", ["severity"], unique=False)
    op.create_index("ix_ai_anomaly_events_created_at", "ai_anomaly_events", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_anomaly_events_created_at", table_name="ai_anomaly_events")
    op.drop_index("ix_ai_anomaly_events_severity", table_name="ai_anomaly_events")
    op.drop_index("ix_ai_anomaly_events_rule_code", table_name="ai_anomaly_events")
    op.drop_index("ix_ai_anomaly_events_source_area", table_name="ai_anomaly_events")
    op.drop_index("ix_ai_anomaly_events_request_id", table_name="ai_anomaly_events")
    op.drop_index("ix_ai_anomaly_events_session_id", table_name="ai_anomaly_events")
    op.drop_index("ix_ai_anomaly_events_user_id", table_name="ai_anomaly_events")
    op.drop_index("ix_ai_anomaly_events_tenant_id", table_name="ai_anomaly_events")
    op.drop_table("ai_anomaly_events")
