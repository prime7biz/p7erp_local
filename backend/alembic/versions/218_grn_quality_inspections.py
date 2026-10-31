"""Create grn_quality_inspections table (Sprint I2)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "218"
down_revision: Union[str, None] = "217"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "grn_quality_inspections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("grn_id", sa.Integer(), nullable=False),
        sa.Column("grn_item_id", sa.Integer(), nullable=False),
        sa.Column("inspection_date", sa.Date(), nullable=True),
        sa.Column("inspected_by", sa.Integer(), nullable=True),
        sa.Column("received_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("accepted_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("rejected_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("hold_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column(
            "parameters",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("result", sa.String(length=16), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="PENDING"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "photos",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("target_warehouse_id", sa.Integer(), nullable=True),
        sa.Column("quarantine_warehouse_id", sa.Integer(), nullable=True),
        sa.Column("rejected_warehouse_id", sa.Integer(), nullable=True),
        sa.Column("debit_note_suggested", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["grn_id"], ["goods_receiving.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["grn_item_id"], ["goods_receiving_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inspected_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["quarantine_warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["rejected_warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "grn_item_id", name="uq_grn_qc_tenant_grn_item"),
    )
    op.create_index("ix_grn_quality_inspections_tenant_id", "grn_quality_inspections", ["tenant_id"])
    op.create_index("ix_grn_quality_inspections_grn_id", "grn_quality_inspections", ["grn_id"])
    op.create_index("ix_grn_quality_inspections_status", "grn_quality_inspections", ["status"])
    op.create_index("ix_grn_quality_inspections_result", "grn_quality_inspections", ["result"])


def downgrade() -> None:
    op.drop_table("grn_quality_inspections")
