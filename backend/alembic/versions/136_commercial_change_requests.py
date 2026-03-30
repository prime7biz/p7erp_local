"""Commercial change requests for order/quotation commercial fields.

Revision ID: 136
Revises: 135
Create Date: 2026-03-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "136"
down_revision: Union[str, None] = "135"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "commercial_change_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("field_key", sa.String(length=64), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("source_ref", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending_approval"),
        sa.Column("proposed_by", sa.Integer(), nullable=True),
        sa.Column("proposed_at", sa.DateTime(), nullable=False),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("applied_by", sa.Integer(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("meta_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["applied_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["proposed_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_commercial_change_requests_tenant_id", "commercial_change_requests", ["tenant_id"])
    op.create_index("ix_commercial_change_requests_entity_type", "commercial_change_requests", ["entity_type"])
    op.create_index("ix_commercial_change_requests_entity_id", "commercial_change_requests", ["entity_id"])
    op.create_index("ix_commercial_change_requests_status", "commercial_change_requests", ["status"])
    op.create_index(
        "ix_commercial_change_requests_tenant_entity",
        "commercial_change_requests",
        ["tenant_id", "entity_type", "entity_id"],
    )
    op.create_index("ix_commercial_change_requests_request_id", "commercial_change_requests", ["request_id"])
    op.create_index("ix_commercial_change_requests_proposed_by", "commercial_change_requests", ["proposed_by"])


def downgrade() -> None:
    op.drop_index("ix_commercial_change_requests_proposed_by", table_name="commercial_change_requests")
    op.drop_index("ix_commercial_change_requests_request_id", table_name="commercial_change_requests")
    op.drop_index("ix_commercial_change_requests_tenant_entity", table_name="commercial_change_requests")
    op.drop_index("ix_commercial_change_requests_status", table_name="commercial_change_requests")
    op.drop_index("ix_commercial_change_requests_entity_id", table_name="commercial_change_requests")
    op.drop_index("ix_commercial_change_requests_entity_type", table_name="commercial_change_requests")
    op.drop_index("ix_commercial_change_requests_tenant_id", table_name="commercial_change_requests")
    op.drop_table("commercial_change_requests")
