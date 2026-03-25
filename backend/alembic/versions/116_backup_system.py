"""Backup jobs and schedules.

Revision ID: 116
Revises: 115
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "116"
down_revision: Union[str, None] = "115"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "backup_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column(
            "backup_type",
            sa.String(length=16),
            nullable=False,
            server_default="full",
        ),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("file_name", sa.String(length=512), nullable=True),
        sa.Column("storage_path", sa.String(length=1024), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("checksum", sa.String(length=64), nullable=True),
        sa.Column("initiated_by", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["initiated_by"], ["platform_admins.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_backup_jobs_tenant_id", "backup_jobs", ["tenant_id"], unique=False)
    op.create_index("ix_backup_jobs_status", "backup_jobs", ["status"], unique=False)
    op.create_index("ix_backup_jobs_created_at", "backup_jobs", ["created_at"], unique=False)

    op.create_table(
        "backup_schedules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column(
            "frequency",
            sa.String(length=16),
            nullable=False,
            server_default="daily",
        ),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("next_run_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["platform_admins.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_backup_schedules_tenant_id", "backup_schedules", ["tenant_id"], unique=False)
    op.create_index("ix_backup_schedules_next_run_at", "backup_schedules", ["next_run_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_backup_schedules_next_run_at", table_name="backup_schedules")
    op.drop_index("ix_backup_schedules_tenant_id", table_name="backup_schedules")
    op.drop_table("backup_schedules")

    op.drop_index("ix_backup_jobs_created_at", table_name="backup_jobs")
    op.drop_index("ix_backup_jobs_status", table_name="backup_jobs")
    op.drop_index("ix_backup_jobs_tenant_id", table_name="backup_jobs")
    op.drop_table("backup_jobs")
