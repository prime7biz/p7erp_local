"""Add accounting periods table

Revision ID: 016
Revises: 015
Create Date: 2026-03-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "accounting_periods",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("period_name", sa.String(length=64), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("is_closed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("closed_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["closed_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_accounting_periods_tenant_id", "accounting_periods", ["tenant_id"])
    op.create_index("ix_accounting_periods_is_closed", "accounting_periods", ["is_closed"])
    op.create_index("ix_accounting_periods_closed_by", "accounting_periods", ["closed_by"])


def downgrade() -> None:
    op.drop_index("ix_accounting_periods_closed_by", table_name="accounting_periods")
    op.drop_index("ix_accounting_periods_is_closed", table_name="accounting_periods")
    op.drop_index("ix_accounting_periods_tenant_id", table_name="accounting_periods")
    op.drop_table("accounting_periods")
