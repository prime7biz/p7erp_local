"""Enhance warehouses (godowns) with location-type flags."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "203"
down_revision: Union[str, None] = "202"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "warehouses",
        sa.Column("is_production_floor", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "warehouses",
        sa.Column("is_store", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "warehouses",
        sa.Column("is_rejected", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("warehouses", "is_rejected")
    op.drop_column("warehouses", "is_store")
    op.drop_column("warehouses", "is_production_floor")
