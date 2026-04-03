"""Add DB timestamp defaults to AI suggestion batch tables.

Revision ID: 144
Revises: 143
Create Date: 2026-03-31
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "144"
down_revision: Union[str, None] = "143"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES = (
    "customer_ai_suggestion_batches",
    "customer_ai_suggestion_items",
    "vendor_ai_suggestion_batches",
    "vendor_ai_suggestion_items",
    "inquiry_ai_suggestion_batches",
    "inquiry_ai_suggestion_items",
    "quotation_ai_suggestion_batches",
    "quotation_ai_suggestion_items",
    "order_ai_suggestion_batches",
    "order_ai_suggestion_items",
)


def upgrade() -> None:
    for table_name in _TABLES:
        op.alter_column(
            table_name,
            "created_at",
            existing_type=sa.DateTime(),
            existing_nullable=False,
            server_default=sa.text("now()"),
        )
        op.alter_column(
            table_name,
            "updated_at",
            existing_type=sa.DateTime(),
            existing_nullable=False,
            server_default=sa.text("now()"),
        )


def downgrade() -> None:
    for table_name in _TABLES:
        op.alter_column(
            table_name,
            "updated_at",
            existing_type=sa.DateTime(),
            existing_nullable=False,
            server_default=None,
        )
        op.alter_column(
            table_name,
            "created_at",
            existing_type=sa.DateTime(),
            existing_nullable=False,
            server_default=None,
        )
