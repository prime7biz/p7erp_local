"""Master contract: LC bank-document fields.

Revision ID: 163
Revises: 162
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "163"
down_revision: Union[str, None] = "162"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("master_contracts", sa.Column("lc_number", sa.String(length=64), nullable=True))
    op.add_column("master_contracts", sa.Column("advising_bank", sa.String(length=255), nullable=True))
    op.add_column("master_contracts", sa.Column("advised_at", sa.DateTime(), nullable=True))
    op.create_index("ix_master_contracts_lc_number", "master_contracts", ["lc_number"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_master_contracts_lc_number", table_name="master_contracts")
    op.drop_column("master_contracts", "advised_at")
    op.drop_column("master_contracts", "advising_bank")
    op.drop_column("master_contracts", "lc_number")
