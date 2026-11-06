"""Temporary employee gate passes (QR token stored only as a SHA-256 hash) and gate scan events.

Every new table gets the tenant Row-Level Security policy ``p7_tenant_isolation`` in this revision
(same expression as 270; tests/test_rls_policies.py checks it).

Rollback: ``alembic downgrade 284`` drops what this revision created (children first). A production
downgrade needs a fresh backup and zero-reference checks first (docs/hr-compliance/RUNBOOK.md).

Revision ID: 285
Revises: 284
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "285"
down_revision: Union[str, None] = "284"
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
    op.create_table('hr_employee_gate_passes',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('pass_code', sa.String(length=32), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=True),
    sa.Column('person_name', sa.String(length=128), nullable=False),
    sa.Column('mobile', sa.String(length=32), nullable=False),
    sa.Column('identity_ref', sa.String(length=64), nullable=True),
    sa.Column('sponsor_employee_id', sa.Integer(), nullable=True),
    sa.Column('purpose', sa.Text(), nullable=False),
    sa.Column('permitted_zones', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('valid_from', sa.DateTime(), nullable=False),
    sa.Column('valid_to', sa.DateTime(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('qr_token_hash', sa.String(length=64), nullable=False),
    sa.Column('issued_by', sa.Integer(), nullable=True),
    sa.Column('issued_at', sa.DateTime(), nullable=True),
    sa.Column('revoked_by', sa.Integer(), nullable=True),
    sa.Column('revoked_at', sa.DateTime(), nullable=True),
    sa.Column('revoke_reason', sa.String(length=255), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("status IN ('DRAFT','ACTIVE','EXPIRED','REVOKED')", name='ck_hr_gate_pass_status'),
    sa.CheckConstraint('valid_to > valid_from', name='ck_hr_gate_pass_window'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['issued_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['revoked_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['sponsor_employee_id'], ['hr_employees.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('qr_token_hash', name='uq_hr_gate_pass_token'),
    sa.UniqueConstraint('tenant_id', 'pass_code', name='uq_hr_gate_pass_code')
    )
    op.create_index(op.f('ix_hr_employee_gate_passes_employee_id'), 'hr_employee_gate_passes', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_employee_gate_passes_sponsor_employee_id'), 'hr_employee_gate_passes', ['sponsor_employee_id'], unique=False)
    op.create_index(op.f('ix_hr_employee_gate_passes_tenant_id'), 'hr_employee_gate_passes', ['tenant_id'], unique=False)
    _enable_rls('hr_employee_gate_passes')
    op.create_table('hr_employee_gate_events',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('gate_pass_id', sa.Integer(), nullable=True),
    sa.Column('event_at', sa.DateTime(), nullable=False),
    sa.Column('direction', sa.String(length=8), nullable=False),
    sa.Column('gate', sa.String(length=64), nullable=False),
    sa.Column('guard_user_id', sa.Integer(), nullable=True),
    sa.Column('result', sa.String(length=16), nullable=False),
    sa.Column('reason', sa.String(length=255), nullable=True),
    sa.Column('idempotency_key', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("direction IN ('IN','OUT')", name='ck_hr_gate_event_direction'),
    sa.CheckConstraint("result IN ('ALLOWED','DENIED')", name='ck_hr_gate_event_result'),
    sa.ForeignKeyConstraint(['gate_pass_id'], ['hr_employee_gate_passes.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['guard_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'idempotency_key', name='uq_hr_gate_event_idempotency')
    )
    op.create_index(op.f('ix_hr_employee_gate_events_tenant_id'), 'hr_employee_gate_events', ['tenant_id'], unique=False)
    op.create_index('ix_hr_gate_events_pass_time', 'hr_employee_gate_events', ['tenant_id', 'gate_pass_id', 'event_at'], unique=False)
    _enable_rls('hr_employee_gate_events')


def downgrade() -> None:
    _disable_rls('hr_employee_gate_events')
    op.drop_index('ix_hr_gate_events_pass_time', table_name='hr_employee_gate_events')
    op.drop_index('ix_hr_employee_gate_events_tenant_id', table_name='hr_employee_gate_events')
    op.drop_table('hr_employee_gate_events')
    _disable_rls('hr_employee_gate_passes')
    op.drop_index('ix_hr_employee_gate_passes_tenant_id', table_name='hr_employee_gate_passes')
    op.drop_index('ix_hr_employee_gate_passes_sponsor_employee_id', table_name='hr_employee_gate_passes')
    op.drop_index('ix_hr_employee_gate_passes_employee_id', table_name='hr_employee_gate_passes')
    op.drop_table('hr_employee_gate_passes')
