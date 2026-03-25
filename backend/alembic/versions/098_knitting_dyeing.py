"""Knitting plans and dyeing recipes/batches.

Revision ID: 098
Revises: 097
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "098"
down_revision: Union[str, None] = "097"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "knitting_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=True),
        sa.Column("yarn_item_id", sa.Integer(), nullable=True),
        sa.Column("target_output_kg", sa.Numeric(18, 4), nullable=True),
        sa.Column("fabric_type", sa.String(length=128), nullable=True),
        sa.Column("gauge", sa.String(length=64), nullable=True),
        sa.Column("planned_date", sa.Date(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="planned"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["machine_id"], ["department_machines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["yarn_item_id"], ["items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_knitting_plans_tenant_id", "knitting_plans", ["tenant_id"])

    op.create_table(
        "dye_recipes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("recipe_code", sa.String(length=64), nullable=False),
        sa.Column("color_name", sa.String(length=128), nullable=True),
        sa.Column("color_code", sa.String(length=64), nullable=True),
        sa.Column("chemicals", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("process_time_minutes", sa.Integer(), nullable=True),
        sa.Column("temperature", sa.String(length=32), nullable=True),
        sa.Column("lab_dip_approved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "recipe_code", name="uq_dye_recipes_tenant_code"),
    )
    op.create_index("ix_dye_recipes_tenant_id", "dye_recipes", ["tenant_id"])

    op.create_table(
        "dye_batches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("batch_code", sa.String(length=64), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=True),
        sa.Column("recipe_id", sa.Integer(), nullable=True),
        sa.Column("fabric_item_id", sa.Integer(), nullable=True),
        sa.Column("input_qty_kg", sa.Numeric(18, 4), nullable=True),
        sa.Column("output_qty_kg", sa.Numeric(18, 4), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("planned_start", sa.DateTime(), nullable=True),
        sa.Column("planned_end", sa.DateTime(), nullable=True),
        sa.Column("actual_start", sa.DateTime(), nullable=True),
        sa.Column("actual_end", sa.DateTime(), nullable=True),
        sa.Column("shade_match_result", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="planned"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["machine_id"], ["department_machines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["recipe_id"], ["dye_recipes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["fabric_item_id"], ["items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "batch_code", name="uq_dye_batches_tenant_code"),
    )
    op.create_index("ix_dye_batches_tenant_id", "dye_batches", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_dye_batches_tenant_id", table_name="dye_batches")
    op.drop_table("dye_batches")
    op.drop_index("ix_dye_recipes_tenant_id", table_name="dye_recipes")
    op.drop_table("dye_recipes")
    op.drop_index("ix_knitting_plans_tenant_id", table_name="knitting_plans")
    op.drop_table("knitting_plans")
