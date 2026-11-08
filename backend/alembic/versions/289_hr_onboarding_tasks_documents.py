"""HR onboarding saga run, onboarding checklist tasks and immutable generated employee documents.

Three tenant tables, each with the Row-Level Security policy ``p7_tenant_isolation`` created in this
revision (same expression as 270; tests/test_rls_policies.py checks it):

* ``hr_employee_onboarding_runs`` - durable, retry-safe record of one onboarding request
  (unique per tenant + request id; employee FK ``SET NULL``).
* ``hr_employee_onboarding_tasks`` - truthful checklist tasks (employee FK ``CASCADE``; unique per
  employee + task type). COMPLETED needs a source table/id and WAIVED needs a reason (CHECK).
* ``hr_generated_employee_documents`` - versioned content snapshot for appointment letters / job
  descriptions (employee FK ``RESTRICT``). ``verification_id`` is globally unique. A trigger rejects
  UPDATE and DELETE of a row once ``signed_at`` is set. The only DELETE it lets through is the
  cascade of deleting the owning tenant (the tenant row is already gone at that point), so tenant
  removal is not blocked by signed documents.

Rollback: ``alembic downgrade 288`` drops the trigger and function first, then the tables (children
first). That deletes onboarding runs, tasks and signed snapshots and invalidates printed QR links, so
a production downgrade needs a fresh backup and explicit approval first.

Revision ID: 289
Revises: 288
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "289"
down_revision: Union[str, None] = "288"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Copied from 270_tenant_rls_policies.py (migrations stay frozen, so no cross-file import).
RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

DOC_TABLE = "hr_generated_employee_documents"
TRIGGER_NAME = "trg_hr_generated_employee_documents_signed_immutable"
FUNCTION_NAME = "hr_generated_employee_documents_block_signed_change"


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

    # ------------------------------------------------------------------ onboarding runs
    op.create_table(
        "hr_employee_onboarding_runs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("employee_step_status", sa.String(length=16), nullable=False),
        sa.Column("payroll_step_status", sa.String(length=16), nullable=False),
        sa.Column("gate_pass_step_status", sa.String(length=16), nullable=False),
        sa.Column("checklist_step_status", sa.String(length=16), nullable=False),
        sa.Column("payroll_assignment_id", sa.Integer(), nullable=True),
        sa.Column("wage_assignment_id", sa.Integer(), nullable=True),
        sa.Column("gate_pass_id", sa.Integer(), nullable=True),
        sa.Column("last_error_step", sa.String(length=24), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("last_error_message", sa.String(length=255), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('PENDING','IN_PROGRESS','COMPLETED','FAILED')",
            name="ck_hr_onboarding_run_status",
        ),
        sa.CheckConstraint(
            "employee_step_status IN ('PENDING','COMPLETED','FAILED','SKIPPED')",
            name="ck_hr_onboarding_run_employee_step",
        ),
        sa.CheckConstraint(
            "payroll_step_status IN ('PENDING','COMPLETED','FAILED','SKIPPED')",
            name="ck_hr_onboarding_run_payroll_step",
        ),
        sa.CheckConstraint(
            "gate_pass_step_status IN ('PENDING','COMPLETED','FAILED','SKIPPED')",
            name="ck_hr_onboarding_run_gate_pass_step",
        ),
        sa.CheckConstraint(
            "checklist_step_status IN ('PENDING','COMPLETED','FAILED','SKIPPED')",
            name="ck_hr_onboarding_run_checklist_step",
        ),
        sa.CheckConstraint("length(btrim(request_id)) > 0", name="ck_hr_onboarding_run_request_id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["payroll_assignment_id"], ["hr_payroll_employee_structure_assignments.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["wage_assignment_id"], ["hr_bd_employee_wage_assignments.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["gate_pass_id"], ["hr_employee_gate_passes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "request_id", name="uq_hr_onboarding_run_request"),
    )
    op.create_index(op.f("ix_hr_employee_onboarding_runs_tenant_id"), "hr_employee_onboarding_runs", ["tenant_id"])
    op.create_index(op.f("ix_hr_employee_onboarding_runs_employee_id"), "hr_employee_onboarding_runs", ["employee_id"])
    op.create_index(
        "ix_hr_onboarding_run_tenant_status", "hr_employee_onboarding_runs", ["tenant_id", "status"]
    )
    op.create_index(
        "ix_hr_onboarding_run_tenant_employee", "hr_employee_onboarding_runs", ["tenant_id", "employee_id"]
    )
    _enable_rls("hr_employee_onboarding_runs")

    # ------------------------------------------------------------------ onboarding tasks
    op.create_table(
        "hr_employee_onboarding_tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("task_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("source_table", sa.String(length=64), nullable=True),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_by", sa.Integer(), nullable=True),
        sa.Column("waived_at", sa.DateTime(), nullable=True),
        sa.Column("waived_by", sa.Integer(), nullable=True),
        sa.Column("waive_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "task_type IN ('PHOTO_CONSENT','FINGERPRINT_CONSENT','FACE_CONSENT','IDENTITY_DOCUMENT_CONSENT',"
            "'CV_CONSENT','MEDICAL_EXAM','REQUIRED_DOCUMENTS','EMPLOYEE_PHOTO')",
            name="ck_hr_onboarding_task_type",
        ),
        sa.CheckConstraint("status IN ('DUE','COMPLETED','WAIVED')", name="ck_hr_onboarding_task_status"),
        sa.CheckConstraint(
            "(source_table IS NULL) = (source_id IS NULL)", name="ck_hr_onboarding_task_source_pair"
        ),
        sa.CheckConstraint(
            "status <> 'COMPLETED' OR (completed_at IS NOT NULL AND source_table IS NOT NULL "
            "AND source_id IS NOT NULL)",
            name="ck_hr_onboarding_task_completed_evidence",
        ),
        sa.CheckConstraint(
            "status <> 'WAIVED' OR (waived_at IS NOT NULL AND waive_reason IS NOT NULL "
            "AND length(btrim(waive_reason)) > 0)",
            name="ck_hr_onboarding_task_waived_reason",
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["completed_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["waived_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "task_type", name="uq_hr_onboarding_task_employee_type"),
    )
    op.create_index(op.f("ix_hr_employee_onboarding_tasks_tenant_id"), "hr_employee_onboarding_tasks", ["tenant_id"])
    op.create_index(
        "ix_hr_onboarding_task_tenant_employee", "hr_employee_onboarding_tasks", ["tenant_id", "employee_id"]
    )
    op.create_index("ix_hr_onboarding_task_tenant_status", "hr_employee_onboarding_tasks", ["tenant_id", "status"])
    _enable_rls("hr_employee_onboarding_tasks")

    # ------------------------------------------------------------------ generated documents
    op.create_table(
        DOC_TABLE,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("document_type", sa.String(length=32), nullable=False),
        sa.Column("document_version", sa.Integer(), nullable=False),
        sa.Column("snapshot_schema_version", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("generation_request_id", sa.String(length=64), nullable=False),
        sa.Column("verification_id", sa.String(length=64), nullable=False),
        sa.Column("signature_hash", sa.String(length=128), nullable=True),
        sa.Column("signed_at", sa.DateTime(), nullable=True),
        sa.Column("generated_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "document_type IN ('APPOINTMENT_LETTER','JOB_DESCRIPTION')", name="ck_hr_generated_doc_type"
        ),
        sa.CheckConstraint("document_version >= 1", name="ck_hr_generated_doc_version"),
        sa.CheckConstraint("snapshot_schema_version >= 1", name="ck_hr_generated_doc_schema_version"),
        sa.CheckConstraint("jsonb_typeof(snapshot) = 'object'", name="ck_hr_generated_doc_snapshot_object"),
        sa.CheckConstraint(
            "(signed_at IS NULL) = (signature_hash IS NULL)", name="ck_hr_generated_doc_signature_pair"
        ),
        sa.CheckConstraint("length(btrim(generation_request_id)) > 0", name="ck_hr_generated_doc_request_id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["generated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id", "employee_id", "document_type", "document_version", name="uq_hr_generated_doc_version"
        ),
        sa.UniqueConstraint("tenant_id", "generation_request_id", name="uq_hr_generated_doc_request"),
    )
    op.create_index(op.f(f"ix_{DOC_TABLE}_tenant_id"), DOC_TABLE, ["tenant_id"])
    op.create_index(op.f(f"ix_{DOC_TABLE}_employee_id"), DOC_TABLE, ["employee_id"])
    op.create_index(op.f(f"ix_{DOC_TABLE}_verification_id"), DOC_TABLE, ["verification_id"], unique=True)
    _enable_rls(DOC_TABLE)

    # Signed rows are immutable. No colon / percent characters in the body (op.execute wraps text()).
    op.execute(
        f"""
        CREATE FUNCTION {FUNCTION_NAME}() RETURNS trigger AS $fn$
        BEGIN
            IF OLD.signed_at IS NOT NULL THEN
                IF TG_OP = 'DELETE'
                   AND NOT EXISTS (SELECT 1 FROM tenants WHERE id = OLD.tenant_id) THEN
                    RETURN OLD;
                END IF;
                RAISE EXCEPTION USING
                    ERRCODE = 'restrict_violation',
                    MESSAGE = 'signed HR document is immutable (' || TG_OP || ' rejected): ' || OLD.verification_id;
            END IF;
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            END IF;
            RETURN NEW;
        END;
        $fn$ LANGUAGE plpgsql
        """
    )
    op.execute(
        f"""
        CREATE TRIGGER {TRIGGER_NAME}
        BEFORE UPDATE OR DELETE ON {DOC_TABLE}
        FOR EACH ROW EXECUTE FUNCTION {FUNCTION_NAME}()
        """
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    # Trigger and function first, then the tables (children of nothing here; none reference each other).
    op.execute(f"DROP TRIGGER IF EXISTS {TRIGGER_NAME} ON {DOC_TABLE}")
    op.execute(f"DROP FUNCTION IF EXISTS {FUNCTION_NAME}()")

    _disable_rls(DOC_TABLE)
    op.drop_index(op.f(f"ix_{DOC_TABLE}_verification_id"), table_name=DOC_TABLE)
    op.drop_index(op.f(f"ix_{DOC_TABLE}_employee_id"), table_name=DOC_TABLE)
    op.drop_index(op.f(f"ix_{DOC_TABLE}_tenant_id"), table_name=DOC_TABLE)
    op.drop_table(DOC_TABLE)

    _disable_rls("hr_employee_onboarding_tasks")
    op.drop_index("ix_hr_onboarding_task_tenant_status", table_name="hr_employee_onboarding_tasks")
    op.drop_index("ix_hr_onboarding_task_tenant_employee", table_name="hr_employee_onboarding_tasks")
    op.drop_index(op.f("ix_hr_employee_onboarding_tasks_tenant_id"), table_name="hr_employee_onboarding_tasks")
    op.drop_table("hr_employee_onboarding_tasks")

    _disable_rls("hr_employee_onboarding_runs")
    op.drop_index("ix_hr_onboarding_run_tenant_employee", table_name="hr_employee_onboarding_runs")
    op.drop_index("ix_hr_onboarding_run_tenant_status", table_name="hr_employee_onboarding_runs")
    op.drop_index(op.f("ix_hr_employee_onboarding_runs_employee_id"), table_name="hr_employee_onboarding_runs")
    op.drop_index(op.f("ix_hr_employee_onboarding_runs_tenant_id"), table_name="hr_employee_onboarding_runs")
    op.drop_table("hr_employee_onboarding_runs")
