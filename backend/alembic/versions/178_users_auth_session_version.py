"""Add users.auth_session_version for single-session enforcement.

Revision ID: 178
Revises: 177
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "178"
down_revision: Union[str, None] = "177"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "auth_session_version",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "auth_session_version")
