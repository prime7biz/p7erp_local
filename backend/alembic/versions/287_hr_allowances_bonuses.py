"""Tiffin / dinner / night allowance rules + entries, production bonus schemes + entries and
festival-bonus allocation lines. Each payable entry has one owner: a payroll run line or a final
settlement (CHECK). Also adds ``final_settlement_id`` to ``hr_bd_festival_work_entries``.

Every new table gets the tenant Row-Level Security policy ``p7_tenant_isolation`` in this revision
(same expression as 270; tests/test_rls_policies.py checks it).

Rollback: ``alembic downgrade 286`` drops what this revision created (children first). A production
downgrade needs a fresh backup and zero-reference checks first (docs/hr-compliance/RUNBOOK.md).

Revision ID: 287
Revises: 286
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "287"
down_revision: Union[str, None] = "286"
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
    op.create_table('hr_allowance_rules',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=24), nullable=False),
    sa.Column('name', sa.String(length=128), nullable=False),
    sa.Column('bill_type', sa.String(length=16), nullable=False),
    sa.Column('eligibility_basis', sa.String(length=24), nullable=False),
    sa.Column('threshold_minutes', sa.Integer(), nullable=False),
    sa.Column('amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('effective_from', sa.Date(), nullable=False),
    sa.Column('effective_to', sa.Date(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("bill_type IN ('TIFFIN','DINNER','NIGHT')", name='ck_hr_allowance_rule_type'),
    sa.CheckConstraint("eligibility_basis IN ('PRESENT','NIGHT_SHIFT','MIN_WORK_MINUTES','MIN_OT_MINUTES')", name='ck_hr_allowance_rule_basis'),
    sa.CheckConstraint("status IN ('DRAFT','APPROVED','RETIRED')", name='ck_hr_allowance_rule_status'),
    sa.CheckConstraint('amount >= 0 AND threshold_minutes >= 0', name='ck_hr_allowance_rule_non_negative'),
    sa.CheckConstraint('effective_to IS NULL OR effective_to >= effective_from', name='ck_hr_allowance_rule_dates'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'code', name='uq_hr_allowance_rule_code')
    )
    op.create_index(op.f('ix_hr_allowance_rules_tenant_id'), 'hr_allowance_rules', ['tenant_id'], unique=False)
    _enable_rls('hr_allowance_rules')
    op.create_table('hr_allowance_entries',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('work_date', sa.Date(), nullable=False),
    sa.Column('rule_id', sa.Integer(), nullable=False),
    sa.Column('attendance_entry_id', sa.Integer(), nullable=True),
    sa.Column('amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('correction_reason', sa.Text(), nullable=True),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('payroll_run_line_id', sa.Integer(), nullable=True),
    sa.Column('final_settlement_id', sa.Integer(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("status IN ('PENDING','APPROVED','REJECTED','PAID')", name='ck_hr_allowance_entry_status'),
    sa.CheckConstraint('amount >= 0', name='ck_hr_allowance_entry_amount'),
    sa.CheckConstraint('payroll_run_line_id IS NULL OR final_settlement_id IS NULL', name='ck_hr_allowance_entry_one_owner'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['attendance_entry_id'], ['hr_attendance_entries.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['final_settlement_id'], ['hr_final_settlements.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['payroll_run_line_id'], ['hr_payroll_run_lines.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['rule_id'], ['hr_allowance_rules.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'employee_id', 'work_date', 'rule_id', name='uq_hr_allowance_entry_source')
    )
    op.create_index(op.f('ix_hr_allowance_entries_employee_id'), 'hr_allowance_entries', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_allowance_entries_final_settlement_id'), 'hr_allowance_entries', ['final_settlement_id'], unique=False)
    op.create_index(op.f('ix_hr_allowance_entries_payroll_run_line_id'), 'hr_allowance_entries', ['payroll_run_line_id'], unique=False)
    op.create_index(op.f('ix_hr_allowance_entries_tenant_id'), 'hr_allowance_entries', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_hr_allowance_entries_work_date'), 'hr_allowance_entries', ['work_date'], unique=False)
    _enable_rls('hr_allowance_entries')
    op.create_table('hr_production_bonus_schemes',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=24), nullable=False),
    sa.Column('name', sa.String(length=128), nullable=False),
    sa.Column('basis', sa.String(length=16), nullable=False),
    sa.Column('params', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('cap_amount', sa.Numeric(precision=18, scale=4), nullable=True),
    sa.Column('effective_from', sa.Date(), nullable=False),
    sa.Column('effective_to', sa.Date(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("basis IN ('PIECE','EFFICIENCY','TARGET')", name='ck_hr_production_scheme_basis'),
    sa.CheckConstraint("status IN ('DRAFT','APPROVED','RETIRED')", name='ck_hr_production_scheme_status'),
    sa.CheckConstraint('cap_amount IS NULL OR cap_amount >= 0', name='ck_hr_production_scheme_cap'),
    sa.CheckConstraint('effective_to IS NULL OR effective_to >= effective_from', name='ck_hr_production_scheme_dates'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'code', name='uq_hr_production_scheme_code')
    )
    op.create_index(op.f('ix_hr_production_bonus_schemes_tenant_id'), 'hr_production_bonus_schemes', ['tenant_id'], unique=False)
    _enable_rls('hr_production_bonus_schemes')
    op.create_table('hr_production_bonus_entries',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('scheme_id', sa.Integer(), nullable=False),
    sa.Column('period_code', sa.String(length=16), nullable=False),
    sa.Column('period_start', sa.Date(), nullable=False),
    sa.Column('period_end', sa.Date(), nullable=False),
    sa.Column('source_ref', sa.String(length=64), nullable=False),
    sa.Column('quantity', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('efficiency_pct', sa.Numeric(precision=9, scale=2), nullable=True),
    sa.Column('amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('trace_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('payroll_run_line_id', sa.Integer(), nullable=True),
    sa.Column('final_settlement_id', sa.Integer(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("status IN ('PENDING','APPROVED','REJECTED','PAID')", name='ck_hr_production_entry_status'),
    sa.CheckConstraint('amount >= 0 AND quantity >= 0', name='ck_hr_production_entry_non_negative'),
    sa.CheckConstraint('payroll_run_line_id IS NULL OR final_settlement_id IS NULL', name='ck_hr_production_entry_one_owner'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['final_settlement_id'], ['hr_final_settlements.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['payroll_run_line_id'], ['hr_payroll_run_lines.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['scheme_id'], ['hr_production_bonus_schemes.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'employee_id', 'scheme_id', 'period_code', name='uq_hr_production_entry_source')
    )
    op.create_index(op.f('ix_hr_production_bonus_entries_employee_id'), 'hr_production_bonus_entries', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_production_bonus_entries_final_settlement_id'), 'hr_production_bonus_entries', ['final_settlement_id'], unique=False)
    op.create_index(op.f('ix_hr_production_bonus_entries_payroll_run_line_id'), 'hr_production_bonus_entries', ['payroll_run_line_id'], unique=False)
    op.create_index(op.f('ix_hr_production_bonus_entries_tenant_id'), 'hr_production_bonus_entries', ['tenant_id'], unique=False)
    _enable_rls('hr_production_bonus_entries')
    op.create_table('hr_bonus_allocation_lines',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('bonus_declaration_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('eligible', sa.Boolean(), nullable=False),
    sa.Column('eligibility_reason', sa.String(length=255), nullable=True),
    sa.Column('basis_amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('amount', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('payroll_run_line_id', sa.Integer(), nullable=True),
    sa.Column('final_settlement_id', sa.Integer(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("status IN ('PENDING','APPROVED','EXCLUDED','PAID')", name='ck_hr_bonus_allocation_status'),
    sa.CheckConstraint('amount >= 0 AND basis_amount >= 0', name='ck_hr_bonus_allocation_non_negative'),
    sa.CheckConstraint('payroll_run_line_id IS NULL OR final_settlement_id IS NULL', name='ck_hr_bonus_allocation_one_owner'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['bonus_declaration_id'], ['hr_bonus_declarations.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['final_settlement_id'], ['hr_final_settlements.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['payroll_run_line_id'], ['hr_payroll_run_lines.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'bonus_declaration_id', 'employee_id', name='uq_hr_bonus_allocation_employee')
    )
    op.create_index(op.f('ix_hr_bonus_allocation_lines_bonus_declaration_id'), 'hr_bonus_allocation_lines', ['bonus_declaration_id'], unique=False)
    op.create_index(op.f('ix_hr_bonus_allocation_lines_employee_id'), 'hr_bonus_allocation_lines', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_bonus_allocation_lines_final_settlement_id'), 'hr_bonus_allocation_lines', ['final_settlement_id'], unique=False)
    op.create_index(op.f('ix_hr_bonus_allocation_lines_payroll_run_line_id'), 'hr_bonus_allocation_lines', ['payroll_run_line_id'], unique=False)
    op.create_index(op.f('ix_hr_bonus_allocation_lines_tenant_id'), 'hr_bonus_allocation_lines', ['tenant_id'], unique=False)
    _enable_rls('hr_bonus_allocation_lines')
    op.add_column("hr_bd_festival_work_entries", sa.Column("final_settlement_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_hr_bd_festival_work_final_settlement", "hr_bd_festival_work_entries", "hr_final_settlements",
        ["final_settlement_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "ck_hr_bd_festival_one_owner", "hr_bd_festival_work_entries",
        "payroll_run_line_id IS NULL OR final_settlement_id IS NULL",
    )
    op.create_index(
        "ix_hr_bd_festival_work_entries_final_settlement_id", "hr_bd_festival_work_entries", ["final_settlement_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_hr_bd_festival_work_entries_final_settlement_id", table_name="hr_bd_festival_work_entries")
    op.drop_constraint("ck_hr_bd_festival_one_owner", "hr_bd_festival_work_entries", type_="check")
    op.drop_constraint("fk_hr_bd_festival_work_final_settlement", "hr_bd_festival_work_entries", type_="foreignkey")
    op.drop_column("hr_bd_festival_work_entries", "final_settlement_id")
    _disable_rls('hr_bonus_allocation_lines')
    op.drop_index('ix_hr_bonus_allocation_lines_tenant_id', table_name='hr_bonus_allocation_lines')
    op.drop_index('ix_hr_bonus_allocation_lines_payroll_run_line_id', table_name='hr_bonus_allocation_lines')
    op.drop_index('ix_hr_bonus_allocation_lines_final_settlement_id', table_name='hr_bonus_allocation_lines')
    op.drop_index('ix_hr_bonus_allocation_lines_employee_id', table_name='hr_bonus_allocation_lines')
    op.drop_index('ix_hr_bonus_allocation_lines_bonus_declaration_id', table_name='hr_bonus_allocation_lines')
    op.drop_table('hr_bonus_allocation_lines')
    _disable_rls('hr_production_bonus_entries')
    op.drop_index('ix_hr_production_bonus_entries_tenant_id', table_name='hr_production_bonus_entries')
    op.drop_index('ix_hr_production_bonus_entries_payroll_run_line_id', table_name='hr_production_bonus_entries')
    op.drop_index('ix_hr_production_bonus_entries_final_settlement_id', table_name='hr_production_bonus_entries')
    op.drop_index('ix_hr_production_bonus_entries_employee_id', table_name='hr_production_bonus_entries')
    op.drop_table('hr_production_bonus_entries')
    _disable_rls('hr_production_bonus_schemes')
    op.drop_index('ix_hr_production_bonus_schemes_tenant_id', table_name='hr_production_bonus_schemes')
    op.drop_table('hr_production_bonus_schemes')
    _disable_rls('hr_allowance_entries')
    op.drop_index('ix_hr_allowance_entries_work_date', table_name='hr_allowance_entries')
    op.drop_index('ix_hr_allowance_entries_tenant_id', table_name='hr_allowance_entries')
    op.drop_index('ix_hr_allowance_entries_payroll_run_line_id', table_name='hr_allowance_entries')
    op.drop_index('ix_hr_allowance_entries_final_settlement_id', table_name='hr_allowance_entries')
    op.drop_index('ix_hr_allowance_entries_employee_id', table_name='hr_allowance_entries')
    op.drop_table('hr_allowance_entries')
    _disable_rls('hr_allowance_rules')
    op.drop_index('ix_hr_allowance_rules_tenant_id', table_name='hr_allowance_rules')
    op.drop_table('hr_allowance_rules')
