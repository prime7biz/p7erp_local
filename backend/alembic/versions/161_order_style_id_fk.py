"""Order.style_id FK to garment_styles + backfill + composite indexes.

Revision ID: 161
Revises: 160
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "161"
down_revision: Union[str, None] = "160"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("style_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_orders_style_id_garment_styles",
        "orders",
        "garment_styles",
        ["style_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_orders_tenant_style_id", "orders", ["tenant_id", "style_id"], unique=False)
    op.create_index(
        "ix_orders_tenant_delivery_pipeline",
        "orders",
        ["tenant_id", "delivery_date", "pipeline_status"],
        unique=False,
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE orders o
            SET style_id = q.style_id
            FROM quotations q
            WHERE o.quotation_id = q.id
              AND o.style_id IS NULL
              AND q.style_id IS NOT NULL
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE orders o
            SET style_id = gs.id
            FROM garment_styles gs
            WHERE o.style_id IS NULL
              AND o.style_ref IS NOT NULL
              AND TRIM(o.style_ref) <> ''
              AND gs.tenant_id = o.tenant_id
              AND LOWER(TRIM(gs.style_code)) = LOWER(TRIM(o.style_ref))
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_orders_tenant_delivery_pipeline", table_name="orders")
    op.drop_index("ix_orders_tenant_style_id", table_name="orders")
    op.drop_constraint("fk_orders_style_id_garment_styles", "orders", type_="foreignkey")
    op.drop_column("orders", "style_id")
