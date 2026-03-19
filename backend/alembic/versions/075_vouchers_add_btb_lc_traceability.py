"""Add BTB LC traceability field on vouchers.

Revision ID: 075
Revises: 074
Create Date: 2026-03-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "075"
down_revision: Union[str, None] = "074"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vouchers", sa.Column("btb_lc_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_vouchers_btb_lc_id",
        "vouchers",
        "btb_lcs",
        ["btb_lc_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_vouchers_btb_lc_id", "vouchers", ["btb_lc_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_vouchers_btb_lc_id", table_name="vouchers")
    op.drop_constraint("fk_vouchers_btb_lc_id", "vouchers", type_="foreignkey")
    op.drop_column("vouchers", "btb_lc_id")
