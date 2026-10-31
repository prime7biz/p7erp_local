"""Create recurring_voucher_templates (Sprint 4)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "208"
down_revision: Union[str, None] = "207"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "recurring_voucher_templates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("voucher_type", sa.String(length=32), nullable=False),
        sa.Column("voucher_class_id", sa.Integer(), nullable=True),
        sa.Column("frequency", sa.String(length=16), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("next_due_date", sa.Date(), nullable=False),
        sa.Column("last_generated_date", sa.Date(), nullable=True),
        sa.Column("voucher_template", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("generate_as_status", sa.String(length=16), nullable=False, server_default="DRAFT"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')",
            name="ck_recurring_voucher_templates_frequency",
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voucher_class_id"], ["voucher_classes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_recurring_voucher_templates_tenant_name"),
    )
    op.create_index("ix_recurring_voucher_templates_tenant_id", "recurring_voucher_templates", ["tenant_id"])
    op.create_index("ix_recurring_voucher_templates_next_due", "recurring_voucher_templates", ["next_due_date"])
    op.create_index("ix_recurring_voucher_templates_active", "recurring_voucher_templates", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_recurring_voucher_templates_active", table_name="recurring_voucher_templates")
    op.drop_index("ix_recurring_voucher_templates_next_due", table_name="recurring_voucher_templates")
    op.drop_index("ix_recurring_voucher_templates_tenant_id", table_name="recurring_voucher_templates")
    op.drop_table("recurring_voucher_templates")
