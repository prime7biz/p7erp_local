"""Add ai_provider_config to tenant_production_settings for Gemini overrides.

Revision ID: 112
Revises: 111
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "112"
down_revision: Union[str, None] = "111"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenant_production_settings",
        sa.Column("ai_provider_config", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_production_settings", "ai_provider_config")
