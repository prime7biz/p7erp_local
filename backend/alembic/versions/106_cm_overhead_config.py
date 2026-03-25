"""Create cm_overhead_config table.

Revision ID: 106
Revises: 105
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "106"
down_revision: Union[str, None] = "105"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cm_overhead_config",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("cost_category", sa.String(length=64), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=True),
        sa.Column("cost_center_id", sa.Integer(), nullable=True),
        sa.Column("allocation_method", sa.String(length=32), nullable=False, server_default="equal"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["cost_center_id"], ["cost_centers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "cost_category", name="uq_cm_overhead_config_tenant_category"),
    )
    op.create_index(op.f("ix_cm_overhead_config_tenant_id"), "cm_overhead_config", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_cm_overhead_config_account_id"), "cm_overhead_config", ["account_id"], unique=False)
    op.create_index(op.f("ix_cm_overhead_config_cost_center_id"), "cm_overhead_config", ["cost_center_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_cm_overhead_config_cost_center_id"), table_name="cm_overhead_config")
    op.drop_index(op.f("ix_cm_overhead_config_account_id"), table_name="cm_overhead_config")
    op.drop_index(op.f("ix_cm_overhead_config_tenant_id"), table_name="cm_overhead_config")
    op.drop_table("cm_overhead_config")
