"""Attendance devices + raw punches (HR-06).

New, empty tables only — nothing existing is changed:
- ``hr_attendance_devices``: one row per biometric / card terminal; API key stored as SHA-256 hash
  plus a short public prefix used to find the device.
- ``hr_attendance_punches``: every punch received (file import or device push); unique on
  tenant + device + employee + time so a re-import adds nothing.

Rollback: `alembic downgrade 265` (drops both tables and their punches).

Revision ID: 280
Revises: 265
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "280"
down_revision: Union[str, None] = "265"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_attendance_devices",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("device_type", sa.String(24), nullable=False),
        sa.Column("serial_number", sa.String(64), nullable=True),
        sa.Column("api_key_hash", sa.String(64), nullable=False),
        sa.Column("api_key_prefix", sa.String(16), nullable=False),
        sa.Column(
            "default_shift_id",
            sa.Integer(),
            sa.ForeignKey("hr_attendance_shifts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "code", name="uq_hr_attendance_devices_tenant_code"),
        sa.UniqueConstraint("api_key_prefix", name="uq_hr_attendance_devices_api_key_prefix"),
    )
    op.create_index("ix_hr_attendance_devices_tenant_id", "hr_attendance_devices", ["tenant_id"])
    op.create_index("ix_hr_attendance_devices_default_shift_id", "hr_attendance_devices", ["default_shift_id"])

    op.create_table(
        "hr_attendance_punches",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "device_id",
            sa.Integer(),
            sa.ForeignKey("hr_attendance_devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_user_code", sa.String(64), nullable=False),
        sa.Column("punched_at", sa.DateTime(), nullable=False),
        sa.Column("direction", sa.String(8), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "tenant_id",
            "device_id",
            "employee_id",
            "punched_at",
            name="uq_hr_attendance_punches_device_employee_time",
        ),
    )
    op.create_index("ix_hr_attendance_punches_device_id", "hr_attendance_punches", ["device_id"])
    op.create_index("ix_hr_attendance_punches_employee_id", "hr_attendance_punches", ["employee_id"])
    op.create_index(
        "ix_hr_attendance_punches_tenant_employee_time",
        "hr_attendance_punches",
        ["tenant_id", "employee_id", "punched_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_hr_attendance_punches_tenant_employee_time", table_name="hr_attendance_punches")
    op.drop_index("ix_hr_attendance_punches_employee_id", table_name="hr_attendance_punches")
    op.drop_index("ix_hr_attendance_punches_device_id", table_name="hr_attendance_punches")
    op.drop_table("hr_attendance_punches")
    op.drop_index("ix_hr_attendance_devices_default_shift_id", table_name="hr_attendance_devices")
    op.drop_index("ix_hr_attendance_devices_tenant_id", table_name="hr_attendance_devices")
    op.drop_table("hr_attendance_devices")
