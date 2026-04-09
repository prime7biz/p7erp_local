"""Add verification_id/signature_hash/signed_at for inventory printable documents (QR verify).

Revision ID: 159
Revises: 158
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "159"
down_revision: Union[str, None] = "158"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = (
    "delivery_challans",
    "enhanced_gate_passes",
    "goods_receiving",
    "production_material_issues",
    "process_orders",
    "warehouse_transfers",
)


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("verification_id", sa.String(length=64), nullable=True))
        op.add_column(table, sa.Column("signature_hash", sa.String(length=128), nullable=True))
        op.add_column(table, sa.Column("signed_at", sa.DateTime(), nullable=True))
        op.create_index(
            f"ix_{table}_verification_id",
            table,
            ["verification_id"],
            unique=True,
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_index(f"ix_{table}_verification_id", table_name=table)
        op.drop_column(table, "signed_at")
        op.drop_column(table, "signature_hash")
        op.drop_column(table, "verification_id")
