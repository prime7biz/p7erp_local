"""Phase 2A material inbound: style/colourway tags + job-work binding + warehouse bonded flag.

Additive nullable columns only. Behind tenant flag ``material_inbound_v2`` (default OFF).
Downgrade: ``alembic downgrade 319``.

Revision ID: 320
Revises: 319
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "320"
down_revision: Union[str, None] = "319"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_style_cols(table: str, *, index_prefix: str) -> None:
    op.add_column(
        table,
        sa.Column("style_id", sa.Integer(), sa.ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        table,
        sa.Column(
            "colorway_id",
            sa.Integer(),
            sa.ForeignKey("style_colorways.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(f"ix_{index_prefix}_tenant_style", table, ["tenant_id", "style_id"])


def _drop_style_cols(table: str, *, index_prefix: str) -> None:
    op.drop_index(f"ix_{index_prefix}_tenant_style", table_name=table)
    op.drop_column(table, "colorway_id")
    op.drop_column(table, "style_id")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    _add_style_cols("purchase_order_items", index_prefix="poi")
    _add_style_cols("goods_receiving_items", index_prefix="gri")
    _add_style_cols("stock_movements", index_prefix="sm")

    op.add_column(
        "warehouses",
        sa.Column("is_bonded", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # Job-work subcontract binding (nullable; gated by material_inbound_v2 + inbound_job_work_v1)
    op.add_column(
        "job_work_contracts",
        sa.Column(
            "final_customer_id",
            sa.Integer(),
            sa.ForeignKey("customers.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("job_work_contracts", sa.Column("final_customer_name", sa.String(255), nullable=True))
    op.add_column(
        "job_work_contracts",
        sa.Column(
            "master_contract_id",
            sa.Integer(),
            sa.ForeignKey("master_contracts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "job_work_contracts",
        sa.Column(
            "proforma_invoice_id",
            sa.Integer(),
            sa.ForeignKey("proforma_invoices.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("job_work_contracts", sa.Column("principal_ud_ref", sa.String(128), nullable=True))
    op.create_index("ix_job_work_contracts_final_customer", "job_work_contracts", ["tenant_id", "final_customer_id"])

    op.add_column(
        "job_work_deliverables",
        sa.Column("style_id", sa.Integer(), sa.ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "job_work_deliverables",
        sa.Column(
            "colorway_id",
            sa.Integer(),
            sa.ForeignKey("style_colorways.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "job_work_deliverables",
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_job_work_deliverables_style", "job_work_deliverables", ["tenant_id", "style_id"])

    op.add_column(
        "job_work_materials",
        sa.Column("style_id", sa.Integer(), sa.ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "job_work_materials",
        sa.Column(
            "colorway_id",
            sa.Integer(),
            sa.ForeignKey("style_colorways.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_job_work_materials_style", "job_work_materials", ["tenant_id", "style_id"])


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.drop_index("ix_job_work_materials_style", table_name="job_work_materials")
    op.drop_column("job_work_materials", "colorway_id")
    op.drop_column("job_work_materials", "style_id")

    op.drop_index("ix_job_work_deliverables_style", table_name="job_work_deliverables")
    op.drop_column("job_work_deliverables", "order_id")
    op.drop_column("job_work_deliverables", "colorway_id")
    op.drop_column("job_work_deliverables", "style_id")

    op.drop_index("ix_job_work_contracts_final_customer", table_name="job_work_contracts")
    op.drop_column("job_work_contracts", "principal_ud_ref")
    op.drop_column("job_work_contracts", "proforma_invoice_id")
    op.drop_column("job_work_contracts", "master_contract_id")
    op.drop_column("job_work_contracts", "final_customer_name")
    op.drop_column("job_work_contracts", "final_customer_id")

    op.drop_column("warehouses", "is_bonded")

    _drop_style_cols("stock_movements", index_prefix="sm")
    _drop_style_cols("goods_receiving_items", index_prefix="gri")
    _drop_style_cols("purchase_order_items", index_prefix="poi")
