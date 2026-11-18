"""COA ledger interest (Asset + Liability).

Additive only. Nothing accrues while ``coa_ledger_interest_v1`` is OFF.

* Interest policy columns on ``chart_of_accounts`` (nullable / default false)
* ``coa_interest_accruals`` history + idempotency (unique tenant/account/period)
* RLS ``p7_tenant_isolation`` on the new table

Rollback: flag off, export accruals, ``alembic downgrade 305``.

Revision ID: 306
Revises: 305
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "306"
down_revision: Union[str, None] = "305"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"
TABLE = "coa_interest_accruals"


def _enable_rls(table: str) -> None:
    expr = " OR ".join(f"({p})" for p in (_RLS_BYPASS, _RLS_SAME_TENANT))
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(
        f"CREATE POLICY {RLS_POLICY_NAME} ON {table} AS PERMISSIVE FOR ALL "
        f"USING ({expr}) WITH CHECK ({expr})"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def _disable_rls(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    op.add_column(
        "chart_of_accounts",
        sa.Column("interest_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("chart_of_accounts", sa.Column("interest_basis", sa.String(length=16), nullable=True))
    op.add_column("chart_of_accounts", sa.Column("interest_method", sa.String(length=24), nullable=True))
    op.add_column("chart_of_accounts", sa.Column("interest_frequency", sa.String(length=16), nullable=True))
    op.add_column(
        "chart_of_accounts",
        sa.Column("interest_rate_yearly", sa.Numeric(precision=8, scale=4), nullable=True),
    )
    op.add_column(
        "chart_of_accounts",
        sa.Column("interest_amount", sa.Numeric(precision=18, scale=4), nullable=True),
    )
    op.add_column(
        "chart_of_accounts",
        sa.Column(
            "interest_counterpart_account_id",
            sa.Integer(),
            sa.ForeignKey("chart_of_accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("chart_of_accounts", sa.Column("interest_activation_date", sa.Date(), nullable=True))
    op.create_index(
        "ix_chart_of_accounts_tenant_interest_enabled",
        "chart_of_accounts",
        ["tenant_id", "interest_enabled"],
    )

    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "account_id",
            sa.Integer(),
            sa.ForeignKey("chart_of_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period_key", sa.String(length=16), nullable=False),
        sa.Column("accrual_date", sa.Date(), nullable=False),
        sa.Column("base_balance", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("proration_factor", sa.Numeric(precision=18, scale=8), nullable=False, server_default="1"),
        sa.Column("interest_amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column(
            "journal_voucher_id",
            sa.Integer(),
            sa.ForeignKey("vouchers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "account_id", "period_key", name="uq_coa_interest_accruals_tenant_acct_period"),
    )
    op.create_index("ix_coa_interest_accruals_tenant_id", TABLE, ["tenant_id"])
    op.create_index("ix_coa_interest_accruals_account_id", TABLE, ["account_id"])
    op.create_index("ix_coa_interest_accruals_period_key", TABLE, ["period_key"])
    op.create_index("ix_coa_interest_accruals_status", TABLE, ["status"])
    op.create_index("ix_coa_interest_accruals_journal_voucher_id", TABLE, ["journal_voucher_id"])
    _enable_rls(TABLE)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _disable_rls(TABLE)
    op.drop_table(TABLE)
    op.drop_index("ix_chart_of_accounts_tenant_interest_enabled", table_name="chart_of_accounts")
    op.drop_column("chart_of_accounts", "interest_activation_date")
    op.drop_column("chart_of_accounts", "interest_counterpart_account_id")
    op.drop_column("chart_of_accounts", "interest_amount")
    op.drop_column("chart_of_accounts", "interest_rate_yearly")
    op.drop_column("chart_of_accounts", "interest_frequency")
    op.drop_column("chart_of_accounts", "interest_method")
    op.drop_column("chart_of_accounts", "interest_basis")
    op.drop_column("chart_of_accounts", "interest_enabled")
