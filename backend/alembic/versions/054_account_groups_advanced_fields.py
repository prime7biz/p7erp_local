"""Add advanced fields to account_groups for COA redesign

Revision ID: 054
Revises: 053
Create Date: 2026-03-13

Adds: description, reporting_code, default_normal_balance, allow_posting,
is_summary_group, last_reviewed_at per docs/ACCOUNT_GROUP_REDESIGN.md.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "054"
down_revision: Union[str, None] = "053"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("account_groups", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("account_groups", sa.Column("reporting_code", sa.String(length=32), nullable=True))
    op.add_column(
        "account_groups",
        sa.Column("default_normal_balance", sa.String(length=16), nullable=False, server_default="debit"),
    )
    op.add_column(
        "account_groups",
        sa.Column("allow_posting", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "account_groups",
        sa.Column("is_summary_group", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("account_groups", sa.Column("last_reviewed_at", sa.Date(), nullable=True))
    op.create_index("ix_account_groups_reporting_code", "account_groups", ["reporting_code"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_account_groups_reporting_code", table_name="account_groups")
    op.drop_column("account_groups", "last_reviewed_at")
    op.drop_column("account_groups", "is_summary_group")
    op.drop_column("account_groups", "allow_posting")
    op.drop_column("account_groups", "default_normal_balance")
    op.drop_column("account_groups", "reporting_code")
    op.drop_column("account_groups", "description")
