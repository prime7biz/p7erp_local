"""Customer portal quotation responses (ACCEPT / REQUEST_REVISION) + RLS.

Additive, behind tenant flag ``customer_portal_quotations_enabled`` (default OFF).
A response never changes the quotation status; staff are notified and decide.

Rollback: ``alembic downgrade 336`` (export rows first).

Revision ID: 337
Revises: 336
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "337"
down_revision: Union[str, None] = "336"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "external_quotation_responses"
RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"


def upgrade() -> None:
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quotation_id", sa.Integer(), sa.ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "external_principal_id",
            sa.Integer(),
            sa.ForeignKey("external_principals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("response_type", sa.String(24), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "external_principal_id", "request_id", name="uq_ext_quotation_resp_request"),
        sa.CheckConstraint("response_type IN ('ACCEPT','REQUEST_REVISION')", name="ck_ext_quotation_resp_type"),
    )
    op.create_index("ix_ext_quotation_resp_tenant", TABLE, ["tenant_id"])
    op.create_index("ix_ext_quotation_resp_quotation", TABLE, ["quotation_id"])
    expr = f"({_RLS_BYPASS}) OR ({_RLS_SAME_TENANT})"
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {TABLE}")
    op.execute(f"CREATE POLICY {RLS_POLICY_NAME} ON {TABLE} AS PERMISSIVE FOR ALL USING ({expr}) WITH CHECK ({expr})")
    op.execute(f"ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {TABLE}")
    op.drop_index("ix_ext_quotation_resp_quotation", table_name=TABLE)
    op.drop_index("ix_ext_quotation_resp_tenant", table_name=TABLE)
    op.drop_table(TABLE)
