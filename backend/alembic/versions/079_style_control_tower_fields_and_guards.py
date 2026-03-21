"""Add style control tower fields and governance guards.

Revision ID: 079
Revises: 078
Create Date: 2026-03-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "079"
down_revision: Union[str, None] = "078"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("garment_styles", sa.Column("product_type", sa.String(length=100), nullable=True))
    op.add_column("garment_styles", sa.Column("fabric_type", sa.String(length=100), nullable=True))
    op.add_column("garment_styles", sa.Column("gsm", sa.String(length=32), nullable=True))
    op.add_column("garment_styles", sa.Column("fit_type", sa.String(length=64), nullable=True))
    op.add_column("garment_styles", sa.Column("wash_type", sa.String(length=64), nullable=True))
    op.add_column("garment_styles", sa.Column("brand", sa.String(length=100), nullable=True))
    op.add_column("garment_styles", sa.Column("buyer_style_ref", sa.String(length=128), nullable=True))
    op.add_column("garment_styles", sa.Column("hs_code", sa.String(length=32), nullable=True))
    op.add_column("garment_styles", sa.Column("uom", sa.String(length=16), nullable=True))
    op.add_column("garment_styles", sa.Column("target_fob", sa.String(length=32), nullable=True))
    op.add_column("garment_styles", sa.Column("currency", sa.String(length=8), nullable=True))
    op.add_column("garment_styles", sa.Column("sample_lead_days", sa.Integer(), nullable=True))
    op.add_column("garment_styles", sa.Column("production_lead_days", sa.Integer(), nullable=True))
    op.add_column(
        "garment_styles",
        sa.Column("is_active_for_new_orders", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "garment_styles",
        sa.Column("lifecycle_stage", sa.String(length=32), nullable=False, server_default="INQUIRY"),
    )
    op.add_column("garment_styles", sa.Column("priority", sa.String(length=16), nullable=True))
    op.add_column("garment_styles", sa.Column("risk_level", sa.String(length=16), nullable=True))
    op.create_index("ix_garment_styles_lifecycle_stage", "garment_styles", ["lifecycle_stage"], unique=False)
    op.create_unique_constraint(
        "uq_garment_styles_tenant_style_code",
        "garment_styles",
        ["tenant_id", "style_code"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_garment_styles_tenant_style_code", "garment_styles", type_="unique")
    op.drop_index("ix_garment_styles_lifecycle_stage", table_name="garment_styles")
    op.drop_column("garment_styles", "risk_level")
    op.drop_column("garment_styles", "priority")
    op.drop_column("garment_styles", "lifecycle_stage")
    op.drop_column("garment_styles", "is_active_for_new_orders")
    op.drop_column("garment_styles", "production_lead_days")
    op.drop_column("garment_styles", "sample_lead_days")
    op.drop_column("garment_styles", "currency")
    op.drop_column("garment_styles", "target_fob")
    op.drop_column("garment_styles", "uom")
    op.drop_column("garment_styles", "hs_code")
    op.drop_column("garment_styles", "buyer_style_ref")
    op.drop_column("garment_styles", "brand")
    op.drop_column("garment_styles", "wash_type")
    op.drop_column("garment_styles", "fit_type")
    op.drop_column("garment_styles", "gsm")
    op.drop_column("garment_styles", "fabric_type")
    op.drop_column("garment_styles", "product_type")
