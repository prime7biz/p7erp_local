"""Add rejected_by_user_id and rejected_at to ai_controlled_action_proposals.

Revision ID: 141
Revises: 140
Create Date: 2026-03-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "141"
down_revision: Union[str, None] = "140"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_controlled_action_proposals",
        sa.Column("rejected_by_user_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "ai_controlled_action_proposals",
        sa.Column("rejected_at", sa.DateTime(), nullable=True),
    )
    op.create_foreign_key(
        "fk_ai_cap_rejected_by_user",
        "ai_controlled_action_proposals",
        "users",
        ["rejected_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_ai_cap_rejected_by_user", "ai_controlled_action_proposals", type_="foreignkey")
    op.drop_column("ai_controlled_action_proposals", "rejected_at")
    op.drop_column("ai_controlled_action_proposals", "rejected_by_user_id")
