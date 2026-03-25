"""Optional JSON feature_flags on tenants (e.g. trade_enabled).

Revision ID: 101
Revises: 100
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "101"
down_revision: Union[str, None] = "100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("feature_flags", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "feature_flags")
