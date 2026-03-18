"""Add code counters and one-to-one conversion guards.

Revision ID: 070
Revises: 069
Create Date: 2026-03-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "070"
down_revision: Union[str, None] = "069"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove duplicate quotations: keep one row per (tenant_id, inquiry_id) where inquiry_id IS NOT NULL (keep smallest id).
    op.execute("""
        DELETE FROM quotations a
        USING quotations b
        WHERE a.tenant_id = b.tenant_id AND a.inquiry_id = b.inquiry_id
          AND a.inquiry_id IS NOT NULL
          AND a.id > b.id
    """)
    # Remove duplicate orders: keep one row per (tenant_id, quotation_id) where quotation_id IS NOT NULL (keep smallest id).
    op.execute("""
        DELETE FROM orders a
        USING orders b
        WHERE a.tenant_id = b.tenant_id AND a.quotation_id = b.quotation_id
          AND a.quotation_id IS NOT NULL
          AND a.id > b.id
    """)

    op.create_table(
        "tenant_code_counters",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("entity_key", sa.String(length=128), nullable=False),
        sa.Column("last_value", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "entity_key", name="uq_tenant_code_counter_tenant_entity"),
    )
    op.create_index(
        "ix_tenant_code_counters_tenant_id",
        "tenant_code_counters",
        ["tenant_id"],
        unique=False,
    )

    op.create_index(
        "uq_quotations_tenant_inquiry_id",
        "quotations",
        ["tenant_id", "inquiry_id"],
        unique=True,
        postgresql_where=sa.text("inquiry_id IS NOT NULL"),
    )
    op.create_index(
        "uq_orders_tenant_quotation_id",
        "orders",
        ["tenant_id", "quotation_id"],
        unique=True,
        postgresql_where=sa.text("quotation_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_orders_tenant_quotation_id", table_name="orders")
    op.drop_index("uq_quotations_tenant_inquiry_id", table_name="quotations")
    op.drop_index("ix_tenant_code_counters_tenant_id", table_name="tenant_code_counters")
    op.drop_table("tenant_code_counters")
