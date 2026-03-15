"""Follow-up action rejection history (rejection/resubmission log).

Revision ID: 062
Revises: 061
Create Date: 2026-03-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "062"
down_revision: Union[str, None] = "061"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "followup_action_rejection_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("action_id", sa.Integer(), nullable=False),
        sa.Column("rejected_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("resubmission_date", sa.Date(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["action_id"], ["order_followup_actions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_followup_action_rejection_logs_action_id", "followup_action_rejection_logs", ["action_id"])
    op.create_index("ix_followup_action_rejection_logs_tenant_id", "followup_action_rejection_logs", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_followup_action_rejection_logs_tenant_id", table_name="followup_action_rejection_logs")
    op.drop_index("ix_followup_action_rejection_logs_action_id", table_name="followup_action_rejection_logs")
    op.drop_table("followup_action_rejection_logs")
