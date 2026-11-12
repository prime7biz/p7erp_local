"""Employee salary change metadata, per-employee overtime / allowance switches, Lunch + Friday bills.

* ``hr_payroll_employee_structure_assignments``: nullable ``change_type`` (JOINING / INCREMENT /
  PROMOTION / CORRECTION) and ``change_note``.
* ``hr_employee_pay_benefits`` (new tenant table, RLS policy ``p7_tenant_isolation``, same expression
  as 270; tests/test_rls_policies.py checks it): one row per employee and benefit code (OVERTIME,
  FRIDAY, TIFFIN, LUNCH, DINNER, NIGHT). No row means "enabled at the company rate", so existing
  employees keep today's behaviour. OVERTIME never carries an amount (CHECK).
* ``hr_allowance_rules``: bill types LUNCH and FRIDAY, eligibility basis WEEKLY_HOLIDAY.

Rollback: ``alembic downgrade 289``. It refuses while any allowance rule uses LUNCH, FRIDAY or
WEEKLY_HOLIDAY (delete or retire-and-delete those rules first), then drops the benefits table
and the two assignment columns. Per-employee switches are lost, so overtime becomes payable again
for employees whose overtime was switched off: export ``hr_employee_pay_benefits`` first and
re-apply the OFF switches after upgrading again.

Revision ID: 290
Revises: 289
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "290"
down_revision: Union[str, None] = "289"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Copied from 270_tenant_rls_policies.py (migrations stay frozen, so no cross-file import).
RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

ASSIGNMENTS = "hr_payroll_employee_structure_assignments"
BENEFITS = "hr_employee_pay_benefits"
RULES = "hr_allowance_rules"

OLD_BILL_TYPES = "bill_type IN ('TIFFIN','DINNER','NIGHT')"
NEW_BILL_TYPES = "bill_type IN ('TIFFIN','LUNCH','DINNER','NIGHT','FRIDAY')"
OLD_BASIS = "eligibility_basis IN ('PRESENT','NIGHT_SHIFT','MIN_WORK_MINUTES','MIN_OT_MINUTES')"
NEW_BASIS = "eligibility_basis IN ('PRESENT','NIGHT_SHIFT','MIN_WORK_MINUTES','MIN_OT_MINUTES','WEEKLY_HOLIDAY')"


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

    op.add_column(ASSIGNMENTS, sa.Column("change_type", sa.String(length=16), nullable=True))
    op.add_column(ASSIGNMENTS, sa.Column("change_note", sa.Text(), nullable=True))
    op.create_check_constraint(
        "ck_hr_pay_emp_struct_asgn_change_type",
        ASSIGNMENTS,
        "change_type IS NULL OR change_type IN ('JOINING','INCREMENT','PROMOTION','CORRECTION')",
    )

    op.create_table(
        BENEFITS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("benefit_code", sa.String(length=16), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("amount_override", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "benefit_code IN ('OVERTIME','FRIDAY','TIFFIN','LUNCH','DINNER','NIGHT')",
            name="ck_hr_employee_pay_benefit_code",
        ),
        sa.CheckConstraint(
            "amount_override IS NULL OR amount_override >= 0", name="ck_hr_employee_pay_benefit_amount"
        ),
        sa.CheckConstraint(
            "benefit_code <> 'OVERTIME' OR amount_override IS NULL", name="ck_hr_employee_pay_benefit_ot_amount"
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "employee_id", "benefit_code", name="uq_hr_employee_pay_benefit"),
    )
    op.create_index(op.f("ix_hr_employee_pay_benefits_tenant_id"), BENEFITS, ["tenant_id"], unique=False)
    op.create_index(op.f("ix_hr_employee_pay_benefits_employee_id"), BENEFITS, ["employee_id"], unique=False)
    _enable_rls(BENEFITS)

    op.drop_constraint("ck_hr_allowance_rule_type", RULES, type_="check")
    op.create_check_constraint("ck_hr_allowance_rule_type", RULES, NEW_BILL_TYPES)
    op.drop_constraint("ck_hr_allowance_rule_basis", RULES, type_="check")
    op.create_check_constraint("ck_hr_allowance_rule_basis", RULES, NEW_BASIS)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    bind = op.get_bind()
    in_use = bind.execute(
        sa.text(
            f"SELECT count(*) FROM {RULES} "
            "WHERE bill_type IN ('LUNCH','FRIDAY') OR eligibility_basis = 'WEEKLY_HOLIDAY'"
        )
    ).scalar()
    if in_use:
        raise RuntimeError(
            f"{in_use} allowance rule(s) use LUNCH, FRIDAY or WEEKLY_HOLIDAY. "
            "Delete those rules (and their allowance entries) before downgrading revision 290."
        )

    op.drop_constraint("ck_hr_allowance_rule_basis", RULES, type_="check")
    op.create_check_constraint("ck_hr_allowance_rule_basis", RULES, OLD_BASIS)
    op.drop_constraint("ck_hr_allowance_rule_type", RULES, type_="check")
    op.create_check_constraint("ck_hr_allowance_rule_type", RULES, OLD_BILL_TYPES)

    _disable_rls(BENEFITS)
    op.drop_index(op.f("ix_hr_employee_pay_benefits_employee_id"), table_name=BENEFITS)
    op.drop_index(op.f("ix_hr_employee_pay_benefits_tenant_id"), table_name=BENEFITS)
    op.drop_table(BENEFITS)

    op.drop_constraint("ck_hr_pay_emp_struct_asgn_change_type", ASSIGNMENTS, type_="check")
    op.drop_column(ASSIGNMENTS, "change_note")
    op.drop_column(ASSIGNMENTS, "change_type")
