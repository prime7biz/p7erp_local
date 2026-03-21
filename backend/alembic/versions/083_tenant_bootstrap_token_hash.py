"""Optional per-tenant one-time bootstrap token hash for first-user registration.

Revision ID: 083
Revises: 082
Create Date: 2026-03-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "083"
down_revision: Union[str, None] = "082"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("bootstrap_token_hash", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "bootstrap_token_hash")
