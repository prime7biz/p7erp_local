"""Deduplicate and enforce alert natural-key uniqueness.

Revision ID: 071
Revises: 070
Create Date: 2026-03-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "071"
down_revision: Union[str, None] = "070"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM alert_instance ai
            USING (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY tenant_id, natural_key
                            ORDER BY updated_at DESC NULLS LAST, id DESC
                        ) AS rn
                    FROM alert_instance
                ) ranked
                WHERE ranked.rn > 1
            ) dups
            WHERE ai.id = dups.id
            """
        )
    )
    # Create unique index only if it does not exist (idempotent for partially applied migrations).
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_instance_tenant_natural_key "
        "ON alert_instance (tenant_id, natural_key)"
    )


def downgrade() -> None:
    op.drop_index("uq_alert_instance_tenant_natural_key", table_name="alert_instance")
