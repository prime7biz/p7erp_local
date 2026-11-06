"""Platform admins: optional TOTP second factor.

Adds ``totp_secret`` (nullable), ``totp_enabled`` (default false) and ``totp_last_used_step``
(replay protection). Nothing changes for existing admins until they enrol.

Downgrade drops the three columns (any enrolment is lost; admins then log in with password only).

Revision ID: 252
Revises: 251
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "252"
down_revision: Union[str, None] = "251"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("platform_admins", sa.Column("totp_secret", sa.String(length=128), nullable=True))
    op.add_column(
        "platform_admins",
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("platform_admins", sa.Column("totp_last_used_step", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("platform_admins", "totp_last_used_step")
    op.drop_column("platform_admins", "totp_enabled")
    op.drop_column("platform_admins", "totp_secret")
