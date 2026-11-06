"""Bangladesh RMG Phase C: employee wage assignments, earned-leave accruals, maternity cases,
festival-work entries and service-benefit cases. Behaviour changes only when each strict
``hr_bd_*_enabled`` tenant flag is ON. ``hr_bd_festival_work_entries.final_settlement_id`` is added in 287.

Every new table gets the tenant Row-Level Security policy ``p7_tenant_isolation`` in this revision
(same expression as 270; tests/test_rls_policies.py checks it).

Rollback: ``alembic downgrade 282`` drops what this revision created (children first). A production
downgrade needs a fresh backup and zero-reference checks first (docs/hr-compliance/RUNBOOK.md).

Revision ID: 283
Revises: 282
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "283"
down_revision: Union[str, None] = "282"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Copied from 270_tenant_rls_policies.py (migrations stay frozen, so no cross-file import).
RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"


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
    op.create_table('hr_bd_employee_wage_assignments',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('wage_rate_id', sa.Integer(), nullable=False),
    sa.Column('effective_from', sa.Date(), nullable=False),
    sa.Column('effective_to', sa.Date(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('ended_by', sa.Integer(), nullable=True),
    sa.Column('ended_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint('effective_to IS NULL OR effective_to >= effective_from', name='ck_hr_bd_wage_assign_dates'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['ended_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['wage_rate_id'], ['hr_bd_wage_schedule_rates.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'employee_id', 'effective_from', name='uq_hr_bd_wage_assign_employee_start')
    )
    op.create_index(op.f('ix_hr_bd_employee_wage_assignments_tenant_id'), 'hr_bd_employee_wage_assignments', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_hr_bd_employee_wage_assignments_wage_rate_id'), 'hr_bd_employee_wage_assignments', ['wage_rate_id'], unique=False)
    op.create_index('ix_hr_bd_wage_assign_tenant_employee', 'hr_bd_employee_wage_assignments', ['tenant_id', 'employee_id'], unique=False)
    _enable_rls('hr_bd_employee_wage_assignments')
    op.create_table('hr_bd_leave_accrual_entries',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('leave_type_id', sa.Integer(), nullable=False),
    sa.Column('balance_id', sa.Integer(), nullable=True),
    sa.Column('rule_set_id', sa.Integer(), nullable=True),
    sa.Column('source_period_start', sa.Date(), nullable=False),
    sa.Column('source_period_end', sa.Date(), nullable=False),
    sa.Column('worked_days', sa.Integer(), nullable=False),
    sa.Column('accrued_days', sa.Numeric(precision=9, scale=2), nullable=False),
    sa.Column('trace_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint('source_period_end >= source_period_start', name='ck_hr_bd_accrual_period'),
    sa.CheckConstraint('worked_days >= 0 AND accrued_days >= 0', name='ck_hr_bd_accrual_non_negative'),
    sa.ForeignKeyConstraint(['balance_id'], ['hr_leave_balances.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['leave_type_id'], ['hr_leave_types.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['rule_set_id'], ['hr_bd_rule_sets.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'employee_id', 'leave_type_id', 'source_period_start', 'source_period_end', name='uq_hr_bd_accrual_source_period')
    )
    op.create_index(op.f('ix_hr_bd_leave_accrual_entries_employee_id'), 'hr_bd_leave_accrual_entries', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_bd_leave_accrual_entries_tenant_id'), 'hr_bd_leave_accrual_entries', ['tenant_id'], unique=False)
    _enable_rls('hr_bd_leave_accrual_entries')
    op.create_table('hr_bd_maternity_cases',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('rule_set_id', sa.Integer(), nullable=True),
    sa.Column('expected_delivery_date', sa.Date(), nullable=False),
    sa.Column('actual_delivery_date', sa.Date(), nullable=True),
    sa.Column('leave_start', sa.Date(), nullable=False),
    sa.Column('leave_end', sa.Date(), nullable=False),
    sa.Column('service_start', sa.Date(), nullable=False),
    sa.Column('surviving_children', sa.Integer(), nullable=False),
    sa.Column('eligible', sa.Boolean(), nullable=False),
    sa.Column('eligibility_reason', sa.Text(), nullable=True),
    sa.Column('monthly_gross', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('daily_rate', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('benefit_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('calculation_trace', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('paid_by', sa.Integer(), nullable=True),
    sa.Column('paid_at', sa.DateTime(), nullable=True),
    sa.Column('payment_reference', sa.String(length=64), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("status IN ('DRAFT','ELIGIBLE','INELIGIBLE','APPROVED','PAID','CANCELLED')", name='ck_hr_bd_maternity_status'),
    sa.CheckConstraint('leave_end >= leave_start', name='ck_hr_bd_maternity_dates'),
    sa.CheckConstraint('surviving_children >= 0', name='ck_hr_bd_maternity_children'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['paid_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['rule_set_id'], ['hr_bd_rule_sets.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_hr_bd_maternity_cases_employee_id'), 'hr_bd_maternity_cases', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_bd_maternity_cases_tenant_id'), 'hr_bd_maternity_cases', ['tenant_id'], unique=False)
    op.create_index('uq_hr_bd_maternity_one_open', 'hr_bd_maternity_cases', ['tenant_id', 'employee_id'], unique=True, postgresql_where=sa.text("status IN ('DRAFT','ELIGIBLE','INELIGIBLE','APPROVED')"))
    _enable_rls('hr_bd_maternity_cases')
    op.create_table('hr_bd_festival_work_entries',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('holiday_id', sa.Integer(), nullable=False),
    sa.Column('attendance_entry_id', sa.Integer(), nullable=False),
    sa.Column('rule_set_id', sa.Integer(), nullable=True),
    sa.Column('work_date', sa.Date(), nullable=False),
    sa.Column('alternative_holiday_date', sa.Date(), nullable=True),
    sa.Column('alternative_holiday_status', sa.String(length=16), nullable=False),
    sa.Column('compensation_days', sa.Numeric(precision=9, scale=2), nullable=False),
    sa.Column('compensation_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('payroll_run_line_id', sa.Integer(), nullable=True),
    sa.Column('trace_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("alternative_holiday_status IN ('PENDING','SCHEDULED','TAKEN')", name='ck_hr_bd_festival_alt_status'),
    sa.CheckConstraint("status IN ('PENDING','APPROVED','CANCELLED')", name='ck_hr_bd_festival_work_status'),
    sa.CheckConstraint('compensation_days >= 0 AND compensation_amount >= 0', name='ck_hr_bd_festival_non_negative'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['attendance_entry_id'], ['hr_attendance_entries.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['holiday_id'], ['hr_attendance_holidays.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['payroll_run_line_id'], ['hr_payroll_run_lines.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['rule_set_id'], ['hr_bd_rule_sets.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'employee_id', 'holiday_id', 'attendance_entry_id', name='uq_hr_bd_festival_work_source')
    )
    op.create_index(op.f('ix_hr_bd_festival_work_entries_employee_id'), 'hr_bd_festival_work_entries', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_bd_festival_work_entries_payroll_run_line_id'), 'hr_bd_festival_work_entries', ['payroll_run_line_id'], unique=False)
    op.create_index(op.f('ix_hr_bd_festival_work_entries_tenant_id'), 'hr_bd_festival_work_entries', ['tenant_id'], unique=False)
    _enable_rls('hr_bd_festival_work_entries')
    op.create_table('hr_bd_service_benefit_cases',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('rule_set_id', sa.Integer(), nullable=True),
    sa.Column('benefit_type', sa.String(length=24), nullable=False),
    sa.Column('service_start_date', sa.Date(), nullable=False),
    sa.Column('service_end_date', sa.Date(), nullable=False),
    sa.Column('service_days', sa.Integer(), nullable=False),
    sa.Column('wage_basis', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('calculation_trace', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('paid_at', sa.DateTime(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("benefit_type IN ('RESIGNATION','DEEMED_RESIGNATION','TERMINATION','RETRENCHMENT','DISMISSAL','RETIREMENT','DEATH')", name='ck_hr_bd_benefit_type'),
    sa.CheckConstraint("status IN ('DRAFT','APPROVED','PAID','CANCELLED')", name='ck_hr_bd_benefit_status'),
    sa.CheckConstraint('amount >= 0', name='ck_hr_bd_benefit_amount'),
    sa.CheckConstraint('service_end_date >= service_start_date', name='ck_hr_bd_benefit_dates'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['rule_set_id'], ['hr_bd_rule_sets.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'employee_id', 'benefit_type', 'service_end_date', name='uq_hr_bd_benefit_case')
    )
    op.create_index(op.f('ix_hr_bd_service_benefit_cases_employee_id'), 'hr_bd_service_benefit_cases', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_bd_service_benefit_cases_tenant_id'), 'hr_bd_service_benefit_cases', ['tenant_id'], unique=False)
    _enable_rls('hr_bd_service_benefit_cases')


def downgrade() -> None:
    _disable_rls('hr_bd_service_benefit_cases')
    op.drop_index('ix_hr_bd_service_benefit_cases_tenant_id', table_name='hr_bd_service_benefit_cases')
    op.drop_index('ix_hr_bd_service_benefit_cases_employee_id', table_name='hr_bd_service_benefit_cases')
    op.drop_table('hr_bd_service_benefit_cases')
    _disable_rls('hr_bd_festival_work_entries')
    op.drop_index('ix_hr_bd_festival_work_entries_tenant_id', table_name='hr_bd_festival_work_entries')
    op.drop_index('ix_hr_bd_festival_work_entries_payroll_run_line_id', table_name='hr_bd_festival_work_entries')
    op.drop_index('ix_hr_bd_festival_work_entries_employee_id', table_name='hr_bd_festival_work_entries')
    op.drop_table('hr_bd_festival_work_entries')
    _disable_rls('hr_bd_maternity_cases')
    op.drop_index('uq_hr_bd_maternity_one_open', table_name='hr_bd_maternity_cases', postgresql_where=sa.text("status IN ('DRAFT','ELIGIBLE','INELIGIBLE','APPROVED')"))
    op.drop_index('ix_hr_bd_maternity_cases_tenant_id', table_name='hr_bd_maternity_cases')
    op.drop_index('ix_hr_bd_maternity_cases_employee_id', table_name='hr_bd_maternity_cases')
    op.drop_table('hr_bd_maternity_cases')
    _disable_rls('hr_bd_leave_accrual_entries')
    op.drop_index('ix_hr_bd_leave_accrual_entries_tenant_id', table_name='hr_bd_leave_accrual_entries')
    op.drop_index('ix_hr_bd_leave_accrual_entries_employee_id', table_name='hr_bd_leave_accrual_entries')
    op.drop_table('hr_bd_leave_accrual_entries')
    _disable_rls('hr_bd_employee_wage_assignments')
    op.drop_index('ix_hr_bd_wage_assign_tenant_employee', table_name='hr_bd_employee_wage_assignments')
    op.drop_index('ix_hr_bd_employee_wage_assignments_wage_rate_id', table_name='hr_bd_employee_wage_assignments')
    op.drop_index('ix_hr_bd_employee_wage_assignments_tenant_id', table_name='hr_bd_employee_wage_assignments')
    op.drop_table('hr_bd_employee_wage_assignments')
