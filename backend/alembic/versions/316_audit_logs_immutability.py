"""Audit log immutability + retention index (User Activity).

- BEFORE UPDATE: always reject (audit rows are append-only).
- BEFORE DELETE: allow only ``API_REQUEST`` / ``API_ERROR`` (retention purge).
  No session GUC bypass — emergency wipe is DBA-only (disable trigger).
- Partial index speeds technical-row purge by tenant + created_at.

Rollback: ``alembic downgrade 315``.

Revision ID: 316
Revises: 315
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "316"
down_revision: Union[str, None] = "315"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FUNCTION_NAME = "p7_audit_logs_immutable"
TRIGGER_NAME = "trg_audit_logs_immutable"
INDEX_NAME = "ix_audit_logs_tenant_action_created_technical"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute(
        f"""
        CREATE FUNCTION {FUNCTION_NAME}() RETURNS trigger AS $fn$
        BEGIN
            IF TG_OP = 'UPDATE' THEN
                RAISE EXCEPTION USING
                    ERRCODE = 'restrict_violation',
                    MESSAGE = 'audit_logs rows are immutable (UPDATE rejected)';
            END IF;
            IF TG_OP = 'DELETE' THEN
                IF OLD.action IN ('API_REQUEST', 'API_ERROR') THEN
                    RETURN OLD;
                END IF;
                RAISE EXCEPTION USING
                    ERRCODE = 'restrict_violation',
                    MESSAGE = 'audit_logs business rows cannot be deleted (' || OLD.action || ')';
            END IF;
            RETURN NEW;
        END;
        $fn$ LANGUAGE plpgsql
        """
    )
    op.execute(
        f"""
        CREATE TRIGGER {TRIGGER_NAME}
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION {FUNCTION_NAME}()
        """
    )
    op.execute(
        f"""
        CREATE INDEX IF NOT EXISTS {INDEX_NAME}
        ON audit_logs (tenant_id, created_at)
        WHERE action IN ('API_REQUEST', 'API_ERROR')
        """
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute(f"DROP INDEX IF EXISTS {INDEX_NAME}")
    op.execute(f"DROP TRIGGER IF EXISTS {TRIGGER_NAME} ON audit_logs")
    op.execute(f"DROP FUNCTION IF EXISTS {FUNCTION_NAME}()")
