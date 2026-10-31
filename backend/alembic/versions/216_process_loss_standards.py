"""Create process_loss_standards table (Sprint I1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "216"
down_revision: Union[str, None] = "215"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "process_loss_standards",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("process_name", sa.String(length=64), nullable=False),
        sa.Column("standard_loss_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column(
            "warning_threshold_percent",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="5.00",
        ),
        sa.Column("item_category_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_category_id"], ["item_categories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "process_name",
            "item_category_id",
            name="uq_process_loss_standards_tenant_process_cat",
        ),
    )
    op.create_index("ix_process_loss_standards_tenant_id", "process_loss_standards", ["tenant_id"])
    op.create_index("ix_process_loss_standards_process_name", "process_loss_standards", ["process_name"])


def downgrade() -> None:
    op.drop_table("process_loss_standards")
