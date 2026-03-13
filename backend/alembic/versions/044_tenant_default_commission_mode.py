"""Add tenant default commission mode.

Revision ID: 044
Revises: 043
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "044"
down_revision: Union[str, None] = "043"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    commission_mode_enum = sa.Enum("INCLUDE", "EXCLUDE", name="commissionmode")
    commission_mode_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "tenants",
        sa.Column(
            "default_commission_mode",
            commission_mode_enum,
            nullable=True,
            server_default=sa.text("'EXCLUDE'"),
        ),
    )
    op.execute(
        """
        UPDATE tenants
        SET default_commission_mode = 'EXCLUDE'
        WHERE default_commission_mode IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("tenants", "default_commission_mode")
    commission_mode_enum = sa.Enum("INCLUDE", "EXCLUDE", name="commissionmode")
    commission_mode_enum.drop(op.get_bind(), checkfirst=True)
