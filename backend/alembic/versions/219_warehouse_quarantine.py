"""Add is_quarantine to warehouses (Sprint I2)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "219"
down_revision: Union[str, None] = "218"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "warehouses",
        sa.Column("is_quarantine", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_warehouses_is_quarantine", "warehouses", ["is_quarantine"])


def downgrade() -> None:
    op.drop_index("ix_warehouses_is_quarantine", table_name="warehouses")
    op.drop_column("warehouses", "is_quarantine")
