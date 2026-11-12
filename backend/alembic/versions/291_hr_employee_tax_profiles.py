"""Bangladesh salary income tax (TDS) profiles per employee.

* ``hr_employee_tax_profiles`` (new tenant table, RLS policy ``p7_tenant_isolation`` as in 270; guarded
  by tests/test_rls_policies.py): one row per employee with TIN, category override and evidence,
  declared investment (rebate), fixed monthly TDS override and an opening year-to-date balance with
  a cutoff date.

Nothing changes for existing payroll: the company flag ``hr_bd_salary_tds_enabled`` stays OFF.

Rollback: ``alembic downgrade 290`` drops the table. Export the table first: profiles, TINs and
overrides are lost. It does not undo payroll deductions already frozen in payroll snapshots or
posted vouchers (reverse those through the voucher reversal workflow).

Revision ID: 291
Revises: 290
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "291"
down_revision: Union[str, None] = "290"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLE = "hr_employee_tax_profiles"


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
    money = sa.Numeric(precision=18, scale=4)
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("tds_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("tin_number", sa.String(length=32), nullable=True),
        sa.Column("tax_circle", sa.String(length=64), nullable=True),
        sa.Column("tax_zone", sa.String(length=64), nullable=True),
        sa.Column("tax_category_override", sa.String(length=24), nullable=False, server_default="AUTO"),
        sa.Column("category_evidence_reference", sa.String(length=255), nullable=True),
        sa.Column("disabled_children_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_first_time_taxpayer", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("rebate_mode", sa.String(length=24), nullable=False, server_default="NONE"),
        sa.Column("declared_annual_investment", money, nullable=True),
        sa.Column("monthly_tds_override", money, nullable=True),
        sa.Column("opening_ytd_gross", money, nullable=True),
        sa.Column("opening_ytd_tds", money, nullable=True),
        sa.Column("opening_income_year_start", sa.Date(), nullable=True),
        sa.Column("opening_through_date", sa.Date(), nullable=True),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "tax_category_override IN ('AUTO','GENERAL','FEMALE','SENIOR_65','DISABLED','THIRD_GENDER','FREEDOM_FIGHTER')",
            name="ck_hr_emp_tax_profile_category",
        ),
        sa.CheckConstraint("rebate_mode IN ('DECLARED_INVESTMENT','NONE')", name="ck_hr_emp_tax_profile_rebate"),
        sa.CheckConstraint("disabled_children_count >= 0", name="ck_hr_emp_tax_profile_children"),
        sa.CheckConstraint(
            "(declared_annual_investment IS NULL OR declared_annual_investment >= 0) AND "
            "(monthly_tds_override IS NULL OR monthly_tds_override >= 0) AND "
            "(opening_ytd_gross IS NULL OR opening_ytd_gross >= 0) AND "
            "(opening_ytd_tds IS NULL OR opening_ytd_tds >= 0)",
            name="ck_hr_emp_tax_profile_amounts",
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "employee_id", name="uq_hr_employee_tax_profile"),
    )
    op.create_index(op.f("ix_hr_employee_tax_profiles_tenant_id"), TABLE, ["tenant_id"], unique=False)
    op.create_index(op.f("ix_hr_employee_tax_profiles_employee_id"), TABLE, ["employee_id"], unique=False)
    _enable_rls(TABLE)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _disable_rls(TABLE)
    op.drop_index(op.f("ix_hr_employee_tax_profiles_employee_id"), table_name=TABLE)
    op.drop_index(op.f("ix_hr_employee_tax_profiles_tenant_id"), table_name=TABLE)
    op.drop_table(TABLE)
