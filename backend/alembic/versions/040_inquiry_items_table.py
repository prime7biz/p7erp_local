"""Add inquiry items table for inquiry form

Revision ID: 040
Revises: 039
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "040"
down_revision: Union[str, None] = "039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inquiry_items",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("inquiry_id", sa.Integer(), nullable=False),
        sa.Column("item_name", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_inquiry_items_tenant_id", "inquiry_items", ["tenant_id"], unique=False)
    op.create_index("ix_inquiry_items_inquiry_id", "inquiry_items", ["inquiry_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_inquiry_items_inquiry_id", table_name="inquiry_items")
    op.drop_index("ix_inquiry_items_tenant_id", table_name="inquiry_items")
    op.drop_table("inquiry_items")
