"""Add AI forecast runs table for phase 4.

Revision ID: 047
Revises: 046
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "047"
down_revision: Union[str, None] = "046"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_forecast_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("forecast_code", sa.String(length=64), nullable=False),
        sa.Column("forecast_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default=sa.text("'PENDING'")),
        sa.Column("source_modules", sa.JSON(), nullable=True),
        sa.Column("assumptions_json", sa.JSON(), nullable=True),
        sa.Column("parameters_json", sa.JSON(), nullable=True),
        sa.Column("result_json", sa.JSON(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("narrative_explanation", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["ai_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_forecast_runs_tenant_id", "ai_forecast_runs", ["tenant_id"], unique=False)
    op.create_index("ix_ai_forecast_runs_user_id", "ai_forecast_runs", ["user_id"], unique=False)
    op.create_index("ix_ai_forecast_runs_session_id", "ai_forecast_runs", ["session_id"], unique=False)
    op.create_index("ix_ai_forecast_runs_request_id", "ai_forecast_runs", ["request_id"], unique=False)
    op.create_index("ix_ai_forecast_runs_forecast_code", "ai_forecast_runs", ["forecast_code"], unique=False)
    op.create_index("ix_ai_forecast_runs_status", "ai_forecast_runs", ["status"], unique=False)
    op.create_index("ix_ai_forecast_runs_created_at", "ai_forecast_runs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_forecast_runs_created_at", table_name="ai_forecast_runs")
    op.drop_index("ix_ai_forecast_runs_status", table_name="ai_forecast_runs")
    op.drop_index("ix_ai_forecast_runs_forecast_code", table_name="ai_forecast_runs")
    op.drop_index("ix_ai_forecast_runs_request_id", table_name="ai_forecast_runs")
    op.drop_index("ix_ai_forecast_runs_session_id", table_name="ai_forecast_runs")
    op.drop_index("ix_ai_forecast_runs_user_id", table_name="ai_forecast_runs")
    op.drop_index("ix_ai_forecast_runs_tenant_id", table_name="ai_forecast_runs")
    op.drop_table("ai_forecast_runs")
