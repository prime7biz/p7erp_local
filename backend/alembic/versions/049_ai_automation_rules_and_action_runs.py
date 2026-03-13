"""Add AI automation rules and action runs for phase 6.

Revision ID: 049
Revises: 048
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "049"
down_revision: Union[str, None] = "048"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_automation_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("rule_code", sa.String(length=64), nullable=False),
        sa.Column("action_key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("requires_confirmation", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("permission_key", sa.String(length=128), nullable=True),
        sa.Column("policy_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "rule_code", name="uq_ai_automation_rules_tenant_rule_code"),
    )
    op.create_index("ix_ai_automation_rules_tenant_id", "ai_automation_rules", ["tenant_id"], unique=False)
    op.create_index("ix_ai_automation_rules_rule_code", "ai_automation_rules", ["rule_code"], unique=False)
    op.create_index("ix_ai_automation_rules_action_key", "ai_automation_rules", ["action_key"], unique=False)
    op.create_index("ix_ai_automation_rules_is_enabled", "ai_automation_rules", ["is_enabled"], unique=False)
    op.create_index("ix_ai_automation_rules_created_at", "ai_automation_rules", ["created_at"], unique=False)

    op.create_table(
        "ai_action_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("rule_id", sa.Integer(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=False),
        sa.Column("action_key", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default=sa.text("'PROPOSED'")),
        sa.Column("requires_confirmation", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("confirmation_token", sa.String(length=64), nullable=True),
        sa.Column("risk_level", sa.String(length=16), nullable=False, server_default=sa.text("'LOW'")),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("preview_text", sa.Text(), nullable=True),
        sa.Column("input_json", sa.JSON(), nullable=True),
        sa.Column("output_json", sa.JSON(), nullable=True),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("executed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["ai_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["message_id"], ["ai_messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["rule_id"], ["ai_automation_rules.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "request_id", name="uq_ai_action_runs_tenant_request_id"),
    )
    op.create_index("ix_ai_action_runs_tenant_id", "ai_action_runs", ["tenant_id"], unique=False)
    op.create_index("ix_ai_action_runs_user_id", "ai_action_runs", ["user_id"], unique=False)
    op.create_index("ix_ai_action_runs_session_id", "ai_action_runs", ["session_id"], unique=False)
    op.create_index("ix_ai_action_runs_message_id", "ai_action_runs", ["message_id"], unique=False)
    op.create_index("ix_ai_action_runs_rule_id", "ai_action_runs", ["rule_id"], unique=False)
    op.create_index("ix_ai_action_runs_request_id", "ai_action_runs", ["request_id"], unique=False)
    op.create_index("ix_ai_action_runs_action_key", "ai_action_runs", ["action_key"], unique=False)
    op.create_index("ix_ai_action_runs_status", "ai_action_runs", ["status"], unique=False)
    op.create_index("ix_ai_action_runs_confirmation_token", "ai_action_runs", ["confirmation_token"], unique=False)
    op.create_index("ix_ai_action_runs_risk_level", "ai_action_runs", ["risk_level"], unique=False)
    op.create_index("ix_ai_action_runs_created_at", "ai_action_runs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_action_runs_created_at", table_name="ai_action_runs")
    op.drop_index("ix_ai_action_runs_risk_level", table_name="ai_action_runs")
    op.drop_index("ix_ai_action_runs_confirmation_token", table_name="ai_action_runs")
    op.drop_index("ix_ai_action_runs_status", table_name="ai_action_runs")
    op.drop_index("ix_ai_action_runs_action_key", table_name="ai_action_runs")
    op.drop_index("ix_ai_action_runs_request_id", table_name="ai_action_runs")
    op.drop_index("ix_ai_action_runs_rule_id", table_name="ai_action_runs")
    op.drop_index("ix_ai_action_runs_message_id", table_name="ai_action_runs")
    op.drop_index("ix_ai_action_runs_session_id", table_name="ai_action_runs")
    op.drop_index("ix_ai_action_runs_user_id", table_name="ai_action_runs")
    op.drop_index("ix_ai_action_runs_tenant_id", table_name="ai_action_runs")
    op.drop_table("ai_action_runs")

    op.drop_index("ix_ai_automation_rules_created_at", table_name="ai_automation_rules")
    op.drop_index("ix_ai_automation_rules_is_enabled", table_name="ai_automation_rules")
    op.drop_index("ix_ai_automation_rules_action_key", table_name="ai_automation_rules")
    op.drop_index("ix_ai_automation_rules_rule_code", table_name="ai_automation_rules")
    op.drop_index("ix_ai_automation_rules_tenant_id", table_name="ai_automation_rules")
    op.drop_table("ai_automation_rules")
