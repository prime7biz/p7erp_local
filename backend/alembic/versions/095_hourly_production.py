"""Hourly production entries across departments.

Revision ID: 095
Revises: 094
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "095"
down_revision: Union[str, None] = "094"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hourly_production_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("department_type", sa.String(length=32), nullable=False),
        sa.Column("line_id", sa.Integer(), nullable=True),
        sa.Column("machine_id", sa.Integer(), nullable=True),
        sa.Column("line_style_config_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("style_id", sa.Integer(), nullable=True),
        sa.Column("shift_id", sa.Integer(), nullable=True),
        sa.Column("production_date", sa.Date(), nullable=False),
        sa.Column("hour_slot", sa.Integer(), nullable=False),
        sa.Column("target_qty", sa.Numeric(18, 3), nullable=True),
        sa.Column("good_qty", sa.Numeric(18, 3), nullable=True),
        sa.Column("reject_qty", sa.Numeric(18, 3), nullable=True),
        sa.Column("rework_qty", sa.Numeric(18, 3), nullable=True),
        sa.Column("input_qty", sa.Numeric(18, 3), nullable=True),
        sa.Column("output_qty", sa.Numeric(18, 3), nullable=True),
        sa.Column("uom", sa.String(length=32), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("entered_by_user_id", sa.Integer(), nullable=True),
        sa.Column("entered_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["line_id"], ["sewing_lines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["machine_id"], ["department_machines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["line_style_config_id"], ["sewing_line_style_configs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["shift_id"], ["production_shifts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["entered_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hourly_production_entries_tenant_id", "hourly_production_entries", ["tenant_id"])
    op.create_index("ix_hourly_production_entries_dept", "hourly_production_entries", ["department_type"])
    op.create_index("ix_hourly_production_entries_date", "hourly_production_entries", ["production_date"])
    op.create_index(
        "ix_hourly_prod_lookup",
        "hourly_production_entries",
        ["tenant_id", "department_type", "production_date", "hour_slot"],
    )


def downgrade() -> None:
    op.drop_index("ix_hourly_prod_lookup", table_name="hourly_production_entries")
    op.drop_index("ix_hourly_production_entries_date", table_name="hourly_production_entries")
    op.drop_index("ix_hourly_production_entries_dept", table_name="hourly_production_entries")
    op.drop_index("ix_hourly_production_entries_tenant_id", table_name="hourly_production_entries")
    op.drop_table("hourly_production_entries")
