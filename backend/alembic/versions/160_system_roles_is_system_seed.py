"""System roles: is_system flag + seed canonical roles per tenant.

Revision ID: 160
Revises: 159
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "160"
down_revision: Union[str, None] = "159"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SYSTEM_NAMES = (
    "admin",
    "owner",
    "manager",
    "merchandiser",
    "planner",
    "supervisor",
    "operator",
    "finance",
    "user",
)

_DISPLAY = {
    "admin": "Admin",
    "owner": "Owner",
    "manager": "Manager",
    "merchandiser": "Merchandiser",
    "planner": "Planner",
    "supervisor": "Supervisor",
    "operator": "Operator",
    "finance": "Finance",
    "user": "User",
}


def upgrade() -> None:
    op.add_column(
        "roles",
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    conn = op.get_bind()

    # Mark existing rows that match canonical names as system roles
    names_sql = ", ".join(f"'{n}'" for n in _SYSTEM_NAMES)
    conn.execute(sa.text(f"UPDATE roles SET is_system = true WHERE lower(name) IN ({names_sql})"))

    # Insert missing system roles for every tenant (idempotent).
    # Use distinct bind param names for the same value — asyncpg rejects reusing one name
    # in SELECT vs WHERE (text vs varchar inference).
    for name in _SYSTEM_NAMES:
        display = _DISPLAY[name]
        conn.execute(
            sa.text(
                """
                INSERT INTO roles (tenant_id, name, display_name, permissions, is_system)
                SELECT t.id, :n_sel, :d_sel, CAST('{}' AS JSON), true
                FROM tenants t
                WHERE NOT EXISTS (
                    SELECT 1 FROM roles r
                    WHERE r.tenant_id = t.id AND lower(r.name) = lower(:n_chk)
                )
                """
            ),
            {"n_sel": name, "d_sel": display, "n_chk": name},
        )

    op.alter_column("roles", "is_system", server_default=None)


def downgrade() -> None:
    op.drop_column("roles", "is_system")
