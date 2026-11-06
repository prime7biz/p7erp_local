"""Staff invitations: indexed token selector.

New invitation tokens look like ``<selector>.<verifier>``. The selector is stored in plain text
(unique index) so accepting an invite looks up exactly one row; only the verifier is checked with
bcrypt. Existing invitations keep ``token_selector = NULL`` and still work until they expire.

Additive only (nullable column + unique index). Downgrade drops both; tokens issued after the
upgrade then stop working (they would need to be re-sent).

Revision ID: 251
Revises: 250
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "251"
down_revision: Union[str, None] = "250"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("staff_invitations", sa.Column("token_selector", sa.String(length=32), nullable=True))
    op.create_index(
        "uq_staff_invitations_token_selector",
        "staff_invitations",
        ["token_selector"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_staff_invitations_token_selector", table_name="staff_invitations")
    op.drop_column("staff_invitations", "token_selector")
