"""Merchandising sample / tech-pack MVP tables (Phase 6).

Revision ID: 171
Revises: 170
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "171"
down_revision: Union[str, None] = "170"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "merch_sample_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("style_id", sa.Integer(), nullable=False),
        sa.Column("inquiry_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("sample_code", sa.String(length=32), nullable=False),
        sa.Column("sample_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="requested"),
        sa.Column("revision_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("actual_date", sa.Date(), nullable=True),
        sa.Column("assigned_to_id", sa.Integer(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "sample_code", name="uq_merch_sample_requests_tenant_code"),
    )
    op.create_index("ix_merch_sample_requests_tenant_id", "merch_sample_requests", ["tenant_id"])
    op.create_index("ix_merch_sample_requests_style_id", "merch_sample_requests", ["style_id"])
    op.create_index("ix_merch_sample_requests_order_id", "merch_sample_requests", ["order_id"])
    op.create_index("ix_merch_sample_requests_status", "merch_sample_requests", ["status"])

    op.create_table(
        "merch_sample_comments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("sample_request_id", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("attachment_url", sa.String(length=512), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sample_request_id"], ["merch_sample_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_merch_sample_comments_tenant_id", "merch_sample_comments", ["tenant_id"])
    op.create_index(
        "ix_merch_sample_comments_sample_request_id",
        "merch_sample_comments",
        ["sample_request_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_merch_sample_comments_sample_request_id", table_name="merch_sample_comments")
    op.drop_index("ix_merch_sample_comments_tenant_id", table_name="merch_sample_comments")
    op.drop_table("merch_sample_comments")
    op.drop_index("ix_merch_sample_requests_status", table_name="merch_sample_requests")
    op.drop_index("ix_merch_sample_requests_order_id", table_name="merch_sample_requests")
    op.drop_index("ix_merch_sample_requests_style_id", table_name="merch_sample_requests")
    op.drop_index("ix_merch_sample_requests_tenant_id", table_name="merch_sample_requests")
    op.drop_table("merch_sample_requests")
