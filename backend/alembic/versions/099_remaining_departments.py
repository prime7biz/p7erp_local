"""Generic department production plans for optional units.

Revision ID: 099
Revises: 098
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "099"
down_revision: Union[str, None] = "098"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "department_production_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("department_type", sa.String(length=32), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=True),
        sa.Column("input_item_id", sa.Integer(), nullable=True),
        sa.Column("target_output", sa.Numeric(18, 4), nullable=True),
        sa.Column("target_uom", sa.String(length=32), nullable=True),
        sa.Column("planned_date", sa.Date(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("style_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="planned"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["machine_id"], ["department_machines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["input_item_id"], ["items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dept_prod_plans_tenant_dept", "department_production_plans", ["tenant_id", "department_type"])


def downgrade() -> None:
    op.drop_index("ix_dept_prod_plans_tenant_dept", table_name="department_production_plans")
    op.drop_table("department_production_plans")
