"""External access platform: principals, roles, invitations, notes, audit.

Revision ID: 148
Revises: 147
Create Date: 2026-04-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "148"
down_revision: Union[str, None] = "147"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "external_roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("principal_type", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_external_roles_code", "external_roles", ["code"], unique=False)
    op.create_index("ix_external_roles_principal_type", "external_roles", ["principal_type"], unique=False)

    op.create_table(
        "external_principals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("principal_type", sa.String(length=32), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("invited_at", sa.DateTime(), nullable=True),
        sa.Column("invited_by_user_id", sa.Integer(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("must_reset_password", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("password_reset_token_hash", sa.String(length=255), nullable=True),
        sa.Column("password_reset_expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "email", "principal_type", name="uq_external_principal_tenant_email_type"),
    )
    op.create_index("ix_external_principals_tenant_id", "external_principals", ["tenant_id"], unique=False)
    op.create_index("ix_external_principals_principal_type", "external_principals", ["principal_type"], unique=False)
    op.create_index("ix_external_principals_email", "external_principals", ["email"], unique=False)

    op.create_table(
        "external_principal_roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("external_principal_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["external_principal_id"], ["external_principals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["external_roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_external_principal_roles_external_principal_id",
        "external_principal_roles",
        ["external_principal_id"],
        unique=False,
    )
    op.create_index("ix_external_principal_roles_role_id", "external_principal_roles", ["role_id"], unique=False)

    op.create_table(
        "external_customer_access",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("external_principal_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["external_principal_id"], ["external_principals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_external_customer_access_tenant_id", "external_customer_access", ["tenant_id"], unique=False)
    op.create_index(
        "ix_external_customer_access_external_principal_id",
        "external_customer_access",
        ["external_principal_id"],
        unique=False,
    )
    op.create_index("ix_external_customer_access_customer_id", "external_customer_access", ["customer_id"], unique=False)

    op.create_table(
        "external_financier_access",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("external_principal_id", sa.Integer(), nullable=False),
        sa.Column("financier_party_id", sa.Integer(), nullable=True),
        sa.Column("access_scope", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["external_principal_id"], ["external_principals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_external_financier_access_tenant_id", "external_financier_access", ["tenant_id"], unique=False)
    op.create_index(
        "ix_external_financier_access_external_principal_id",
        "external_financier_access",
        ["external_principal_id"],
        unique=False,
    )
    op.create_index(
        "ix_external_financier_access_financier_party_id", "external_financier_access", ["financier_party_id"], unique=False
    )
    op.create_index("ix_external_financier_access_access_scope", "external_financier_access", ["access_scope"], unique=False)

    op.create_table(
        "external_notes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("principal_type", sa.String(length=32), nullable=False),
        sa.Column("external_principal_id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("visibility", sa.String(length=32), nullable=False, server_default="external_only"),
        sa.Column("created_by_internal_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_internal_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["external_principal_id"], ["external_principals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_external_notes_tenant_id", "external_notes", ["tenant_id"], unique=False)
    op.create_index("ix_external_notes_external_principal_id", "external_notes", ["external_principal_id"], unique=False)
    op.create_index("ix_external_notes_entity_type", "external_notes", ["entity_type"], unique=False)
    op.create_index("ix_external_notes_entity_id", "external_notes", ["entity_id"], unique=False)

    op.create_table(
        "external_audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("external_principal_id", sa.Integer(), nullable=True),
        sa.Column("internal_user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("resource_type", sa.String(length=128), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.Column("details_json", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["external_principal_id"], ["external_principals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["internal_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_external_audit_logs_tenant_id", "external_audit_logs", ["tenant_id"], unique=False)
    op.create_index(
        "ix_external_audit_logs_external_principal_id", "external_audit_logs", ["external_principal_id"], unique=False
    )
    op.create_index("ix_external_audit_logs_action", "external_audit_logs", ["action"], unique=False)
    op.create_index("ix_external_audit_logs_created_at", "external_audit_logs", ["created_at"], unique=False)

    op.create_table(
        "external_invitations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("principal_type", sa.String(length=32), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("invited_by_user_id", sa.Integer(), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_external_invitations_tenant_id", "external_invitations", ["tenant_id"], unique=False)
    op.create_index("ix_external_invitations_principal_type", "external_invitations", ["principal_type"], unique=False)
    op.create_index("ix_external_invitations_email", "external_invitations", ["email"], unique=False)
    op.create_index("ix_external_invitations_expires_at", "external_invitations", ["expires_at"], unique=False)

    # Seed global external roles (idempotent; PostgreSQL)
    op.execute(
        sa.text(
            """
            INSERT INTO external_roles (code, name, principal_type, description) VALUES
            ('customer_viewer', 'Customer Viewer', 'customer',
             'Read-only customer portal access'),
            ('customer_collaborator', 'Customer Collaborator', 'customer',
             'Viewer plus external notes on allowed records'),
            ('financier_viewer', 'Financier Viewer', 'financier',
             'Read-only financier confidence dashboard'),
            ('financier_analyst', 'Financier Analyst', 'financier',
             'Deeper read-only reports and exports when enabled')
            ON CONFLICT (code) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_external_invitations_expires_at", table_name="external_invitations")
    op.drop_index("ix_external_invitations_email", table_name="external_invitations")
    op.drop_index("ix_external_invitations_principal_type", table_name="external_invitations")
    op.drop_index("ix_external_invitations_tenant_id", table_name="external_invitations")
    op.drop_table("external_invitations")

    op.drop_index("ix_external_audit_logs_created_at", table_name="external_audit_logs")
    op.drop_index("ix_external_audit_logs_action", table_name="external_audit_logs")
    op.drop_index("ix_external_audit_logs_external_principal_id", table_name="external_audit_logs")
    op.drop_index("ix_external_audit_logs_tenant_id", table_name="external_audit_logs")
    op.drop_table("external_audit_logs")

    op.drop_index("ix_external_notes_entity_id", table_name="external_notes")
    op.drop_index("ix_external_notes_entity_type", table_name="external_notes")
    op.drop_index("ix_external_notes_external_principal_id", table_name="external_notes")
    op.drop_index("ix_external_notes_tenant_id", table_name="external_notes")
    op.drop_table("external_notes")

    op.drop_index("ix_external_financier_access_access_scope", table_name="external_financier_access")
    op.drop_index("ix_external_financier_access_financier_party_id", table_name="external_financier_access")
    op.drop_index("ix_external_financier_access_external_principal_id", table_name="external_financier_access")
    op.drop_index("ix_external_financier_access_tenant_id", table_name="external_financier_access")
    op.drop_table("external_financier_access")

    op.drop_index("ix_external_customer_access_customer_id", table_name="external_customer_access")
    op.drop_index("ix_external_customer_access_external_principal_id", table_name="external_customer_access")
    op.drop_index("ix_external_customer_access_tenant_id", table_name="external_customer_access")
    op.drop_table("external_customer_access")

    op.drop_index("ix_external_principal_roles_role_id", table_name="external_principal_roles")
    op.drop_index("ix_external_principal_roles_external_principal_id", table_name="external_principal_roles")
    op.drop_table("external_principal_roles")

    op.drop_index("ix_external_principals_email", table_name="external_principals")
    op.drop_index("ix_external_principals_principal_type", table_name="external_principals")
    op.drop_index("ix_external_principals_tenant_id", table_name="external_principals")
    op.drop_table("external_principals")

    op.drop_index("ix_external_roles_principal_type", table_name="external_roles")
    op.drop_index("ix_external_roles_code", table_name="external_roles")
    op.drop_table("external_roles")
