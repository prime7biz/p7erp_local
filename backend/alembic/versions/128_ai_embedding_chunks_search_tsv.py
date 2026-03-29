"""Add full-text search_tsv to ai_embedding_chunks for hybrid BM25 retrieval.

Revision ID: 128
Revises: 127
Create Date: 2026-03-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "128"
down_revision: Union[str, None] = "127"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            ALTER TABLE ai_embedding_chunks
            ADD COLUMN IF NOT EXISTS search_tsv tsvector
            GENERATED ALWAYS AS (to_tsvector('english', coalesce(content_text, ''))) STORED
            """
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_ai_embedding_chunks_search_tsv "
            "ON ai_embedding_chunks USING gin (search_tsv)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_ai_embedding_chunks_search_tsv"))
    op.drop_column("ai_embedding_chunks", "search_tsv")
