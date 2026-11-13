"""Dated employee and machine line assignments (Manufacturing Intelligence Phase 2, R4).

Additive only. Nothing reads these tables while the strict tenant flag ``mfg_integrated_planning_v1`` is OFF.

* ``production_employee_line_assignments``: one employee on one sewing line (optional shift) from ``valid_from``
  to ``valid_to`` (NULL = open ended) in a role (OPERATOR / HELPER / SUPERVISOR / QC / IRON / FINISHING; the
  sewing crew roles of ``production/crew_router.py``).
* ``production_machine_line_assignments``: one machine (``department_machines``) on one sewing line, same dates.
* Overlap (one active line assignment per employee / machine per date range) is enforced in
  ``production/line_assignment_service.py`` under a row lock (no ``btree_gist``).
* Foreign keys: employee / machine / line RESTRICT (plan section 15 #12), shift SET NULL, users SET NULL.
* RLS policy ``p7_tenant_isolation`` on both tables in this same migration (pattern of 297).

Rollback: ``alembic downgrade 297`` drops both tables. Export ACTIVE assignments first, the data is lost.

Revision ID: 298
Revises: 297
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "298"
down_revision: Union[str, None] = "297"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

EMPLOYEES = "production_employee_line_assignments"
MACHINES = "production_machine_line_assignments"
ROLES = ("OPERATOR", "HELPER", "SUPERVISOR", "QC", "IRON", "FINISHING")


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


def _common_columns() -> list[sa.Column]:
    return [
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("lock_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    ]


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    roles = ",".join(f"'{r}'" for r in ROLES)

    op.create_table(
        EMPLOYEES,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("sewing_line_id", sa.Integer(), nullable=False),
        sa.Column("shift_id", sa.Integer(), nullable=True),
        sa.Column("role", sa.String(length=16), nullable=False, server_default="OPERATOR"),
        *_common_columns(),
        sa.CheckConstraint("valid_to IS NULL OR valid_to >= valid_from", name="ck_prod_emp_line_assign_dates"),
        sa.CheckConstraint(f"role IN ({roles})", name="ck_prod_emp_line_assign_role"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sewing_line_id"], ["sewing_lines.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["shift_id"], ["production_shifts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f(f"ix_{EMPLOYEES}_tenant_id"), EMPLOYEES, ["tenant_id"], unique=False)
    op.create_index("ix_prod_emp_line_assign_line_from", EMPLOYEES, ["tenant_id", "sewing_line_id", "valid_from"])
    op.create_index("ix_prod_emp_line_assign_employee", EMPLOYEES, ["tenant_id", "employee_id"])
    _enable_rls(EMPLOYEES)

    op.create_table(
        MACHINES,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=False),
        sa.Column("sewing_line_id", sa.Integer(), nullable=False),
        *_common_columns(),
        sa.CheckConstraint("valid_to IS NULL OR valid_to >= valid_from", name="ck_prod_mach_line_assign_dates"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["machine_id"], ["department_machines.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sewing_line_id"], ["sewing_lines.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f(f"ix_{MACHINES}_tenant_id"), MACHINES, ["tenant_id"], unique=False)
    op.create_index("ix_prod_mach_line_assign_line_from", MACHINES, ["tenant_id", "sewing_line_id", "valid_from"])
    op.create_index("ix_prod_mach_line_assign_machine", MACHINES, ["tenant_id", "machine_id"])
    _enable_rls(MACHINES)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _disable_rls(MACHINES)
    op.drop_index("ix_prod_mach_line_assign_machine", table_name=MACHINES)
    op.drop_index("ix_prod_mach_line_assign_line_from", table_name=MACHINES)
    op.drop_index(op.f(f"ix_{MACHINES}_tenant_id"), table_name=MACHINES)
    op.drop_table(MACHINES)

    _disable_rls(EMPLOYEES)
    op.drop_index("ix_prod_emp_line_assign_employee", table_name=EMPLOYEES)
    op.drop_index("ix_prod_emp_line_assign_line_from", table_name=EMPLOYEES)
    op.drop_index(op.f(f"ix_{EMPLOYEES}_tenant_id"), table_name=EMPLOYEES)
    op.drop_table(EMPLOYEES)
