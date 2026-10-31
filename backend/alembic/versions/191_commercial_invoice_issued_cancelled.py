"""Add issued_at / cancelled_at on commercial_invoices (Phase 1.2 polish)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "191"
down_revision: Union[str, None] = "190"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "commercial_invoices",
        sa.Column("issued_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "commercial_invoices",
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("commercial_invoices", "cancelled_at")
    op.drop_column("commercial_invoices", "issued_at")
