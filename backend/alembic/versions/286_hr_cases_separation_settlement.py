"""Notices / memos / absence and disciplinary cases (append-only events), separations, clearance,
final settlements, payroll document snapshots and wage acknowledgements.

Every new table gets the tenant Row-Level Security policy ``p7_tenant_isolation`` in this revision
(same expression as 270; tests/test_rls_policies.py checks it).

Rollback: ``alembic downgrade 285`` drops what this revision created (children first). A production
downgrade needs a fresh backup and zero-reference checks first (docs/hr-compliance/RUNBOOK.md).

Revision ID: 286
Revises: 285
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "286"
down_revision: Union[str, None] = "285"
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
    op.create_table('hr_employee_cases',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('case_no', sa.String(length=32), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('case_type', sa.String(length=16), nullable=False),
    sa.Column('subject', sa.String(length=255), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('body_bn', sa.Text(), nullable=True),
    sa.Column('allegation', sa.Text(), nullable=True),
    sa.Column('first_absent_date', sa.Date(), nullable=True),
    sa.Column('issue_date', sa.Date(), nullable=True),
    sa.Column('reply_due_date', sa.Date(), nullable=True),
    sa.Column('defence_notice_date', sa.Date(), nullable=True),
    sa.Column('defence_due_date', sa.Date(), nullable=True),
    sa.Column('hearing_date', sa.Date(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('decision', sa.String(length=32), nullable=True),
    sa.Column('decision_note', sa.Text(), nullable=True),
    sa.Column('issued_by', sa.Integer(), nullable=True),
    sa.Column('decided_by', sa.Integer(), nullable=True),
    sa.Column('decided_at', sa.DateTime(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("case_type <> 'ABSENCE' OR first_absent_date IS NOT NULL", name='ck_hr_case_absence_date'),
    sa.CheckConstraint("case_type IN ('NOTICE','SHOW_CAUSE','WARNING','MEMO','ABSENCE','DISCIPLINARY')", name='ck_hr_case_type'),
    sa.CheckConstraint("status IN ('DRAFT','ISSUED','RESPONDED','DEFENCE_NOTICE','HEARING','DECIDED','CLOSED','CANCELLED')", name='ck_hr_case_status'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['decided_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['issued_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'case_no', name='uq_hr_employee_case_no')
    )
    op.create_index(op.f('ix_hr_employee_cases_employee_id'), 'hr_employee_cases', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_employee_cases_tenant_id'), 'hr_employee_cases', ['tenant_id'], unique=False)
    _enable_rls('hr_employee_cases')
    op.create_table('hr_employee_case_events',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('event_type', sa.String(length=32), nullable=False),
    sa.Column('event_date', sa.Date(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('evidence_ref', sa.String(length=255), nullable=True),
    sa.Column('actor_user_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("event_type IN ('ISSUED','DELIVERY_ATTEMPT','DELIVERED','RESPONSE','REJOINED','DEFENCE_NOTICE_ISSUED','HEARING','EXTENSION','DECISION','CANCELLED')", name='ck_hr_case_event_type'),
    sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['case_id'], ['hr_employee_cases.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_hr_employee_case_events_case_id'), 'hr_employee_case_events', ['case_id'], unique=False)
    op.create_index(op.f('ix_hr_employee_case_events_tenant_id'), 'hr_employee_case_events', ['tenant_id'], unique=False)
    _enable_rls('hr_employee_case_events')
    op.create_table('hr_separations',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('separation_type', sa.String(length=24), nullable=False),
    sa.Column('request_date', sa.Date(), nullable=False),
    sa.Column('last_working_date', sa.Date(), nullable=False),
    sa.Column('effective_date', sa.Date(), nullable=False),
    sa.Column('notice_days_required', sa.Integer(), nullable=False),
    sa.Column('notice_days_served', sa.Integer(), nullable=False),
    sa.Column('permanent', sa.Boolean(), nullable=False),
    sa.Column('monthly_rated', sa.Boolean(), nullable=False),
    sa.Column('misconduct_no_compensation', sa.Boolean(), nullable=False),
    sa.Column('death_at_work', sa.Boolean(), nullable=False),
    sa.Column('rule_set_id', sa.Integer(), nullable=True),
    sa.Column('absence_case_id', sa.Integer(), nullable=True),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("effective_date >= last_working_date OR separation_type = 'DEEMED_RESIGNATION'", name='ck_hr_separation_dates'),
    sa.CheckConstraint("separation_type IN ('RESIGNATION','DEEMED_RESIGNATION','TERMINATION','RETRENCHMENT','DISMISSAL','RETIREMENT','DEATH')", name='ck_hr_separation_type'),
    sa.CheckConstraint("status IN ('DRAFT','APPROVED','SETTLED','CANCELLED')", name='ck_hr_separation_status'),
    sa.ForeignKeyConstraint(['absence_case_id'], ['hr_employee_cases.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['rule_set_id'], ['hr_bd_rule_sets.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_hr_separations_employee_id'), 'hr_separations', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_separations_tenant_id'), 'hr_separations', ['tenant_id'], unique=False)
    op.create_index('uq_hr_separation_one_open', 'hr_separations', ['tenant_id', 'employee_id'], unique=True, postgresql_where=sa.text("status IN ('DRAFT','APPROVED')"))
    _enable_rls('hr_separations')
    op.create_table('hr_clearance_items',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('separation_id', sa.Integer(), nullable=False),
    sa.Column('department', sa.String(length=64), nullable=False),
    sa.Column('item', sa.String(length=128), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('amount_recoverable', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('evidence_ref', sa.String(length=255), nullable=True),
    sa.Column('signed_off_by', sa.Integer(), nullable=True),
    sa.Column('signed_off_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("status IN ('PENDING','CLEARED','WAIVED')", name='ck_hr_clearance_status'),
    sa.CheckConstraint('amount_recoverable >= 0', name='ck_hr_clearance_amount'),
    sa.ForeignKeyConstraint(['separation_id'], ['hr_separations.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['signed_off_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_hr_clearance_items_separation_id'), 'hr_clearance_items', ['separation_id'], unique=False)
    op.create_index(op.f('ix_hr_clearance_items_tenant_id'), 'hr_clearance_items', ['tenant_id'], unique=False)
    _enable_rls('hr_clearance_items')
    op.create_table('hr_final_settlements',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('separation_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('salary_from', sa.Date(), nullable=True),
    sa.Column('salary_to', sa.Date(), nullable=True),
    sa.Column('salary_days', sa.Numeric(precision=9, scale=2), nullable=False),
    sa.Column('salary_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('overtime_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('allowances_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('leave_encashment_days', sa.Numeric(precision=9, scale=2), nullable=False),
    sa.Column('leave_encashment_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('service_benefit_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('notice_pay_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('notice_recovery_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('advance_recovery_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('other_deductions_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('gross_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('deduction_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('net_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('calculation_trace', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('voucher_id', sa.Integer(), nullable=True),
    sa.Column('reversal_voucher_id', sa.Integer(), nullable=True),
    sa.Column('posted_by', sa.Integer(), nullable=True),
    sa.Column('posted_at', sa.DateTime(), nullable=True),
    sa.Column('paid_at', sa.DateTime(), nullable=True),
    sa.Column('payment_reference', sa.String(length=64), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("status IN ('DRAFT','APPROVED','POSTED','PAID','REVERSED')", name='ck_hr_settlement_status'),
    sa.CheckConstraint('gross_amount >= 0 AND deduction_amount >= 0', name='ck_hr_settlement_non_negative'),
    sa.CheckConstraint('net_amount = gross_amount - deduction_amount', name='ck_hr_settlement_net'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['posted_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['reversal_voucher_id'], ['vouchers.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['separation_id'], ['hr_separations.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['voucher_id'], ['vouchers.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'separation_id', name='uq_hr_final_settlement_separation'),
    sa.UniqueConstraint('voucher_id')
    )
    op.create_index(op.f('ix_hr_final_settlements_employee_id'), 'hr_final_settlements', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_final_settlements_tenant_id'), 'hr_final_settlements', ['tenant_id'], unique=False)
    _enable_rls('hr_final_settlements')
    op.create_table('hr_payroll_document_snapshots',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('payroll_run_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('snapshot_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('content_sha256', sa.String(length=64), nullable=False),
    sa.Column('generated_by', sa.Integer(), nullable=True),
    sa.Column('generated_at', sa.DateTime(), nullable=False),
    sa.Column('invalidated_at', sa.DateTime(), nullable=True),
    sa.Column('invalidated_reason', sa.String(length=255), nullable=True),
    sa.CheckConstraint("status IN ('ACTIVE','INVALIDATED')", name='ck_hr_payroll_snapshot_status'),
    sa.ForeignKeyConstraint(['generated_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['payroll_run_id'], ['hr_payroll_runs.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_hr_payroll_document_snapshots_payroll_run_id'), 'hr_payroll_document_snapshots', ['payroll_run_id'], unique=False)
    op.create_index(op.f('ix_hr_payroll_document_snapshots_tenant_id'), 'hr_payroll_document_snapshots', ['tenant_id'], unique=False)
    op.create_index('uq_hr_payroll_snapshot_active', 'hr_payroll_document_snapshots', ['tenant_id', 'payroll_run_id'], unique=True, postgresql_where=sa.text("status = 'ACTIVE'"))
    _enable_rls('hr_payroll_document_snapshots')
    op.create_table('hr_payroll_acknowledgements',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('payroll_run_line_id', sa.Integer(), nullable=False),
    sa.Column('payment_method', sa.String(length=16), nullable=False),
    sa.Column('evidence_type', sa.String(length=32), nullable=False),
    sa.Column('payment_reference', sa.String(length=64), nullable=True),
    sa.Column('evidence_ref', sa.String(length=255), nullable=True),
    sa.Column('acknowledged_at', sa.DateTime(), nullable=False),
    sa.Column('recorded_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("(payment_method = 'CASH' AND evidence_type = 'REVENUE_STAMP_SIGNATURE') OR (payment_method = 'BANK_TRANSFER' AND evidence_type = 'BANK_REFERENCE') OR (payment_method = 'MFS' AND evidence_type = 'MFS_REFERENCE')", name='ck_hr_payroll_ack_evidence'),
    sa.CheckConstraint("payment_method IN ('CASH','BANK_TRANSFER','MFS')", name='ck_hr_payroll_ack_method'),
    sa.ForeignKeyConstraint(['payroll_run_line_id'], ['hr_payroll_run_lines.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['recorded_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'payroll_run_line_id', name='uq_hr_payroll_ack_line')
    )
    op.create_index(op.f('ix_hr_payroll_acknowledgements_tenant_id'), 'hr_payroll_acknowledgements', ['tenant_id'], unique=False)
    _enable_rls('hr_payroll_acknowledgements')


def downgrade() -> None:
    _disable_rls('hr_payroll_acknowledgements')
    op.drop_index('ix_hr_payroll_acknowledgements_tenant_id', table_name='hr_payroll_acknowledgements')
    op.drop_table('hr_payroll_acknowledgements')
    _disable_rls('hr_payroll_document_snapshots')
    op.drop_index('uq_hr_payroll_snapshot_active', table_name='hr_payroll_document_snapshots', postgresql_where=sa.text("status = 'ACTIVE'"))
    op.drop_index('ix_hr_payroll_document_snapshots_tenant_id', table_name='hr_payroll_document_snapshots')
    op.drop_index('ix_hr_payroll_document_snapshots_payroll_run_id', table_name='hr_payroll_document_snapshots')
    op.drop_table('hr_payroll_document_snapshots')
    _disable_rls('hr_final_settlements')
    op.drop_index('ix_hr_final_settlements_tenant_id', table_name='hr_final_settlements')
    op.drop_index('ix_hr_final_settlements_employee_id', table_name='hr_final_settlements')
    op.drop_table('hr_final_settlements')
    _disable_rls('hr_clearance_items')
    op.drop_index('ix_hr_clearance_items_tenant_id', table_name='hr_clearance_items')
    op.drop_index('ix_hr_clearance_items_separation_id', table_name='hr_clearance_items')
    op.drop_table('hr_clearance_items')
    _disable_rls('hr_separations')
    op.drop_index('uq_hr_separation_one_open', table_name='hr_separations', postgresql_where=sa.text("status IN ('DRAFT','APPROVED')"))
    op.drop_index('ix_hr_separations_tenant_id', table_name='hr_separations')
    op.drop_index('ix_hr_separations_employee_id', table_name='hr_separations')
    op.drop_table('hr_separations')
    _disable_rls('hr_employee_case_events')
    op.drop_index('ix_hr_employee_case_events_tenant_id', table_name='hr_employee_case_events')
    op.drop_index('ix_hr_employee_case_events_case_id', table_name='hr_employee_case_events')
    op.drop_table('hr_employee_case_events')
    _disable_rls('hr_employee_cases')
    op.drop_index('ix_hr_employee_cases_tenant_id', table_name='hr_employee_cases')
    op.drop_index('ix_hr_employee_cases_employee_id', table_name='hr_employee_cases')
    op.drop_table('hr_employee_cases')
