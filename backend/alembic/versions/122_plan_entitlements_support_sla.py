"""Plan entitlements columns + support ticket SLA fields.

Revision ID: 122
Revises: 121
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "122"
down_revision: Union[str, None] = "121"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "platform_plans",
        sa.Column("support_level", sa.String(length=32), nullable=False, server_default="standard"),
    )
    op.add_column("platform_plans", sa.Column("optional_addons", sa.JSON(), nullable=True))
    op.add_column("platform_plans", sa.Column("overage_rules", sa.JSON(), nullable=True))

    op.add_column("support_tickets", sa.Column("sla_first_response_due_at", sa.DateTime(), nullable=True))
    op.add_column("support_tickets", sa.Column("sla_resolution_due_at", sa.DateTime(), nullable=True))
    op.add_column("support_tickets", sa.Column("first_response_at", sa.DateTime(), nullable=True))
    op.add_column("support_tickets", sa.Column("resolved_at", sa.DateTime(), nullable=True))
    op.add_column("support_tickets", sa.Column("escalated_at", sa.DateTime(), nullable=True))
    op.add_column(
        "support_tickets",
        sa.Column("escalation_level", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("support_tickets", "escalation_level")
    op.drop_column("support_tickets", "escalated_at")
    op.drop_column("support_tickets", "resolved_at")
    op.drop_column("support_tickets", "first_response_at")
    op.drop_column("support_tickets", "sla_resolution_due_at")
    op.drop_column("support_tickets", "sla_first_response_due_at")
    op.drop_column("platform_plans", "overage_rules")
    op.drop_column("platform_plans", "optional_addons")
    op.drop_column("platform_plans", "support_level")
