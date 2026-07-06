"""Platform background jobs table."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "185"
down_revision: Union[str, None] = "184"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_background_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("job_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("celery_task_id", sa.String(length=128), nullable=True),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("admin_id", sa.Integer(), nullable=True),
        sa.Column("progress_json", sa.JSON(), nullable=True),
        sa.Column("result_json", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["admin_id"], ["platform_admins.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_platform_background_jobs_job_type", "platform_background_jobs", ["job_type"])
    op.create_index("ix_platform_background_jobs_status", "platform_background_jobs", ["status"])
    op.create_index("ix_platform_background_jobs_celery_task_id", "platform_background_jobs", ["celery_task_id"])
    op.create_index("ix_platform_background_jobs_tenant_id", "platform_background_jobs", ["tenant_id"])
    op.create_index("ix_platform_background_jobs_admin_id", "platform_background_jobs", ["admin_id"])


def downgrade() -> None:
    op.drop_index("ix_platform_background_jobs_admin_id", table_name="platform_background_jobs")
    op.drop_index("ix_platform_background_jobs_tenant_id", table_name="platform_background_jobs")
    op.drop_index("ix_platform_background_jobs_celery_task_id", table_name="platform_background_jobs")
    op.drop_index("ix_platform_background_jobs_status", table_name="platform_background_jobs")
    op.drop_index("ix_platform_background_jobs_job_type", table_name="platform_background_jobs")
    op.drop_table("platform_background_jobs")
