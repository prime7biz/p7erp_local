"""Add internal user password reset fields.

Revision ID: 149
Revises: 148
Create Date: 2026-04-05
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "149"
down_revision: Union[str, None] = "148"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_reset_token_hash", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("password_reset_expires_at", sa.DateTime(), nullable=True))
    op.create_index("ix_users_password_reset_expires_at", "users", ["password_reset_expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_password_reset_expires_at", table_name="users")
    op.drop_column("users", "password_reset_expires_at")
    op.drop_column("users", "password_reset_token_hash")
