"""Align coa_config with ORM: created_at and updated_at.

Revision ID: 088
Revises: 087

The CoAConfig model expects these columns; migration 056 created coa_config without them.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "088"
down_revision: Union[str, None] = "087"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "coa_config",
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.add_column(
        "coa_config",
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_column("coa_config", "updated_at")
    op.drop_column("coa_config", "created_at")
