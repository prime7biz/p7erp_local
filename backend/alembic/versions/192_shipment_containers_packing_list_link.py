"""Link shipment_containers to packing lists; add weight capacity fields."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "192"
down_revision: Union[str, None] = "191"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "shipment_containers",
        sa.Column("packing_list_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "shipment_containers",
        sa.Column("tare_weight_kg", sa.Numeric(18, 4), nullable=True),
    )
    op.add_column(
        "shipment_containers",
        sa.Column("max_weight_kg", sa.Numeric(18, 4), nullable=True),
    )
    op.add_column(
        "shipment_containers",
        sa.Column("loaded_at", sa.DateTime(), nullable=True),
    )
    op.create_foreign_key(
        "fk_shipment_containers_packing_list_id",
        "shipment_containers",
        "packing_lists",
        ["packing_list_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_shipment_containers_packing_list_id",
        "shipment_containers",
        ["packing_list_id"],
    )
    # Partial unique: one container number per packing list (NULLs excluded).
    op.create_index(
        "uq_shipment_containers_tenant_pl_number",
        "shipment_containers",
        ["tenant_id", "packing_list_id", "container_number"],
        unique=True,
        postgresql_where=sa.text("packing_list_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_shipment_containers_tenant_pl_number",
        table_name="shipment_containers",
    )
    op.drop_index("ix_shipment_containers_packing_list_id", table_name="shipment_containers")
    op.drop_constraint(
        "fk_shipment_containers_packing_list_id",
        "shipment_containers",
        type_="foreignkey",
    )
    op.drop_column("shipment_containers", "loaded_at")
    op.drop_column("shipment_containers", "max_weight_kg")
    op.drop_column("shipment_containers", "tare_weight_kg")
    op.drop_column("shipment_containers", "packing_list_id")
