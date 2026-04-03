"""Add preferred_currency to customers for quotation currency default.

Revision ID: 146
Revises: 145
Create Date: 2026-03-31
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "146"
down_revision: Union[str, None] = "145"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("customers")}
    if "preferred_currency" not in cols:
        op.add_column("customers", sa.Column("preferred_currency", sa.String(10), nullable=True))


def downgrade() -> None:
    try:
        op.drop_column("customers", "preferred_currency")
    except Exception:
        pass
