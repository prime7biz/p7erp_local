"""User authority classes foundation (Super Admin + Class 1-4).

Additive only. Nothing changes behaviour while ``user_authority_classes_v1`` is OFF.

* Nullable ``users.authority_class`` and ``users.is_tenant_super_admin``
* Unique partial index: at most one Super Admin per tenant
* ``user_module_grants`` + RLS ``p7_tenant_isolation``

Rollback: flag off, then ``alembic downgrade 306``.

Revision ID: 307
Revises: 306
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "307"
down_revision: Union[str, None] = "306"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"
GRANTS_TABLE = "user_module_grants"
AUTHORITY_CLASSES = ("SUPER", "CLASS_1", "CLASS_2", "CLASS_3", "CLASS_4")


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _enable_rls(table: str) -> None:
    expr = " OR ".join(f"({p})" for p in (_RLS_BYPASS, _RLS_SAME_TENANT))
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(
        f"CREATE POLICY {RLS_POLICY_NAME} ON {table} AS PERMISSIVE FOR ALL "
        f"USING ({expr}) WITH CHECK ({expr})"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.add_column("users", sa.Column("authority_class", sa.String(16), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "is_tenant_super_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_check_constraint(
        "ck_users_authority_class",
        "users",
        f"authority_class IS NULL OR authority_class IN ({_in(AUTHORITY_CLASSES)})",
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_users_one_tenant_super_admin "
        "ON users (tenant_id) WHERE is_tenant_super_admin IS TRUE"
    )
    op.create_index("ix_users_tenant_authority_class", "users", ["tenant_id", "authority_class"])

    op.create_table(
        GRANTS_TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("module_code", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "user_id", "module_code", name="uq_user_module_grants_tenant_user_module"),
    )
    op.create_index(f"ix_{GRANTS_TABLE}_tenant_id", GRANTS_TABLE, ["tenant_id"])
    op.create_index(f"ix_{GRANTS_TABLE}_tenant_user", GRANTS_TABLE, ["tenant_id", "user_id"])
    _enable_rls(GRANTS_TABLE)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {GRANTS_TABLE}")
    op.execute(f"ALTER TABLE {GRANTS_TABLE} DISABLE ROW LEVEL SECURITY")
    op.drop_table(GRANTS_TABLE)
    op.drop_index("ix_users_tenant_authority_class", table_name="users")
    op.execute("DROP INDEX IF EXISTS uq_users_one_tenant_super_admin")
    op.drop_constraint("ck_users_authority_class", "users", type_="check")
    op.drop_column("users", "is_tenant_super_admin")
    op.drop_column("users", "authority_class")
