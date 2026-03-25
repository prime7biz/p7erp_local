"""Manufacturing foundation: tenant production settings, shifts, calendar, machines, sewing lines.

Revision ID: 092
Revises: 091
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "092"
down_revision: Union[str, None] = "091"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tenant_production_settings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column(
            "enabled_optional_units",
            postgresql.JSON(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "weekend_days",
            postgresql.JSON(astext_type=sa.Text()),
            nullable=False,
            server_default='["friday","saturday"]',
        ),
        sa.Column("cm_alert_threshold_pct", sa.Numeric(8, 2), nullable=False, server_default="10"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_production_settings_tenant_id"),
    )
    op.create_index("ix_tenant_production_settings_tenant_id", "tenant_production_settings", ["tenant_id"])

    op.create_table(
        "production_shifts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("shift_code", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("break_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "shift_code", name="uq_production_shifts_tenant_shift_code"),
    )
    op.create_index("ix_production_shifts_tenant_id", "production_shifts", ["tenant_id"])

    op.create_table(
        "factory_calendar_overrides",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("override_date", sa.Date(), nullable=False),
        sa.Column("override_type", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "override_date", name="uq_factory_calendar_tenant_date"),
    )
    op.create_index("ix_factory_calendar_overrides_tenant_id", "factory_calendar_overrides", ["tenant_id"])

    op.create_table(
        "department_machines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("department_type", sa.String(length=32), nullable=False),
        sa.Column("machine_code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("machine_type", sa.String(length=64), nullable=True),
        sa.Column("specs", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "machine_code", name="uq_department_machines_tenant_code"),
    )
    op.create_index("ix_department_machines_tenant_id", "department_machines", ["tenant_id"])
    op.create_index("ix_department_machines_department_type", "department_machines", ["department_type"])

    op.create_table(
        "sewing_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("line_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("default_machine_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("default_operator_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("supervisor_user_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supervisor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "line_code", name="uq_sewing_lines_tenant_line_code"),
    )
    op.create_index("ix_sewing_lines_tenant_id", "sewing_lines", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_sewing_lines_tenant_id", table_name="sewing_lines")
    op.drop_table("sewing_lines")
    op.drop_index("ix_department_machines_department_type", table_name="department_machines")
    op.drop_index("ix_department_machines_tenant_id", table_name="department_machines")
    op.drop_table("department_machines")
    op.drop_index("ix_factory_calendar_overrides_tenant_id", table_name="factory_calendar_overrides")
    op.drop_table("factory_calendar_overrides")
    op.drop_index("ix_production_shifts_tenant_id", table_name="production_shifts")
    op.drop_table("production_shifts")
    op.drop_index("ix_tenant_production_settings_tenant_id", table_name="tenant_production_settings")
    op.drop_table("tenant_production_settings")
