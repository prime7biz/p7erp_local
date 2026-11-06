"""Employee identity + privacy: nullable ``hr_employees.birth_registration_no`` / ``photo_path``,
privacy consent records and biometric enrollment *references* (no templates, images or embeddings).
Columns are nullable; NID-or-birth-registration + mobile are enforced in the API, not the database.

Every new table gets the tenant Row-Level Security policy ``p7_tenant_isolation`` in this revision
(same expression as 270; tests/test_rls_policies.py checks it).

Rollback: ``alembic downgrade 283`` drops what this revision created (children first). A production
downgrade needs a fresh backup and zero-reference checks first (docs/hr-compliance/RUNBOOK.md).

Revision ID: 284
Revises: 283
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "284"
down_revision: Union[str, None] = "283"
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
    op.add_column("hr_employees", sa.Column("birth_registration_no", sa.String(length=32), nullable=True))
    op.add_column("hr_employees", sa.Column("photo_path", sa.String(length=255), nullable=True))
    op.create_table('hr_employee_privacy_consents',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('purpose', sa.String(length=32), nullable=False),
    sa.Column('notice_version', sa.String(length=32), nullable=False),
    sa.Column('lawful_basis', sa.String(length=24), nullable=False),
    sa.Column('purpose_text', sa.Text(), nullable=False),
    sa.Column('retention_until', sa.Date(), nullable=True),
    sa.Column('transfer_disclosure', sa.Text(), nullable=True),
    sa.Column('captured_at', sa.DateTime(), nullable=False),
    sa.Column('captured_by', sa.Integer(), nullable=True),
    sa.Column('withdrawn_at', sa.DateTime(), nullable=True),
    sa.Column('withdrawn_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("lawful_basis IN ('CONSENT','EMPLOYMENT_LAW')", name='ck_hr_privacy_consent_basis'),
    sa.CheckConstraint("purpose IN ('PHOTO','BIOMETRIC_FINGERPRINT','BIOMETRIC_FACE','IDENTITY_DOCUMENT','CV')", name='ck_hr_privacy_consent_purpose'),
    sa.ForeignKeyConstraint(['captured_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['withdrawn_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_hr_employee_privacy_consents_employee_id'), 'hr_employee_privacy_consents', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_employee_privacy_consents_tenant_id'), 'hr_employee_privacy_consents', ['tenant_id'], unique=False)
    op.create_index('uq_hr_privacy_consent_active', 'hr_employee_privacy_consents', ['tenant_id', 'employee_id', 'purpose'], unique=True, postgresql_where=sa.text('withdrawn_at IS NULL'))
    _enable_rls('hr_employee_privacy_consents')
    op.create_table('hr_employee_biometric_enrollments',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('device_id', sa.Integer(), nullable=True),
    sa.Column('modality', sa.String(length=16), nullable=False),
    sa.Column('device_user_ref', sa.String(length=64), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('privacy_notice_version', sa.String(length=32), nullable=False),
    sa.Column('lawful_basis', sa.String(length=24), nullable=False),
    sa.Column('purpose_text', sa.Text(), nullable=False),
    sa.Column('retention_until', sa.Date(), nullable=True),
    sa.Column('device_transfer_disclosure', sa.Text(), nullable=True),
    sa.Column('consent_captured_at', sa.DateTime(), nullable=False),
    sa.Column('consent_captured_by', sa.Integer(), nullable=True),
    sa.Column('consent_withdrawn_at', sa.DateTime(), nullable=True),
    sa.Column('consent_withdrawn_by', sa.Integer(), nullable=True),
    sa.Column('enrolled_at', sa.DateTime(), nullable=True),
    sa.Column('enrolled_by', sa.Integer(), nullable=True),
    sa.Column('test_punch_at', sa.DateTime(), nullable=True),
    sa.Column('deletion_requested_at', sa.DateTime(), nullable=True),
    sa.Column('deletion_confirmed_at', sa.DateTime(), nullable=True),
    sa.Column('deletion_confirmed_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("lawful_basis IN ('CONSENT','EMPLOYMENT_LAW')", name='ck_hr_biometric_basis'),
    sa.CheckConstraint("modality IN ('FINGERPRINT','FACE')", name='ck_hr_biometric_modality'),
    sa.CheckConstraint("status IN ('PENDING','ENROLLED','DELETION_PENDING','DELETED')", name='ck_hr_biometric_status'),
    sa.ForeignKeyConstraint(['consent_captured_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['consent_withdrawn_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['deletion_confirmed_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['device_id'], ['hr_attendance_devices.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['hr_employees.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['enrolled_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'employee_id', 'device_id', 'modality', name='uq_hr_biometric_enrollment', postgresql_nulls_not_distinct=True)
    )
    op.create_index(op.f('ix_hr_employee_biometric_enrollments_device_id'), 'hr_employee_biometric_enrollments', ['device_id'], unique=False)
    op.create_index(op.f('ix_hr_employee_biometric_enrollments_employee_id'), 'hr_employee_biometric_enrollments', ['employee_id'], unique=False)
    op.create_index(op.f('ix_hr_employee_biometric_enrollments_tenant_id'), 'hr_employee_biometric_enrollments', ['tenant_id'], unique=False)
    _enable_rls('hr_employee_biometric_enrollments')
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_hr_employees_birth_registration_no "
            "ON hr_employees (birth_registration_no)"
        )


def downgrade() -> None:
    _disable_rls('hr_employee_biometric_enrollments')
    op.drop_index('ix_hr_employee_biometric_enrollments_tenant_id', table_name='hr_employee_biometric_enrollments')
    op.drop_index('ix_hr_employee_biometric_enrollments_employee_id', table_name='hr_employee_biometric_enrollments')
    op.drop_index('ix_hr_employee_biometric_enrollments_device_id', table_name='hr_employee_biometric_enrollments')
    op.drop_table('hr_employee_biometric_enrollments')
    _disable_rls('hr_employee_privacy_consents')
    op.drop_index('uq_hr_privacy_consent_active', table_name='hr_employee_privacy_consents', postgresql_where=sa.text('withdrawn_at IS NULL'))
    op.drop_index('ix_hr_employee_privacy_consents_tenant_id', table_name='hr_employee_privacy_consents')
    op.drop_index('ix_hr_employee_privacy_consents_employee_id', table_name='hr_employee_privacy_consents')
    op.drop_table('hr_employee_privacy_consents')
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_hr_employees_birth_registration_no")
    op.drop_column("hr_employees", "photo_path")
    op.drop_column("hr_employees", "birth_registration_no")
