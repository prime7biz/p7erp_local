"""Unified auth: tenant contact fields, staff invitations, user email uniqueness.

Revision ID: 150
Revises: 149
Create Date: 2026-04-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "150"
down_revision: Union[str, None] = "149"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column("phone", sa.String(length=50), nullable=True))

    op.alter_column("users", "username", existing_type=sa.String(length=128), nullable=True)

    op.add_column(
        "users",
        sa.Column("invited_by_user_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_invited_by_user_id_users",
        "users",
        "users",
        ["invited_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_users_invited_by_user_id", "users", ["invited_by_user_id"], unique=False)

    op.create_unique_constraint("uq_users_tenant_email", "users", ["tenant_id", "email"])

    op.create_table(
        "staff_invitations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("first_name", sa.String(length=128), nullable=True),
        sa.Column("last_name", sa.String(length=128), nullable=True),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("invited_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_staff_invitations_tenant_id", "staff_invitations", ["tenant_id"], unique=False)
    op.create_index("ix_staff_invitations_email", "staff_invitations", ["email"], unique=False)
    op.create_index("ix_staff_invitations_expires_at", "staff_invitations", ["expires_at"], unique=False)
    op.create_index(
        "ix_staff_invitations_tenant_email",
        "staff_invitations",
        ["tenant_id", "email"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_staff_invitations_tenant_email", table_name="staff_invitations")
    op.drop_index("ix_staff_invitations_expires_at", table_name="staff_invitations")
    op.drop_index("ix_staff_invitations_email", table_name="staff_invitations")
    op.drop_index("ix_staff_invitations_tenant_id", table_name="staff_invitations")
    op.drop_table("staff_invitations")

    op.drop_constraint("uq_users_tenant_email", "users", type_="unique")

    op.drop_index("ix_users_invited_by_user_id", table_name="users")
    op.drop_constraint("fk_users_invited_by_user_id_users", "users", type_="foreignkey")
    op.drop_column("users", "invited_by_user_id")

    op.alter_column("users", "username", existing_type=sa.String(length=128), nullable=False)

    op.drop_column("tenants", "phone")
    op.drop_column("tenants", "address")
