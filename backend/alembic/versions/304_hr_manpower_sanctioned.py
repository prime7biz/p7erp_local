"""HR Manpower Control Phase 1: sanctioned strength, settings, department groups.

Additive only. Nothing reads these tables while the strict tenant flag
``manpower_control_v1`` is OFF.

* ``hr_manpower_sanctioned_strength``: approved quota by department + designation
* ``hr_manpower_settings``: ratio targets JSONB + allow_unmapped_hire
* ``hr_manpower_department_groups``: SEWING / CUTTING / FINISHING / OTHER mapping
* Composite index on employees for standing headcount counts
* RLS policy ``p7_tenant_isolation`` on each new table

Rollback: switch the flag off, export rows, then ``alembic downgrade 303``.

Revision ID: 304
Revises: 303
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "304"
down_revision: Union[str, None] = "303"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLES = (
    "hr_manpower_sanctioned_strength",
    "hr_manpower_settings",
    "hr_manpower_department_groups",
)


def _enable_rls(table: str) -> None:
    expr = " OR ".join(f"({p})" for p in (_RLS_BYPASS, _RLS_SAME_TENANT))
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(
        f"CREATE POLICY {RLS_POLICY_NAME} ON {table} AS PERMISSIVE FOR ALL "
        f"USING ({expr}) WITH CHECK ({expr})"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def _disable_rls(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    op.create_table(
        "hr_manpower_sanctioned_strength",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("hr_departments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "designation_id",
            sa.Integer(),
            sa.ForeignKey("hr_designations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("approved_quota", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "tenant_id",
            "department_id",
            "designation_id",
            "effective_from",
            name="uq_hr_manpower_sanctioned_cell_from",
        ),
        sa.CheckConstraint("approved_quota >= 0", name="ck_hr_manpower_sanctioned_quota_nonneg"),
    )
    op.create_index("ix_hr_manpower_sanctioned_strength_tenant_id", "hr_manpower_sanctioned_strength", ["tenant_id"])
    op.create_index(
        "ix_hr_manpower_sanctioned_tenant_dept_desig",
        "hr_manpower_sanctioned_strength",
        ["tenant_id", "department_id", "designation_id"],
    )

    op.create_table(
        "hr_manpower_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("targets", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("allow_unmapped_hire", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("updated_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", name="uq_hr_manpower_settings_tenant"),
    )
    op.create_index("ix_hr_manpower_settings_tenant_id", "hr_manpower_settings", ["tenant_id"])

    op.create_table(
        "hr_manpower_department_groups",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("hr_departments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("group_key", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "department_id", name="uq_hr_manpower_dept_group_dept"),
        sa.CheckConstraint(
            "group_key IN ('SEWING', 'CUTTING', 'FINISHING', 'OTHER')",
            name="ck_hr_manpower_dept_group_key",
        ),
    )
    op.create_index("ix_hr_manpower_department_groups_tenant_id", "hr_manpower_department_groups", ["tenant_id"])

    # Speeds standing headcount: count active employees in a dept+designation cell.
    # Plain CREATE INDEX (not CONCURRENTLY) — brief write lock on hr_employees, bounded by
    # lock_timeout above. On a very large live table, prefer a deploy window or a follow-up
    # non-transactional CREATE INDEX CONCURRENTLY migration instead of forcing this build.
    op.create_index(
        "ix_hr_employees_tenant_dept_desig_active",
        "hr_employees",
        ["tenant_id", "department_id", "designation_id", "is_active"],
    )

    for table in TABLES:
        _enable_rls(table)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in TABLES:
        _disable_rls(table)
    op.drop_index("ix_hr_employees_tenant_dept_desig_active", table_name="hr_employees")
    op.drop_table("hr_manpower_department_groups")
    op.drop_table("hr_manpower_settings")
    op.drop_table("hr_manpower_sanctioned_strength")
