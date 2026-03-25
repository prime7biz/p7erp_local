"""Ensure platform_plans has entitlements columns (repair drift vs revision 122).

Revision ID: 123
Revises: 122
Create Date: 2026-03-26

Adds support_level, optional_addons, and overage_rules to platform_plans when they
are missing (e.g. DB restored without columns, or revision 122 not applied). Safe
to run when columns already exist from 122.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "123"
down_revision: Union[str, None] = "122"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing = {c["name"] for c in insp.get_columns("platform_plans")}

    if "support_level" not in existing:
        op.add_column(
            "platform_plans",
            sa.Column(
                "support_level",
                sa.String(length=32),
                nullable=False,
                server_default="standard",
            ),
        )
    if "optional_addons" not in existing:
        op.add_column(
            "platform_plans",
            sa.Column("optional_addons", sa.JSON(), nullable=True),
        )
    if "overage_rules" not in existing:
        op.add_column(
            "platform_plans",
            sa.Column("overage_rules", sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    # No-op: same columns are created in revision 122; dropping here would remove
    # live data for databases that applied 122 before this repair migration.
    pass
