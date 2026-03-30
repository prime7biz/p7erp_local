"""Quotation costing suggestion batches (Phase 2 review mode).

Revision ID: 138
Revises: 137
Create Date: 2026-03-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "138"
down_revision: Union[str, None] = "137"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quotation_costing_suggestion_batches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("quotation_id", sa.Integer(), nullable=True),
        sa.Column("action_type", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("model_hint", sa.String(length=128), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("generated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.String(length=32), nullable=False, server_default="deterministic"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="generated"),
        sa.Column("meta_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quotation_id"], ["quotations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["generated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_quotation_costing_suggestion_batches_tenant_id",
        "quotation_costing_suggestion_batches",
        ["tenant_id"],
    )
    op.create_index(
        "ix_quotation_costing_suggestion_batches_quotation_id",
        "quotation_costing_suggestion_batches",
        ["quotation_id"],
    )
    op.create_index(
        "ix_quotation_costing_suggestion_batches_status",
        "quotation_costing_suggestion_batches",
        ["status"],
    )
    op.create_index(
        "ix_quotation_costing_suggestion_batches_expires_at",
        "quotation_costing_suggestion_batches",
        ["expires_at"],
    )

    op.create_table(
        "quotation_costing_suggestion_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_category", sa.String(length=32), nullable=False),
        sa.Column("target_line_id", sa.Integer(), nullable=True),
        sa.Column("suggestion_type", sa.String(length=32), nullable=False),
        sa.Column("field_changes_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("reason_code", sa.String(length=64), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("source_mode", sa.String(length=32), nullable=False, server_default="deterministic_only"),
        sa.Column("disposition", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("before_snapshot_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["batch_id"], ["quotation_costing_suggestion_batches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "ordinal", name="uq_quotation_costing_suggestion_item_batch_ordinal"),
    )
    op.create_index(
        "ix_quotation_costing_suggestion_items_batch_id",
        "quotation_costing_suggestion_items",
        ["batch_id"],
    )
    op.create_index(
        "ix_quotation_costing_suggestion_items_tenant_id",
        "quotation_costing_suggestion_items",
        ["tenant_id"],
    )
    op.create_index(
        "ix_quotation_costing_suggestion_items_disposition",
        "quotation_costing_suggestion_items",
        ["disposition"],
    )


def downgrade() -> None:
    op.drop_index("ix_quotation_costing_suggestion_items_disposition", table_name="quotation_costing_suggestion_items")
    op.drop_index("ix_quotation_costing_suggestion_items_tenant_id", table_name="quotation_costing_suggestion_items")
    op.drop_index("ix_quotation_costing_suggestion_items_batch_id", table_name="quotation_costing_suggestion_items")
    op.drop_table("quotation_costing_suggestion_items")
    op.drop_index("ix_quotation_costing_suggestion_batches_expires_at", table_name="quotation_costing_suggestion_batches")
    op.drop_index("ix_quotation_costing_suggestion_batches_status", table_name="quotation_costing_suggestion_batches")
    op.drop_index("ix_quotation_costing_suggestion_batches_quotation_id", table_name="quotation_costing_suggestion_batches")
    op.drop_index("ix_quotation_costing_suggestion_batches_tenant_id", table_name="quotation_costing_suggestion_batches")
    op.drop_table("quotation_costing_suggestion_batches")
