"""ZKTeco cloud push (/iclock) setup columns + optional device PIN per employee.

Changes (all nullable, nothing existing is rewritten):
- ``hr_attendance_devices.push_allowed_ips``: comma-separated IPs / CIDR ranges allowed to push
  as this device over /iclock. The /iclock endpoint ignores a device until BOTH this and
  ``serial_number`` are filled in.
- ``hr_attendance_devices.iclock_attlog_stamp``: last ATTLOG stamp the device reported, sent back
  in the handshake so the device does not re-upload its whole log.
- ``uq_hr_attendance_devices_serial_tenant``: one device per serial number inside a company
  (table created in 280, still small).
- ``hr_employees.attendance_device_pin``: the user number enrolled on the machine when it is not
  the employee code. Unique per company when filled. Its index is built CONCURRENTLY, so the
  populated employees table is not locked for writes.

No new tables, so no new Row-Level Security policy is needed (both tables already have one).

Rollback: ``alembic downgrade 280`` (drops the columns and indexes; device PINs typed in are lost).

Revision ID: 281
Revises: 280
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "281"
down_revision: Union[str, None] = "280"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PIN_INDEX = "uq_hr_employees_tenant_attendance_device_pin"
SERIAL_INDEX = "uq_hr_attendance_devices_serial_tenant"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.add_column("hr_attendance_devices", sa.Column("push_allowed_ips", sa.String(512), nullable=True))
    op.add_column("hr_attendance_devices", sa.Column("iclock_attlog_stamp", sa.String(32), nullable=True))
    op.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {SERIAL_INDEX} "
        "ON hr_attendance_devices (serial_number, tenant_id) WHERE serial_number IS NOT NULL"
    )
    op.add_column("hr_employees", sa.Column("attendance_device_pin", sa.String(32), nullable=True))
    with op.get_context().autocommit_block():
        # A failed CONCURRENTLY build leaves an INVALID index behind; drop it so the retry rebuilds it.
        is_invalid = op.get_bind().execute(
            sa.text("SELECT NOT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:name)"),
            {"name": PIN_INDEX},
        ).scalar()
        if is_invalid:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {PIN_INDEX}")
        op.execute(
            f"CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS {PIN_INDEX} "
            "ON hr_employees (tenant_id, attendance_device_pin) WHERE attendance_device_pin IS NOT NULL"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {PIN_INDEX}")
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.drop_column("hr_employees", "attendance_device_pin")
    op.execute(f"DROP INDEX IF EXISTS {SERIAL_INDEX}")
    op.drop_column("hr_attendance_devices", "iclock_attlog_stamp")
    op.drop_column("hr_attendance_devices", "push_allowed_ips")
