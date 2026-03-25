"""Production QC, worker skills, weekly roster, line crew sheet status.

Revision ID: 108
Revises: 107
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "108"
down_revision: Union[str, None] = "107"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "production_defect_codes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column("severity", sa.String(length=32), nullable=False, server_default="medium"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "code", name="uq_production_defect_codes_tenant_code"),
    )

    op.create_table(
        "production_qc_checks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("sewing_line_id", sa.Integer(), sa.ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("production_shifts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("production_date", sa.Date(), nullable=False, index=True),
        sa.Column("hour_slot", sa.Integer(), nullable=False),
        sa.Column("check_type", sa.String(length=32), nullable=False, server_default="inline"),
        sa.Column("total_checked", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pass_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fail_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("defect_codes", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("entered_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "tenant_id",
            "sewing_line_id",
            "shift_id",
            "production_date",
            "hour_slot",
            "check_type",
            name="uq_production_qc_checks_slot",
        ),
    )

    op.create_table(
        "worker_skills",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column(
            "ie_operation_id",
            sa.Integer(),
            sa.ForeignKey("ie_operations_library.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("skill_level", sa.String(length=32), nullable=False, server_default="trainee"),
        sa.Column("certified_at", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "employee_id", "ie_operation_id", name="uq_worker_skills_tenant_emp_op"),
    )

    op.create_table(
        "line_crew_sheet_headers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("sewing_line_id", sa.Integer(), sa.ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("production_shifts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("production_date", sa.Date(), nullable=False, index=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="draft"),
        sa.Column("submitted_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "tenant_id",
            "sewing_line_id",
            "shift_id",
            "production_date",
            name="uq_line_crew_sheet_headers_line_shift_date",
        ),
    )

    op.create_table(
        "crew_roster_weekly",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("week_start_date", sa.Date(), nullable=False, index=True),
        sa.Column("sewing_line_id", sa.Integer(), sa.ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("production_shifts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("crew_role_id", sa.Integer(), sa.ForeignKey("production_crew_roles.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("planned_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "tenant_id",
            "week_start_date",
            "sewing_line_id",
            "shift_id",
            "crew_role_id",
            "day_of_week",
            name="uq_crew_roster_weekly_cell",
        ),
    )


def downgrade() -> None:
    op.drop_table("crew_roster_weekly")
    op.drop_table("line_crew_sheet_headers")
    op.drop_table("worker_skills")
    op.drop_table("production_qc_checks")
    op.drop_table("production_defect_codes")
