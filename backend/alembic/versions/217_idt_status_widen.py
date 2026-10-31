"""Widen inter_department_transfers.status for RECEIVED_PARTIALLY (Sprint I1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "217"
down_revision: Union[str, None] = "216"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "inter_department_transfers",
        "status",
        existing_type=sa.String(length=16),
        type_=sa.String(length=24),
        existing_nullable=False,
        existing_server_default="ISSUED",
    )


def downgrade() -> None:
    op.alter_column(
        "inter_department_transfers",
        "status",
        existing_type=sa.String(length=24),
        type_=sa.String(length=16),
        existing_nullable=False,
        existing_server_default="ISSUED",
    )
