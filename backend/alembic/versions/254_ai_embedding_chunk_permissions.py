"""AI embedding chunks: store access control at indexing time.

Adds nullable ``permission_key`` and ``visibility`` to ``ai_embedding_chunks``. Retrieval filters on
them; rows indexed before this revision keep NULL and are checked against a permission derived from
their ``source_module`` at query time, so no backfill is needed.

Additive only. Downgrade drops both columns.

Revision ID: 254
Revises: 253
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "254"
down_revision: Union[str, None] = "253"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ai_embedding_chunks", sa.Column("permission_key", sa.String(length=128), nullable=True))
    op.add_column("ai_embedding_chunks", sa.Column("visibility", sa.String(length=24), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_embedding_chunks", "visibility")
    op.drop_column("ai_embedding_chunks", "permission_key")
