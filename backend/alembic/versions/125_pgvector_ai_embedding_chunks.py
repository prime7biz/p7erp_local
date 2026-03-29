"""pgvector extension and ai_embedding_chunks for semantic RAG.

Revision ID: 125
Revises: 124
Create Date: 2026-03-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


revision: str = "125"
down_revision: Union[str, None] = "124"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
    op.create_table(
        "ai_embedding_chunks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(64), nullable=False),
        sa.Column("source_ref", sa.String(255), nullable=False),
        sa.Column("source_module", sa.String(64), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content_text", sa.Text(), nullable=False),
        sa.Column("heading", sa.String(255), nullable=True),
        sa.Column("embedding", Vector(384), nullable=False),
        sa.Column("document_type", sa.String(64), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("style_id", sa.Integer(), nullable=True),
        sa.Column("date_reference", sa.Date(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("embedding_model", sa.String(128), nullable=False, server_default="all-MiniLM-L6-v2"),
        sa.Column("is_stale", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("indexed_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("source_updated_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "source_type",
            "source_ref",
            "chunk_index",
            name="uq_ai_embedding_chunks_tenant_source_chunk",
        ),
    )
    op.create_index("ix_ai_embedding_chunks_tenant_id", "ai_embedding_chunks", ["tenant_id"])
    op.create_index("ix_ai_embedding_chunks_source_type", "ai_embedding_chunks", ["source_type"])
    op.create_index("ix_ai_embedding_chunks_source_ref", "ai_embedding_chunks", ["source_ref"])
    op.create_index("ix_ai_embedding_chunks_source_module", "ai_embedding_chunks", ["source_module"])
    op.create_index("ix_ai_embedding_chunks_document_type", "ai_embedding_chunks", ["document_type"])
    op.create_index("ix_ai_embedding_chunks_order_id", "ai_embedding_chunks", ["order_id"])
    op.create_index("ix_ai_embedding_chunks_style_id", "ai_embedding_chunks", ["style_id"])
    op.create_index("ix_ai_embedding_chunks_date_reference", "ai_embedding_chunks", ["date_reference"])
    op.create_index("ix_ai_embedding_chunks_is_stale", "ai_embedding_chunks", ["is_stale"])
    op.create_index("ix_ai_embedding_chunks_created_at", "ai_embedding_chunks", ["created_at"])
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_ai_embedding_chunks_embedding "
            "ON ai_embedding_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_ai_embedding_chunks_tenant_module_active "
            "ON ai_embedding_chunks (tenant_id, source_module) WHERE is_stale = false"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_ai_embedding_chunks_tenant_module_active"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_ai_embedding_chunks_embedding"))
    op.drop_table("ai_embedding_chunks")
