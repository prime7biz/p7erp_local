"""Create hr_ai_analysis_results (Sprint H1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "229"
down_revision: Union[str, None] = "228"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_ai_analysis_results",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("analysis_type", sa.String(length=48), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hr_ai_analysis_results_tenant_id", "hr_ai_analysis_results", ["tenant_id"])
    op.create_index("ix_hr_ai_analysis_results_analysis_type", "hr_ai_analysis_results", ["analysis_type"])
    op.create_index("ix_hr_ai_analysis_results_subject_id", "hr_ai_analysis_results", ["subject_id"])


def downgrade() -> None:
    op.drop_index("ix_hr_ai_analysis_results_subject_id", table_name="hr_ai_analysis_results")
    op.drop_index("ix_hr_ai_analysis_results_analysis_type", table_name="hr_ai_analysis_results")
    op.drop_index("ix_hr_ai_analysis_results_tenant_id", table_name="hr_ai_analysis_results")
    op.drop_table("hr_ai_analysis_results")
