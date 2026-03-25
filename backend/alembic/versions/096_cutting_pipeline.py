"""Cutting: marker plans, lay plans, cut tickets, bundles.

Revision ID: 096
Revises: 095
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "096"
down_revision: Union[str, None] = "095"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "marker_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("style_id", sa.Integer(), nullable=True),
        sa.Column("marker_code", sa.String(length=64), nullable=False),
        sa.Column("cad_reference", sa.String(length=255), nullable=True),
        sa.Column("marker_length", sa.Numeric(18, 4), nullable=True),
        sa.Column("marker_width", sa.Numeric(18, 4), nullable=True),
        sa.Column("marker_efficiency_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("fabric_consumption_per_pcs", sa.Numeric(18, 6), nullable=True),
        sa.Column("sizes_included", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("size_ratio", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("pcs_per_marker", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_marker_plans_tenant_id", "marker_plans", ["tenant_id"])

    op.create_table(
        "lay_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("marker_plan_id", sa.Integer(), nullable=False),
        sa.Column("lay_code", sa.String(length=64), nullable=False),
        sa.Column("fabric_item_id", sa.Integer(), nullable=True),
        sa.Column("fabric_lot_no", sa.String(length=128), nullable=True),
        sa.Column("num_plies", sa.Integer(), nullable=True),
        sa.Column("lay_length", sa.Numeric(18, 4), nullable=True),
        sa.Column("total_fabric_used", sa.Numeric(18, 4), nullable=True),
        sa.Column("planned_pcs", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="planned"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["marker_plan_id"], ["marker_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fabric_item_id"], ["items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lay_plans_marker_plan_id", "lay_plans", ["marker_plan_id"])

    op.create_table(
        "cut_tickets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("lay_plan_id", sa.Integer(), nullable=False),
        sa.Column("ticket_code", sa.String(length=64), nullable=False),
        sa.Column("cut_date", sa.Date(), nullable=True),
        sa.Column("cutter_user_id", sa.Integer(), nullable=True),
        sa.Column("total_pcs_cut", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lay_plan_id"], ["lay_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["cutter_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "ticket_code", name="uq_cut_tickets_tenant_code"),
    )
    op.create_index("ix_cut_tickets_lay_plan_id", "cut_tickets", ["lay_plan_id"])

    op.create_table(
        "cutting_bundles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("cut_ticket_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("style_id", sa.Integer(), nullable=True),
        sa.Column("bundle_no", sa.String(length=64), nullable=False),
        sa.Column("barcode", sa.String(length=128), nullable=False),
        sa.Column("size", sa.String(length=32), nullable=True),
        sa.Column("color", sa.String(length=64), nullable=True),
        sa.Column("qty_in_bundle", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="cut"),
        sa.Column("issued_to_line_id", sa.Integer(), nullable=True),
        sa.Column("issued_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["cut_ticket_id"], ["cut_tickets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["issued_to_line_id"], ["sewing_lines.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "barcode", name="uq_cutting_bundles_tenant_barcode"),
    )
    op.create_index("ix_cutting_bundles_cut_ticket_id", "cutting_bundles", ["cut_ticket_id"])


def downgrade() -> None:
    op.drop_index("ix_cutting_bundles_cut_ticket_id", table_name="cutting_bundles")
    op.drop_table("cutting_bundles")
    op.drop_index("ix_cut_tickets_lay_plan_id", table_name="cut_tickets")
    op.drop_table("cut_tickets")
    op.drop_index("ix_lay_plans_marker_plan_id", table_name="lay_plans")
    op.drop_table("lay_plans")
    op.drop_index("ix_marker_plans_tenant_id", table_name="marker_plans")
    op.drop_table("marker_plans")
