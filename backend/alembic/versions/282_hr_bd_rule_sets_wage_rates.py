"""Bangladesh RMG Phase B: effective-dated labour-law rule sets + Gazette wage schedule rates.

New empty tables only. ``hr_bd_wage_schedule_rates.rate_code`` is NOT NULL and unique per rule set,
so apprentice rows (no grade) cannot be duplicated.

Every new table gets the tenant Row-Level Security policy ``p7_tenant_isolation`` in this revision
(same expression as 270; tests/test_rls_policies.py checks it).

Rollback: ``alembic downgrade 281`` drops what this revision created (children first). A production
downgrade needs a fresh backup and zero-reference checks first (docs/hr-compliance/RUNBOOK.md).

Revision ID: 282
Revises: 281
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "282"
down_revision: Union[str, None] = "281"
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
    op.create_table('hr_bd_rule_sets',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=32), nullable=False),
    sa.Column('catalog_version', sa.String(length=32), nullable=False),
    sa.Column('effective_from', sa.Date(), nullable=False),
    sa.Column('effective_to', sa.Date(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('source_manifest_sha256', sa.String(length=64), nullable=False),
    sa.Column('source_refs', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('rules_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('approved_by', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("status IN ('DRAFT','APPROVED','RETIRED')", name='ck_hr_bd_rule_sets_status'),
    sa.CheckConstraint('effective_to IS NULL OR effective_to >= effective_from', name='ck_hr_bd_rule_sets_dates'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'code', 'catalog_version', name='uq_hr_bd_rule_sets_code_version')
    )
    op.create_index(op.f('ix_hr_bd_rule_sets_tenant_id'), 'hr_bd_rule_sets', ['tenant_id'], unique=False)
    _enable_rls('hr_bd_rule_sets')
    op.create_table('hr_bd_wage_schedule_rates',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('rule_set_id', sa.Integer(), nullable=False),
    sa.Column('rate_code', sa.String(length=16), nullable=False),
    sa.Column('schedule_class', sa.String(length=16), nullable=False),
    sa.Column('employment_stage', sa.String(length=16), nullable=False),
    sa.Column('grade_code', sa.String(length=8), nullable=True),
    sa.Column('designation_scope', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('basic', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('house_rent', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('medical', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('transport', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('food', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('other_allowance', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('gross', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('annual_increment_pct', sa.Numeric(precision=9, scale=4), nullable=False),
    sa.Column('apprentice_months', sa.Integer(), nullable=True),
    sa.Column('effective_from', sa.Date(), nullable=False),
    sa.Column('effective_to', sa.Date(), nullable=True),
    sa.Column('source_page', sa.String(length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("employment_stage = 'APPRENTICE' OR grade_code IS NOT NULL", name='ck_hr_bd_wage_rates_regular_grade'),
    sa.CheckConstraint("employment_stage IN ('REGULAR','APPRENTICE')", name='ck_hr_bd_wage_rates_stage'),
    sa.CheckConstraint("schedule_class IN ('WORKER','EMPLOYEE')", name='ck_hr_bd_wage_rates_class'),
    sa.CheckConstraint('basic >= 0 AND house_rent >= 0 AND medical >= 0 AND transport >= 0 AND food >= 0 AND other_allowance >= 0', name='ck_hr_bd_wage_rates_non_negative'),
    sa.CheckConstraint('effective_to IS NULL OR effective_to >= effective_from', name='ck_hr_bd_wage_rates_dates'),
    sa.CheckConstraint('gross = basic + house_rent + medical + transport + food + other_allowance', name='ck_hr_bd_wage_rates_gross'),
    sa.ForeignKeyConstraint(['rule_set_id'], ['hr_bd_rule_sets.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'rule_set_id', 'rate_code', name='uq_hr_bd_wage_rates_rule_set_code')
    )
    op.create_index(op.f('ix_hr_bd_wage_schedule_rates_rule_set_id'), 'hr_bd_wage_schedule_rates', ['rule_set_id'], unique=False)
    op.create_index(op.f('ix_hr_bd_wage_schedule_rates_tenant_id'), 'hr_bd_wage_schedule_rates', ['tenant_id'], unique=False)
    _enable_rls('hr_bd_wage_schedule_rates')


def downgrade() -> None:
    _disable_rls('hr_bd_wage_schedule_rates')
    op.drop_index('ix_hr_bd_wage_schedule_rates_tenant_id', table_name='hr_bd_wage_schedule_rates')
    op.drop_index('ix_hr_bd_wage_schedule_rates_rule_set_id', table_name='hr_bd_wage_schedule_rates')
    op.drop_table('hr_bd_wage_schedule_rates')
    _disable_rls('hr_bd_rule_sets')
    op.drop_index('ix_hr_bd_rule_sets_tenant_id', table_name='hr_bd_rule_sets')
    op.drop_table('hr_bd_rule_sets')
