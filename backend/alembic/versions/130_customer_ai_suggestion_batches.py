"""Customer AI suggestion batches and items for apply traceability.

Revision ID: 130
Revises: 129
Create Date: 2026-03-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "130"
down_revision: Union[str, None] = "129"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "customer_ai_suggestion_batches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=True),
        sa.Column("action_type", sa.String(32), nullable=False),
        sa.Column("provider", sa.String(64), nullable=True),
        sa.Column("model_hint", sa.String(128), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("generated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.String(32), nullable=False, server_default="document"),
        sa.Column("status", sa.String(32), nullable=False, server_default="generated"),
        sa.Column("meta_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["generated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_customer_ai_suggestion_batches_tenant_id", "customer_ai_suggestion_batches", ["tenant_id"])
    op.create_index("ix_customer_ai_suggestion_batches_customer_id", "customer_ai_suggestion_batches", ["customer_id"])
    op.create_index("ix_customer_ai_suggestion_batches_request_id", "customer_ai_suggestion_batches", ["request_id"])
    op.create_index("ix_customer_ai_suggestion_batches_action_type", "customer_ai_suggestion_batches", ["action_type"])
    op.create_index("ix_customer_ai_suggestion_batches_status", "customer_ai_suggestion_batches", ["status"])
    op.create_index("ix_customer_ai_suggestion_batches_expires_at", "customer_ai_suggestion_batches", ["expires_at"])

    op.create_table(
        "customer_ai_suggestion_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("field_key", sa.String(64), nullable=False),
        sa.Column("suggested_value", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("source", sa.String(64), nullable=True),
        sa.Column("rationale", sa.String(512), nullable=True),
        sa.Column("disposition", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("before_value_snapshot", sa.String(1024), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["customer_ai_suggestion_batches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "field_key", name="uq_customer_ai_suggestion_item_batch_field"),
    )
    op.create_index("ix_customer_ai_suggestion_items_batch_id", "customer_ai_suggestion_items", ["batch_id"])
    op.create_index("ix_customer_ai_suggestion_items_tenant_id", "customer_ai_suggestion_items", ["tenant_id"])
    op.create_index("ix_customer_ai_suggestion_items_disposition", "customer_ai_suggestion_items", ["disposition"])


def downgrade() -> None:
    op.drop_index("ix_customer_ai_suggestion_items_disposition", table_name="customer_ai_suggestion_items")
    op.drop_index("ix_customer_ai_suggestion_items_tenant_id", table_name="customer_ai_suggestion_items")
    op.drop_index("ix_customer_ai_suggestion_items_batch_id", table_name="customer_ai_suggestion_items")
    op.drop_table("customer_ai_suggestion_items")
    op.drop_index("ix_customer_ai_suggestion_batches_expires_at", table_name="customer_ai_suggestion_batches")
    op.drop_index("ix_customer_ai_suggestion_batches_status", table_name="customer_ai_suggestion_batches")
    op.drop_index("ix_customer_ai_suggestion_batches_action_type", table_name="customer_ai_suggestion_batches")
    op.drop_index("ix_customer_ai_suggestion_batches_request_id", table_name="customer_ai_suggestion_batches")
    op.drop_index("ix_customer_ai_suggestion_batches_customer_id", table_name="customer_ai_suggestion_batches")
    op.drop_index("ix_customer_ai_suggestion_batches_tenant_id", table_name="customer_ai_suggestion_batches")
    op.drop_table("customer_ai_suggestion_batches")
