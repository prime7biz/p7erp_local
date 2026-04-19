"""Alert instance: structured evidence_json for merch alerts.

Revision ID: 173
Revises: 172
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "173"
down_revision: Union[str, None] = "172"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "alert_instance",
        sa.Column("evidence_json", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("alert_instance", "evidence_json")
