"""Request / response shapes for attendance devices and punch imports."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

DEVICE_TYPES = ("GENERIC", "ZKTECO")


class AttendanceDeviceCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=128)
    device_type: str = Field("GENERIC", min_length=1, max_length=24)
    serial_number: str | None = Field(None, max_length=64)
    default_shift_id: int | None = None


class AttendanceDeviceUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=32)
    name: str | None = Field(None, min_length=1, max_length=128)
    device_type: str | None = Field(None, min_length=1, max_length=24)
    serial_number: str | None = Field(None, max_length=64)
    default_shift_id: int | None = None
    is_active: bool | None = None


class AttendanceDeviceOut(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    device_type: str
    serial_number: str | None
    api_key_prefix: str
    default_shift_id: int | None
    is_active: bool
    last_seen_at: str | None
    created_by: int | None
    created_at: str
    updated_at: str


class AttendanceDeviceWithKeyOut(AttendanceDeviceOut):
    # Plaintext key: returned only by create / rotate-key, never stored or listed.
    api_key: str


class PunchImportJsonBody(BaseModel):
    """JSON import: either ``punches`` (list of objects) or ``text`` (CSV / ZKTeco lines)."""

    format: str | None = Field(None, description="csv | json | zkteco (guessed when empty)")
    punches: list[dict[str, Any]] | None = None
    text: str | None = None


class PunchImportSummaryOut(BaseModel):
    received: int
    inserted: int
    duplicates: int
    unmatched_codes: list[str]
    unmatched_punches: int
    invalid_lines: list[dict[str, Any]]
    invalid_count: int
    entries_created: int
    entries_updated: int
    entries_unchanged: int
    skipped_manual: int
    skipped_locked: int
