"""Attendance devices (biometric / card terminals) and the raw punches they send.

A device authenticates with an API key: only a SHA-256 hash and a short public prefix are stored.
Punches are kept as received; attendance entries are rebuilt from them (see
``app.modules.hr_attendance.device_service``).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AttendanceDevice(Base):
    __tablename__ = "hr_attendance_devices"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_hr_attendance_devices_tenant_code"),
        UniqueConstraint("api_key_prefix", name="uq_hr_attendance_devices_api_key_prefix"),
        # Serial first: the /iclock push finds a device by serial before the company is known.
        Index(
            "uq_hr_attendance_devices_serial_tenant",
            "serial_number",
            "tenant_id",
            unique=True,
            postgresql_where=text("serial_number IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    device_type: Mapped[str] = mapped_column(String(24), nullable=False, default="GENERIC")
    # Stored upper-case. ZKTeco cloud push (/iclock) sends it as ?SN=...
    serial_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Comma-separated IPs / CIDR ranges allowed to push over /iclock (empty = /iclock off).
    push_allowed_ips: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Last ATTLOG stamp the device reported over /iclock (echoed back in the handshake).
    iclock_attlog_stamp: Mapped[str | None] = mapped_column(String(32), nullable=True)
    api_key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    api_key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    default_shift_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_attendance_shifts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class AttendancePunch(Base):
    __tablename__ = "hr_attendance_punches"
    __table_args__ = (
        # Same device + employee + time = same punch: re-importing a file adds nothing.
        UniqueConstraint(
            "tenant_id", "device_id", "employee_id", "punched_at", name="uq_hr_attendance_punches_device_employee_time"
        ),
        Index("ix_hr_attendance_punches_tenant_employee_time", "tenant_id", "employee_id", "punched_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("hr_attendance_devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_user_code: Mapped[str] = mapped_column(String(64), nullable=False)
    # Local business time (company timezone), without timezone info — same as the device clock.
    punched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    direction: Mapped[str] = mapped_column(String(8), nullable=False, default="UNKNOWN")
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="IMPORT")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
