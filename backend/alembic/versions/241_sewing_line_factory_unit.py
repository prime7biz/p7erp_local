"""Optional factory unit on sewing lines (multi-factory planning board).

Revision ID: 241
Revises: 240
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "241"
down_revision: Union[str, None] = "240"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sewing_lines", sa.Column("factory_unit", sa.String(64), nullable=True))
    op.create_index("ix_sewing_lines_factory_unit", "sewing_lines", ["factory_unit"])


def downgrade() -> None:
    op.drop_index("ix_sewing_lines_factory_unit", table_name="sewing_lines")
    op.drop_column("sewing_lines", "factory_unit")
