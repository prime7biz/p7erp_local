"""AI weekly executive reports table.

Revision ID: 113
Revises: 112
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "113"
down_revision: Union[str, None] = "112"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_weekly_reports",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("week_end", sa.Date(), nullable=False),
        sa.Column("narrative", sa.Text(), nullable=False),
        sa.Column("kpi_snapshot_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "week_start", name="uq_ai_weekly_reports_tenant_week"),
    )
    op.create_index("ix_ai_weekly_reports_tenant_id", "ai_weekly_reports", ["tenant_id"], unique=False)
    op.create_index("ix_ai_weekly_reports_week_start", "ai_weekly_reports", ["week_start"], unique=False)
    op.create_index("ix_ai_weekly_reports_created_at", "ai_weekly_reports", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_weekly_reports_created_at", table_name="ai_weekly_reports")
    op.drop_index("ix_ai_weekly_reports_week_start", table_name="ai_weekly_reports")
    op.drop_index("ix_ai_weekly_reports_tenant_id", table_name="ai_weekly_reports")
    op.drop_table("ai_weekly_reports")
