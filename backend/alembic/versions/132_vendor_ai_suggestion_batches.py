"""Vendor AI suggestion batches (supplier master on Vendor model).

Revision ID: 132
Revises: 131
Create Date: 2026-03-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "132"
down_revision: Union[str, None] = "131"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendor_ai_suggestion_batches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=True),
        sa.Column("action_type", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("model_hint", sa.String(length=128), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("generated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.String(length=32), nullable=False, server_default="document"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="generated"),
        sa.Column("meta_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["generated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vendor_ai_suggestion_batches_tenant_id", "vendor_ai_suggestion_batches", ["tenant_id"])
    op.create_index("ix_vendor_ai_suggestion_batches_vendor_id", "vendor_ai_suggestion_batches", ["vendor_id"])
    op.create_index("ix_vendor_ai_suggestion_batches_action_type", "vendor_ai_suggestion_batches", ["action_type"])
    op.create_index("ix_vendor_ai_suggestion_batches_request_id", "vendor_ai_suggestion_batches", ["request_id"])
    op.create_index("ix_vendor_ai_suggestion_batches_status", "vendor_ai_suggestion_batches", ["status"])
    op.create_index("ix_vendor_ai_suggestion_batches_expires_at", "vendor_ai_suggestion_batches", ["expires_at"])

    op.create_table(
        "vendor_ai_suggestion_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("field_key", sa.String(length=64), nullable=False),
        sa.Column("suggested_value", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column("rationale", sa.String(length=512), nullable=True),
        sa.Column("disposition", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("before_value_snapshot", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["batch_id"], ["vendor_ai_suggestion_batches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "field_key", name="uq_vendor_ai_suggestion_item_batch_field"),
    )
    op.create_index("ix_vendor_ai_suggestion_items_batch_id", "vendor_ai_suggestion_items", ["batch_id"])
    op.create_index("ix_vendor_ai_suggestion_items_tenant_id", "vendor_ai_suggestion_items", ["tenant_id"])
    op.create_index("ix_vendor_ai_suggestion_items_disposition", "vendor_ai_suggestion_items", ["disposition"])


def downgrade() -> None:
    op.drop_index("ix_vendor_ai_suggestion_items_disposition", table_name="vendor_ai_suggestion_items")
    op.drop_index("ix_vendor_ai_suggestion_items_tenant_id", table_name="vendor_ai_suggestion_items")
    op.drop_index("ix_vendor_ai_suggestion_items_batch_id", table_name="vendor_ai_suggestion_items")
    op.drop_table("vendor_ai_suggestion_items")
    op.drop_index("ix_vendor_ai_suggestion_batches_expires_at", table_name="vendor_ai_suggestion_batches")
    op.drop_index("ix_vendor_ai_suggestion_batches_status", table_name="vendor_ai_suggestion_batches")
    op.drop_index("ix_vendor_ai_suggestion_batches_request_id", table_name="vendor_ai_suggestion_batches")
    op.drop_index("ix_vendor_ai_suggestion_batches_action_type", table_name="vendor_ai_suggestion_batches")
    op.drop_index("ix_vendor_ai_suggestion_batches_vendor_id", table_name="vendor_ai_suggestion_batches")
    op.drop_index("ix_vendor_ai_suggestion_batches_tenant_id", table_name="vendor_ai_suggestion_batches")
    op.drop_table("vendor_ai_suggestion_batches")
