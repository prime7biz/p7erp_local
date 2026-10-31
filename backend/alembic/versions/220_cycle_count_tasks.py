"""Create cycle_count_tasks table (Sprint I3)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "220"
down_revision: Union[str, None] = "219"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cycle_count_tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=False),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="SCHEDULED"),
        sa.Column("system_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("counted_qty", sa.Numeric(18, 4), nullable=True),
        sa.Column("variance_qty", sa.Numeric(18, 4), nullable=True),
        sa.Column("variance_value", sa.Numeric(18, 4), nullable=True),
        sa.Column("abc_class", sa.String(length=1), nullable=True),
        sa.Column("adjustment_suggested", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("counted_by", sa.Integer(), nullable=True),
        sa.Column("counted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["counted_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cycle_count_tasks_tenant_id", "cycle_count_tasks", ["tenant_id"])
    op.create_index("ix_cycle_count_tasks_item_id", "cycle_count_tasks", ["item_id"])
    op.create_index("ix_cycle_count_tasks_warehouse_id", "cycle_count_tasks", ["warehouse_id"])
    op.create_index("ix_cycle_count_tasks_scheduled_date", "cycle_count_tasks", ["scheduled_date"])
    op.create_index("ix_cycle_count_tasks_status", "cycle_count_tasks", ["status"])
    op.create_index(
        "ix_cycle_count_tasks_tenant_date_status",
        "cycle_count_tasks",
        ["tenant_id", "scheduled_date", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_cycle_count_tasks_tenant_date_status", table_name="cycle_count_tasks")
    op.drop_index("ix_cycle_count_tasks_status", table_name="cycle_count_tasks")
    op.drop_index("ix_cycle_count_tasks_scheduled_date", table_name="cycle_count_tasks")
    op.drop_index("ix_cycle_count_tasks_warehouse_id", table_name="cycle_count_tasks")
    op.drop_index("ix_cycle_count_tasks_item_id", table_name="cycle_count_tasks")
    op.drop_index("ix_cycle_count_tasks_tenant_id", table_name="cycle_count_tasks")
    op.drop_table("cycle_count_tasks")
