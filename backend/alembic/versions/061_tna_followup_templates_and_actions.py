"""TNA order follow-up: action templates and order follow-up action lines.

Revision ID: 061
Revises: 060
Create Date: 2026-03-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "061"
down_revision: Union[str, None] = "060"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "followup_action_templates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("phase", sa.String(32), nullable=False),
        sa.Column("action_group", sa.String(64), nullable=True),
        sa.Column("sequence_no", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("default_days_before_delivery", sa.Integer(), nullable=True),
        sa.Column("is_mandatory", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("buyer_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["buyer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_followup_action_templates_tenant_id", "followup_action_templates", ["tenant_id"])
    op.create_index("ix_followup_action_templates_code", "followup_action_templates", ["code"])
    op.create_index("ix_followup_action_templates_phase", "followup_action_templates", ["phase"])
    op.create_index("ix_followup_action_templates_buyer_id", "followup_action_templates", ["buyer_id"])

    op.create_table(
        "order_followup_actions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("sequence_no", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("phase", sa.String(32), nullable=False),
        sa.Column("action_group", sa.String(64), nullable=True),
        sa.Column("action_type", sa.String(64), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_template_generated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_mandatory", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("assigned_to_id", sa.Integer(), nullable=True),
        sa.Column("planned_date", sa.Date(), nullable=True),
        sa.Column("actual_submission_date", sa.Date(), nullable=True),
        sa.Column("approval_received_date", sa.Date(), nullable=True),
        sa.Column("actual_completion_date", sa.Date(), nullable=True),
        sa.Column("resubmission_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("approval_status", sa.String(32), nullable=True),
        sa.Column("is_rejected", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("delay_reason", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(16), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["followup_action_templates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["completed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_followup_actions_tenant_id", "order_followup_actions", ["tenant_id"])
    op.create_index("ix_order_followup_actions_order_id", "order_followup_actions", ["order_id"])
    op.create_index("ix_order_followup_actions_template_id", "order_followup_actions", ["template_id"])
    op.create_index("ix_order_followup_actions_phase", "order_followup_actions", ["phase"])
    op.create_index("ix_order_followup_actions_status", "order_followup_actions", ["status"])
    op.create_index("ix_order_followup_actions_planned_date", "order_followup_actions", ["planned_date"])
    op.create_index("ix_order_followup_actions_assigned_to_id", "order_followup_actions", ["assigned_to_id"])

    # Seed default TNA template rows (tenant-agnostic seed: run per-tenant in app or single default tenant)
    # For now we do not seed in migration; backend API can seed on first GET if empty.


def downgrade() -> None:
    op.drop_index("ix_order_followup_actions_assigned_to_id", table_name="order_followup_actions")
    op.drop_index("ix_order_followup_actions_planned_date", table_name="order_followup_actions")
    op.drop_index("ix_order_followup_actions_status", table_name="order_followup_actions")
    op.drop_index("ix_order_followup_actions_phase", table_name="order_followup_actions")
    op.drop_index("ix_order_followup_actions_template_id", table_name="order_followup_actions")
    op.drop_index("ix_order_followup_actions_order_id", table_name="order_followup_actions")
    op.drop_index("ix_order_followup_actions_tenant_id", table_name="order_followup_actions")
    op.drop_table("order_followup_actions")

    op.drop_index("ix_followup_action_templates_buyer_id", table_name="followup_action_templates")
    op.drop_index("ix_followup_action_templates_phase", table_name="followup_action_templates")
    op.drop_index("ix_followup_action_templates_code", table_name="followup_action_templates")
    op.drop_index("ix_followup_action_templates_tenant_id", table_name="followup_action_templates")
    op.drop_table("followup_action_templates")
