"""Add merchandising parity linked tables

Revision ID: 008
Revises: 007
Create Date: 2026-03-09

- style_components
- style_colorways
- style_size_scales
- order_amendments
- inquiry_events
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "style_components",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("style_id", sa.Integer(), nullable=False),
        sa.Column("component_name", sa.String(length=100), nullable=False),
        sa.Column("sequence_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_style_components_tenant_id", "style_components", ["tenant_id"], unique=False)
    op.create_index("ix_style_components_style_id", "style_components", ["style_id"], unique=False)

    op.create_table(
        "style_colorways",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("style_id", sa.Integer(), nullable=False),
        sa.Column("color_name", sa.String(length=100), nullable=False),
        sa.Column("color_code", sa.String(length=32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_style_colorways_tenant_id", "style_colorways", ["tenant_id"], unique=False)
    op.create_index("ix_style_colorways_style_id", "style_colorways", ["style_id"], unique=False)

    op.create_table(
        "style_size_scales",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("style_id", sa.Integer(), nullable=False),
        sa.Column("scale_name", sa.String(length=100), nullable=False),
        sa.Column("sizes_csv", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_style_size_scales_tenant_id", "style_size_scales", ["tenant_id"], unique=False)
    op.create_index("ix_style_size_scales_style_id", "style_size_scales", ["style_id"], unique=False)

    op.create_table(
        "order_amendments",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("amendment_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("field_changed", sa.String(length=100), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="APPROVED"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_order_amendments_tenant_id", "order_amendments", ["tenant_id"], unique=False)
    op.create_index("ix_order_amendments_order_id", "order_amendments", ["order_id"], unique=False)

    op.create_table(
        "inquiry_events",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("inquiry_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_inquiry_events_tenant_id", "inquiry_events", ["tenant_id"], unique=False)
    op.create_index("ix_inquiry_events_inquiry_id", "inquiry_events", ["inquiry_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_inquiry_events_inquiry_id", table_name="inquiry_events")
    op.drop_index("ix_inquiry_events_tenant_id", table_name="inquiry_events")
    op.drop_table("inquiry_events")

    op.drop_index("ix_order_amendments_order_id", table_name="order_amendments")
    op.drop_index("ix_order_amendments_tenant_id", table_name="order_amendments")
    op.drop_table("order_amendments")

    op.drop_index("ix_style_size_scales_style_id", table_name="style_size_scales")
    op.drop_index("ix_style_size_scales_tenant_id", table_name="style_size_scales")
    op.drop_table("style_size_scales")

    op.drop_index("ix_style_colorways_style_id", table_name="style_colorways")
    op.drop_index("ix_style_colorways_tenant_id", table_name="style_colorways")
    op.drop_table("style_colorways")

    op.drop_index("ix_style_components_style_id", table_name="style_components")
    op.drop_index("ix_style_components_tenant_id", table_name="style_components")
    op.drop_table("style_components")
