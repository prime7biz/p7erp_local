"""Add voucher types table

Revision ID: 020
Revises: 019
Create Date: 2026-03-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "voucher_types",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_voucher_types_tenant_id", "voucher_types", ["tenant_id"])
    op.create_index("ix_voucher_types_code", "voucher_types", ["code"])
    op.create_index("ix_voucher_types_is_active", "voucher_types", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_voucher_types_is_active", table_name="voucher_types")
    op.drop_index("ix_voucher_types_code", table_name="voucher_types")
    op.drop_index("ix_voucher_types_tenant_id", table_name="voucher_types")
    op.drop_table("voucher_types")
