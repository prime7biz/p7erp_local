"""Add AI knowledge retrieval tables for phase 5.

Revision ID: 048
Revises: 047
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "048"
down_revision: Union[str, None] = "047"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_knowledge_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("document_code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("doc_type", sa.String(length=64), nullable=False),
        sa.Column("source_area", sa.String(length=64), nullable=False, server_default=sa.text("'knowledge'")),
        sa.Column("owner_scope", sa.String(length=16), nullable=False, server_default=sa.text("'global'")),
        sa.Column("visibility", sa.String(length=24), nullable=False, server_default=sa.text("'public'")),
        sa.Column("permission_key", sa.String(length=128), nullable=True),
        sa.Column("version_tag", sa.String(length=64), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "document_code", name="uq_ai_knowledge_documents_tenant_doc_code"),
    )
    op.create_index("ix_ai_knowledge_documents_tenant_id", "ai_knowledge_documents", ["tenant_id"], unique=False)
    op.create_index("ix_ai_knowledge_documents_document_code", "ai_knowledge_documents", ["document_code"], unique=False)
    op.create_index("ix_ai_knowledge_documents_doc_type", "ai_knowledge_documents", ["doc_type"], unique=False)
    op.create_index("ix_ai_knowledge_documents_owner_scope", "ai_knowledge_documents", ["owner_scope"], unique=False)
    op.create_index("ix_ai_knowledge_documents_visibility", "ai_knowledge_documents", ["visibility"], unique=False)
    op.create_index("ix_ai_knowledge_documents_is_active", "ai_knowledge_documents", ["is_active"], unique=False)
    op.create_index("ix_ai_knowledge_documents_created_at", "ai_knowledge_documents", ["created_at"], unique=False)

    op.create_table(
        "ai_knowledge_chunks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("heading", sa.String(length=255), nullable=True),
        sa.Column("content_text", sa.Text(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["document_id"], ["ai_knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "chunk_index", name="uq_ai_knowledge_chunks_document_chunk"),
    )
    op.create_index("ix_ai_knowledge_chunks_tenant_id", "ai_knowledge_chunks", ["tenant_id"], unique=False)
    op.create_index("ix_ai_knowledge_chunks_document_id", "ai_knowledge_chunks", ["document_id"], unique=False)
    op.create_index("ix_ai_knowledge_chunks_created_at", "ai_knowledge_chunks", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_knowledge_chunks_created_at", table_name="ai_knowledge_chunks")
    op.drop_index("ix_ai_knowledge_chunks_document_id", table_name="ai_knowledge_chunks")
    op.drop_index("ix_ai_knowledge_chunks_tenant_id", table_name="ai_knowledge_chunks")
    op.drop_table("ai_knowledge_chunks")

    op.drop_index("ix_ai_knowledge_documents_created_at", table_name="ai_knowledge_documents")
    op.drop_index("ix_ai_knowledge_documents_is_active", table_name="ai_knowledge_documents")
    op.drop_index("ix_ai_knowledge_documents_visibility", table_name="ai_knowledge_documents")
    op.drop_index("ix_ai_knowledge_documents_owner_scope", table_name="ai_knowledge_documents")
    op.drop_index("ix_ai_knowledge_documents_doc_type", table_name="ai_knowledge_documents")
    op.drop_index("ix_ai_knowledge_documents_document_code", table_name="ai_knowledge_documents")
    op.drop_index("ix_ai_knowledge_documents_tenant_id", table_name="ai_knowledge_documents")
    op.drop_table("ai_knowledge_documents")
