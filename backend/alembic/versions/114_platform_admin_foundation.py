"""Platform admin foundation: platform_admins, audit logs, impersonation; tenants.deleted_at.

Revision ID: 114
Revises: 113
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "114"
down_revision: Union[str, None] = "113"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_index("ix_tenants_deleted_at", "tenants", ["deleted_at"], unique=False)

    op.create_table(
        "platform_admins",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=128), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.String(length=32),
            nullable=False,
            server_default="super_admin",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_login", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username", name="uq_platform_admins_username"),
        sa.UniqueConstraint("email", name="uq_platform_admins_email"),
    )
    op.create_index("ix_platform_admins_role", "platform_admins", ["role"], unique=False)

    op.create_table(
        "platform_admin_audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("target_tenant_id", sa.Integer(), nullable=True),
        sa.Column("target_user_id", sa.Integer(), nullable=True),
        sa.Column("resource", sa.String(length=255), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["admin_id"], ["platform_admins.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_platform_admin_audit_logs_admin_id",
        "platform_admin_audit_logs",
        ["admin_id"],
        unique=False,
    )
    op.create_index(
        "ix_platform_admin_audit_logs_target_tenant_id",
        "platform_admin_audit_logs",
        ["target_tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_platform_admin_audit_logs_created_at",
        "platform_admin_audit_logs",
        ["created_at"],
        unique=False,
    )

    op.create_table(
        "impersonation_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["admin_id"], ["platform_admins.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_impersonation_sessions_admin_id",
        "impersonation_sessions",
        ["admin_id"],
        unique=False,
    )
    op.create_index(
        "ix_impersonation_sessions_tenant_id",
        "impersonation_sessions",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_impersonation_sessions_token_hash",
        "impersonation_sessions",
        ["token_hash"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_impersonation_sessions_token_hash", table_name="impersonation_sessions")
    op.drop_index("ix_impersonation_sessions_tenant_id", table_name="impersonation_sessions")
    op.drop_index("ix_impersonation_sessions_admin_id", table_name="impersonation_sessions")
    op.drop_table("impersonation_sessions")

    op.drop_index("ix_platform_admin_audit_logs_created_at", table_name="platform_admin_audit_logs")
    op.drop_index("ix_platform_admin_audit_logs_target_tenant_id", table_name="platform_admin_audit_logs")
    op.drop_index("ix_platform_admin_audit_logs_admin_id", table_name="platform_admin_audit_logs")
    op.drop_table("platform_admin_audit_logs")

    op.drop_index("ix_platform_admins_role", table_name="platform_admins")
    op.drop_table("platform_admins")

    op.drop_index("ix_tenants_deleted_at", table_name="tenants")
    op.drop_column("tenants", "deleted_at")
