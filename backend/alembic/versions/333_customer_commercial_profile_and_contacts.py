"""Customer commercial profile columns + customer_contacts (+ RLS).

Plan called this revision 328 after 327; local chain already has 328–332
(hourly slot / machine taxonomy / cutting / floor / finishing), so this ships
as 333 after 332. Schema and RLS contract match the approved plan.

Rollback: ``alembic downgrade 332``.

Revision ID: 333
Revises: 332
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "333"
down_revision: Union[str, None] = "332"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLES = ("customer_contacts",)


def _enable_rls(table: str) -> None:
    expr = " OR ".join(f"({p})" for p in (_RLS_BYPASS, _RLS_SAME_TENANT))
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(
        f"CREATE POLICY {RLS_POLICY_NAME} ON {table} AS PERMISSIVE FOR ALL USING ({expr}) WITH CHECK ({expr})"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def _disable_rls(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    op.add_column("customers", sa.Column("payment_terms", sa.String(128), nullable=True))
    op.add_column("customers", sa.Column("default_incoterm", sa.String(32), nullable=True))
    op.add_column("customers", sa.Column("typical_lead_time_days", sa.Integer(), nullable=True))
    op.add_column("customers", sa.Column("industry_segment", sa.String(64), nullable=True))
    op.add_column("customers", sa.Column("compliance_level", sa.String(64), nullable=True))
    op.add_column("customers", sa.Column("credit_limit", sa.Numeric(18, 4), nullable=True))
    op.add_column("customers", sa.Column("notes", sa.Text(), nullable=True))

    op.create_table(
        "customer_contacts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "customer_id",
            sa.Integer(),
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("designation", sa.String(128), nullable=True),
        sa.Column("department", sa.String(64), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("whatsapp", sa.String(64), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index(
        "ix_customer_contacts_tenant_customer",
        "customer_contacts",
        ["tenant_id", "customer_id"],
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_customer_contacts_one_primary
        ON customer_contacts (tenant_id, customer_id)
        WHERE is_primary IS TRUE AND is_active IS TRUE
        """
    )

    for table in TABLES:
        _enable_rls(table)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in reversed(TABLES):
        _disable_rls(table)
    op.execute("DROP INDEX IF EXISTS uq_customer_contacts_one_primary")
    op.drop_index("ix_customer_contacts_tenant_customer", table_name="customer_contacts")
    op.drop_table("customer_contacts")
    op.drop_column("customers", "notes")
    op.drop_column("customers", "credit_limit")
    op.drop_column("customers", "compliance_level")
    op.drop_column("customers", "industry_segment")
    op.drop_column("customers", "typical_lead_time_days")
    op.drop_column("customers", "default_incoterm")
    op.drop_column("customers", "payment_terms")
