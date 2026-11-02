"""Traceability: material certificates and cut ticket fabric lots.

Revision ID: 237
Revises: 236
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "237"
down_revision: Union[str, None] = "236"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "material_certificates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cert_type", sa.String(24), nullable=False),
        sa.Column("certificate_number", sa.String(100), nullable=False),
        sa.Column("issuer", sa.String(160), nullable=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="CASCADE"), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("vendor_id IS NOT NULL OR item_id IS NOT NULL", name="ck_material_certificates_target"),
    )
    op.create_index("ix_material_certificates_tenant_id", "material_certificates", ["tenant_id"])
    op.create_index("ix_material_certificates_vendor_id", "material_certificates", ["vendor_id"])
    op.create_index("ix_material_certificates_item_id", "material_certificates", ["item_id"])
    op.create_index("ix_material_certificates_valid_until", "material_certificates", ["valid_until"])

    op.create_table(
        "cut_ticket_fabric_lots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cut_ticket_id", sa.Integer(), sa.ForeignKey("cut_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stock_batch_id", sa.Integer(), sa.ForeignKey("stock_batches.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("qty_used", sa.Numeric(18, 4), nullable=True),
        sa.Column("roll_numbers", sa.String(500), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("cut_ticket_id", "stock_batch_id", name="uq_cut_ticket_fabric_lot"),
    )
    op.create_index("ix_cut_ticket_fabric_lots_tenant_id", "cut_ticket_fabric_lots", ["tenant_id"])
    op.create_index("ix_cut_ticket_fabric_lots_cut_ticket_id", "cut_ticket_fabric_lots", ["cut_ticket_id"])
    op.create_index("ix_cut_ticket_fabric_lots_stock_batch_id", "cut_ticket_fabric_lots", ["stock_batch_id"])


def downgrade() -> None:
    op.drop_table("cut_ticket_fabric_lots")
    op.drop_table("material_certificates")
