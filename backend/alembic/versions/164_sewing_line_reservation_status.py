"""Sewing line style config: reservation lifecycle + SMV columns.

Revision ID: 164
Revises: 163
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "164"
down_revision: Union[str, None] = "163"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sewing_line_style_configs",
        sa.Column("reservation_status", sa.String(length=24), nullable=False, server_default="FIRM_BOOKED"),
    )
    op.add_column("sewing_line_style_configs", sa.Column("soft_booked_at", sa.DateTime(), nullable=True))
    op.add_column("sewing_line_style_configs", sa.Column("firm_booked_at", sa.DateTime(), nullable=True))
    op.add_column("sewing_line_style_configs", sa.Column("smv_per_piece", sa.Numeric(10, 4), nullable=True))
    op.add_column("sewing_line_style_configs", sa.Column("total_smv_minutes", sa.Numeric(14, 2), nullable=True))
    op.create_index(
        "ix_slsc_tenant_line_dates",
        "sewing_line_style_configs",
        ["tenant_id", "line_id", "start_date", "planned_end_date"],
        unique=False,
    )
    op.create_index(
        "ix_sewing_line_style_configs_reservation_status",
        "sewing_line_style_configs",
        ["reservation_status"],
        unique=False,
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE sewing_line_style_configs slsc
            SET smv_per_piece = CASE
                WHEN slsc.planned_qty IS NOT NULL AND slsc.planned_qty > 0 AND ob.total_smv IS NOT NULL
                THEN ob.total_smv / slsc.planned_qty
                ELSE NULL
            END,
            total_smv_minutes = CASE
                WHEN slsc.planned_qty IS NOT NULL AND ob.total_smv IS NOT NULL
                THEN ob.total_smv
                ELSE NULL
            END
            FROM operation_bulletins ob
            WHERE slsc.ob_id = ob.id
              AND slsc.smv_per_piece IS NULL
            """
        )
    )
    op.alter_column("sewing_line_style_configs", "reservation_status", server_default=None)


def downgrade() -> None:
    op.drop_index(
        "ix_sewing_line_style_configs_reservation_status",
        table_name="sewing_line_style_configs",
    )
    op.drop_index("ix_slsc_tenant_line_dates", table_name="sewing_line_style_configs")
    op.drop_column("sewing_line_style_configs", "total_smv_minutes")
    op.drop_column("sewing_line_style_configs", "smv_per_piece")
    op.drop_column("sewing_line_style_configs", "firm_booked_at")
    op.drop_column("sewing_line_style_configs", "soft_booked_at")
    op.drop_column("sewing_line_style_configs", "reservation_status")
