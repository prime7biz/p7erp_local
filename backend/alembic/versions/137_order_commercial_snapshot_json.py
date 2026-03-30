"""Order commercial snapshot JSON (quotation state at conversion).

Revision ID: 137
Revises: 136
Create Date: 2026-03-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "137"
down_revision: Union[str, None] = "136"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("commercial_snapshot_json", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("orders", "commercial_snapshot_json")
