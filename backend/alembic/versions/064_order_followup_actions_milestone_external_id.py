"""Order follow-up actions: milestone_type and external_id for production/commercial integration.

Revision ID: 064
Revises: 063
Create Date: 2026-03-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "064"
down_revision: Union[str, None] = "063"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("order_followup_actions", sa.Column("milestone_type", sa.String(64), nullable=True))
    op.add_column("order_followup_actions", sa.Column("external_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("order_followup_actions", "external_id")
    op.drop_column("order_followup_actions", "milestone_type")
