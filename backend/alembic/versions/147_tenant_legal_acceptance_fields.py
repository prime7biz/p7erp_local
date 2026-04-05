"""Add tenant legal acceptance audit fields.

Revision ID: 147
Revises: 146
Create Date: 2026-04-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "147"
down_revision: Union[str, None] = "146"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("tenants")}
    if "legal_acceptance_version" not in cols:
        op.add_column("tenants", sa.Column("legal_acceptance_version", sa.String(length=64), nullable=True))
    if "legal_accepted_at" not in cols:
        op.add_column("tenants", sa.Column("legal_accepted_at", sa.DateTime(), nullable=True))
    if "legal_accepted_by_email" not in cols:
        op.add_column("tenants", sa.Column("legal_accepted_by_email", sa.String(length=255), nullable=True))


def downgrade() -> None:
    for column in ("legal_accepted_by_email", "legal_accepted_at", "legal_acceptance_version"):
        try:
            op.drop_column("tenants", column)
        except Exception:
            pass
