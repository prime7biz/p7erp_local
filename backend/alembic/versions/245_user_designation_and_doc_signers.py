"""Digital approval signatures: user designation + signature image, and who signed inventory documents.

Additive only (nullable columns). Existing documents keep blank signature blocks.
Rollback: `alembic downgrade 244` drops the new columns (uploaded signature image files stay on disk).

Revision ID: 245
Revises: 244
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "245"
down_revision: Union[str, None] = "244"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SIGNED_DOC_TABLES = (
    "delivery_challans",
    "enhanced_gate_passes",
    "goods_receiving",
    "production_material_issues",
    "process_orders",
    "warehouse_transfers",
)


def upgrade() -> None:
    op.add_column("users", sa.Column("designation", sa.String(length=128), nullable=True))
    op.add_column("users", sa.Column("signature_image_name", sa.String(length=255), nullable=True))
    for table in SIGNED_DOC_TABLES:
        op.add_column(
            table,
            sa.Column(
                "signed_by_user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL", name=f"fk_{table}_signed_by_user_id"),
                nullable=True,
            ),
        )
        op.create_index(f"ix_{table}_signed_by_user_id", table, ["signed_by_user_id"])


def downgrade() -> None:
    for table in SIGNED_DOC_TABLES:
        op.drop_index(f"ix_{table}_signed_by_user_id", table_name=table)
        op.drop_constraint(f"fk_{table}_signed_by_user_id", table, type_="foreignkey")
        op.drop_column(table, "signed_by_user_id")
    op.drop_column("users", "signature_image_name")
    op.drop_column("users", "designation")
