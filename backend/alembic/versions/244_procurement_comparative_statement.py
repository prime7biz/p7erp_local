"""Procurement: purchase requisition -> supplier quotations -> comparative statement -> PO.

Additive only (four new tables). Feature flag `procurement_cs_enabled` (default off).
Rollback: `alembic downgrade 243` drops the four tables (requisition data is lost; POs created
from them stay, since purchase_orders is not changed).

Revision ID: 244
Revises: 243
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "244"
down_revision: Union[str, None] = "243"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "purchase_requisitions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pr_code", sa.String(32), nullable=False),
        sa.Column("department", sa.String(128), nullable=True),
        sa.Column("purpose", sa.Text(), nullable=True),
        sa.Column("required_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="DRAFT"),
        sa.Column("requested_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("selected_quotation_id", sa.Integer(), nullable=True),
        sa.Column("selection_reason", sa.Text(), nullable=True),
        sa.Column("selected_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("selected_at", sa.DateTime(), nullable=True),
        sa.Column(
            "purchase_order_id", sa.Integer(), sa.ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "pr_code", name="uq_purchase_requisitions_tenant_pr_code"),
    )
    op.create_index("ix_purchase_requisitions_tenant_id", "purchase_requisitions", ["tenant_id"])
    op.create_index("ix_purchase_requisitions_tenant_status", "purchase_requisitions", ["tenant_id", "status"])

    op.create_table(
        "purchase_requisition_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "requisition_id",
            sa.Integer(),
            sa.ForeignKey("purchase_requisitions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("quantity", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("estimated_unit_price", sa.Numeric(18, 4), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_purchase_requisition_lines_requisition_id", "purchase_requisition_lines", ["requisition_id"])
    op.create_index("ix_purchase_requisition_lines_tenant_id", "purchase_requisition_lines", ["tenant_id"])

    op.create_table(
        "supplier_quotations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "requisition_id",
            sa.Integer(),
            sa.ForeignKey("purchase_requisitions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("quote_ref", sa.String(64), nullable=True),
        sa.Column("quote_date", sa.Date(), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("currency", sa.String(10), nullable=True),
        sa.Column("delivery_days", sa.Integer(), nullable=True),
        sa.Column("payment_terms", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_supplier_quotations_requisition_id", "supplier_quotations", ["requisition_id"])
    op.create_index("ix_supplier_quotations_tenant_id", "supplier_quotations", ["tenant_id"])

    op.create_table(
        "supplier_quotation_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "quotation_id", sa.Integer(), sa.ForeignKey("supplier_quotations.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "requisition_line_id",
            sa.Integer(),
            sa.ForeignKey("purchase_requisition_lines.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("unit_price", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.UniqueConstraint("quotation_id", "requisition_line_id", name="uq_supplier_quotation_lines_quote_line"),
    )
    op.create_index("ix_supplier_quotation_lines_quotation_id", "supplier_quotation_lines", ["quotation_id"])


def downgrade() -> None:
    op.drop_index("ix_supplier_quotation_lines_quotation_id", table_name="supplier_quotation_lines")
    op.drop_table("supplier_quotation_lines")
    op.drop_index("ix_supplier_quotations_tenant_id", table_name="supplier_quotations")
    op.drop_index("ix_supplier_quotations_requisition_id", table_name="supplier_quotations")
    op.drop_table("supplier_quotations")
    op.drop_index("ix_purchase_requisition_lines_tenant_id", table_name="purchase_requisition_lines")
    op.drop_index("ix_purchase_requisition_lines_requisition_id", table_name="purchase_requisition_lines")
    op.drop_table("purchase_requisition_lines")
    op.drop_index("ix_purchase_requisitions_tenant_status", table_name="purchase_requisitions")
    op.drop_index("ix_purchase_requisitions_tenant_id", table_name="purchase_requisitions")
    op.drop_table("purchase_requisitions")
