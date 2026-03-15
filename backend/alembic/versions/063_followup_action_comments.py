"""Follow-up action comments (inline comments per TNA action).

Revision ID: 063
Revises: 061
Create Date: 2026-03-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "063"
down_revision: Union[str, None] = "062"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "followup_action_comments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("action_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("comment_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["action_id"], ["order_followup_actions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_followup_action_comments_tenant_id", "followup_action_comments", ["tenant_id"])
    op.create_index("ix_followup_action_comments_action_id", "followup_action_comments", ["action_id"])
    op.create_index("ix_followup_action_comments_user_id", "followup_action_comments", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_followup_action_comments_user_id", table_name="followup_action_comments")
    op.drop_index("ix_followup_action_comments_action_id", table_name="followup_action_comments")
    op.drop_index("ix_followup_action_comments_tenant_id", table_name="followup_action_comments")
    op.drop_table("followup_action_comments")
