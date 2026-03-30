"""Add Phase 20 evaluator columns to existing ai_automation_rules (049).

Revision ID: 140
Revises: 139
Create Date: 2026-03-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "140"
down_revision: Union[str, None] = "139"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ai_automation_rules", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "ai_automation_rules",
        sa.Column("condition_json", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ai_automation_rules", "condition_json")
    op.drop_column("ai_automation_rules", "description")
