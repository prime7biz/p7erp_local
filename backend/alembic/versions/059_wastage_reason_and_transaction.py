"""Wastage reason taxonomy and wastage_transaction tables + seed.

Revision ID: 059
Revises: 058
Create Date: 2026-03-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "059"
down_revision: Union[str, None] = "058"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Taxonomy from WASTAGE_LOSS_ANALYSIS_REPORT_BLUEPRINT.md §3: (code, name, category)
WASTAGE_REASON_SEED = [
    # Fabric
    ("marker_cutting", "Marker / cutting wastage", "fabric"),
    ("spreading", "Spreading wastage", "fabric"),
    ("end_bit_remnant", "End-bit / remnant wastage", "fabric"),
    ("shade_band_panel", "Shade-band / panel rejection loss", "fabric"),
    ("cutting_rejection", "Cutting rejection", "fabric"),
    ("bundle_loss", "Bundle loss", "fabric"),
    ("sewing_rejection_fabric", "Sewing rejection causing fabric loss", "fabric"),
    ("washing_damage", "Washing damage loss", "fabric"),
    ("finishing_rejection", "Finishing rejection loss", "fabric"),
    ("inspection_rejection", "Final inspection rejection loss", "fabric"),
    # Trim
    ("thread_overconsumption", "Thread overconsumption", "trim"),
    ("label_wastage", "Label wastage", "trim"),
    ("poly_carton_packaging", "Poly / carton / packaging wastage", "trim"),
    ("button_zipper_elastic_tape", "Button / zipper / elastic / tape wastage", "trim"),
    ("replacement_issue_qty", "Replacement issue qty", "trim"),
    ("short_receipt_vs_use", "Short receipt vs actual use mismatch", "trim"),
    # Process
    ("rework_loss", "Rework loss", "process"),
    ("repair_loss", "Repair loss", "process"),
    ("rejection_loss", "Rejection loss", "process"),
    ("sample_consumption", "Sample-related consumption loss", "process"),
    ("damage_loss", "Damage loss", "process"),
    ("handling_loss", "Handling loss", "process"),
    ("shrinkage_overconsumption", "Shrinkage-related overconsumption", "process"),
    ("process_transfer_loss", "Process-to-process transfer loss", "process"),
    # Store
    ("excess_issue_vs_standard", "Excess issue vs standard", "store"),
    ("return_shortage", "Return shortage", "store"),
    ("dead_stock_closure", "Dead stock from order closure", "store"),
    ("leftover_balance", "Leftover balance", "store"),
    ("unaccounted_variance", "Unaccounted variance", "store"),
    ("physical_stock_mismatch", "Physical stock mismatch", "store"),
    # Commercial
    ("cost_impact_base_currency", "Cost impact in base currency", "commercial"),
    ("wastage_pct_order_value", "Wastage as % of order value", "commercial"),
    ("wastage_pct_material_cost", "Wastage as % of material cost", "commercial"),
    ("buyer_chargeable", "Buyer chargeable loss", "commercial"),
    ("buyer_non_chargeable", "Buyer non-chargeable loss", "commercial"),
    ("recoverable_salvage", "Recoverable salvage value", "commercial"),
    ("net_loss", "Net wastage cost", "commercial"),
]


def upgrade() -> None:
    op.create_table(
        "wastage_reasons",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("recoverable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("recyclable", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_wastage_reasons_tenant_id", "wastage_reasons", ["tenant_id"], unique=False)
    op.create_index("ix_wastage_reasons_tenant_id_code", "wastage_reasons", ["tenant_id", "code"], unique=True)

    op.create_table(
        "wastage_transactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=True),
        sa.Column("process_stage", sa.String(32), nullable=False),
        sa.Column("reason_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.String(32), nullable=False, server_default="0"),
        sa.Column("unit_cost", sa.String(32), nullable=False, server_default="0"),
        sa.Column("value", sa.String(32), nullable=False, server_default="0"),
        sa.Column("recoverable_value", sa.String(32), nullable=False, server_default="0"),
        sa.Column("reference_type", sa.String(32), nullable=True),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reason_id"], ["wastage_reasons.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_wastage_transactions_tenant_id", "wastage_transactions", ["tenant_id"], unique=False)
    op.create_index("ix_wastage_transactions_order_id", "wastage_transactions", ["order_id"], unique=False)
    op.create_index("ix_wastage_transactions_item_id", "wastage_transactions", ["item_id"], unique=False)
    op.create_index("ix_wastage_transactions_reason_id", "wastage_transactions", ["reason_id"], unique=False)
    op.create_index("ix_wastage_transactions_tenant_order", "wastage_transactions", ["tenant_id", "order_id"], unique=False)
    op.create_index("ix_wastage_transactions_tenant_created", "wastage_transactions", ["tenant_id", "created_at"], unique=False)
    op.create_index("ix_wastage_transactions_tenant_reason", "wastage_transactions", ["tenant_id", "reason_id"], unique=False)

    # Seed wastage_reason for each existing tenant
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        tenant_ids = [r[0] for r in conn.execute(sa.text("SELECT id FROM tenants")).fetchall()]
        for tenant_id in tenant_ids:
            for code, name, category in WASTAGE_REASON_SEED:
                conn.execute(
                    sa.text(
                        "INSERT INTO wastage_reasons (tenant_id, code, name, category, recoverable) "
                        "VALUES (:tid, :code, :name, :cat, false)"
                    ),
                    {"tid": tenant_id, "code": code, "name": name, "cat": category},
                )


def downgrade() -> None:
    op.drop_index("ix_wastage_transactions_tenant_reason", table_name="wastage_transactions")
    op.drop_index("ix_wastage_transactions_tenant_created", table_name="wastage_transactions")
    op.drop_index("ix_wastage_transactions_tenant_order", table_name="wastage_transactions")
    op.drop_index("ix_wastage_transactions_reason_id", table_name="wastage_transactions")
    op.drop_index("ix_wastage_transactions_item_id", table_name="wastage_transactions")
    op.drop_index("ix_wastage_transactions_order_id", table_name="wastage_transactions")
    op.drop_index("ix_wastage_transactions_tenant_id", table_name="wastage_transactions")
    op.drop_table("wastage_transactions")
    op.drop_index("ix_wastage_reasons_tenant_id_code", table_name="wastage_reasons")
    op.drop_index("ix_wastage_reasons_tenant_id", table_name="wastage_reasons")
    op.drop_table("wastage_reasons")
