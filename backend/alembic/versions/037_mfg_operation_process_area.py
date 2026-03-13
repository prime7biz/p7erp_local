"""Add process area to manufacturing operations

Revision ID: 037
Revises: 036
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "037"
down_revision: Union[str, None] = "036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mfg_operations",
        sa.Column("process_area", sa.String(length=32), nullable=False, server_default="general"),
    )
    op.create_index("ix_mfg_operations_process_area", "mfg_operations", ["process_area"])

    # Lightweight backfill so existing operation masters become area-aware quickly.
    op.execute(
        """
        UPDATE mfg_operations
        SET process_area = CASE
            WHEN lower(name) LIKE '%cut%' THEN 'cutting'
            WHEN lower(name) LIKE '%sew%' OR lower(name) LIKE '%stitch%' THEN 'sewing'
            WHEN lower(name) LIKE '%finish%' OR lower(name) LIKE '%pack%' OR lower(name) LIKE '%wash%' THEN 'finishing'
            ELSE 'general'
        END
        """
    )


def downgrade() -> None:
    op.drop_index("ix_mfg_operations_process_area", table_name="mfg_operations")
    op.drop_column("mfg_operations", "process_area")
