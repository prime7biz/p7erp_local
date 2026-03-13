"""Add hashed confirmation token fields for AI actions.

Revision ID: 051
Revises: 050
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "051"
down_revision: Union[str, None] = "050"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ai_action_runs", sa.Column("confirmation_token_hash", sa.String(length=128), nullable=True))
    op.add_column("ai_action_runs", sa.Column("confirmation_token_last4", sa.String(length=8), nullable=True))
    op.create_index(
        "ix_ai_action_runs_confirmation_token_hash",
        "ai_action_runs",
        ["confirmation_token_hash"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ai_action_runs_confirmation_token_hash", table_name="ai_action_runs")
    op.drop_column("ai_action_runs", "confirmation_token_last4")
    op.drop_column("ai_action_runs", "confirmation_token_hash")
