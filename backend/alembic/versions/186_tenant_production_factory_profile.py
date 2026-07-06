"""Add factory_profile to tenant_production_settings."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "186"
down_revision: Union[str, None] = "185"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenant_production_settings",
        sa.Column("factory_profile", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_production_settings", "factory_profile")
