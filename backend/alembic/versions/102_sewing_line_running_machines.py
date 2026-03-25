"""Add running_machine_count and default_helper_count to sewing_lines.

running_machine_count tracks how many machines are actually operational
on a given line — critical for SMV, production targets and real-time CM.

Revision ID: 102
Revises: 101
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "102"
down_revision: Union[str, None] = "101"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sewing_lines",
        sa.Column("running_machine_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "sewing_lines",
        sa.Column("default_helper_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("sewing_lines", "default_helper_count")
    op.drop_column("sewing_lines", "running_machine_count")
