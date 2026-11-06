"""Attendance devices: API keys, storing punches and building daily attendance from them.

How punches become attendance (one entry per employee per day, source ``DEVICE``):
1. The device user code (PIN) is matched to the employee's ``attendance_device_pin`` when one is
   set, otherwise to the employee code (exact match first, then ignoring upper/lower case when
   that finds exactly one employee). Unknown codes are reported, not stored.
2. Punches are stored once: the same device + employee + time is skipped (``duplicates``).
3. For every day that received a punch, the entry is rebuilt from ALL stored punches of that day
   (every device): in time = first punch, out time = last punch (only when there are 2+ punches).
4. Shift for the day: roster -> the device's default shift -> none. A roster "week off" day has no
   shift. With a shift: LATE when in time is after start + grace (late minutes counted from the
   start), early-out minutes before the shift end, overtime minutes after the shift end.
   Without a shift the day is PRESENT with no late / early / overtime minutes.
5. Night shift: a punch in the early morning (up to ``NIGHT_SHIFT_CARRY_HOURS`` after the shift
   end) belongs to the previous day when the previous day's shift is a night shift.
6. Entries typed by hand (source not ``DEVICE``) or corrected through an approved regularization
   are never overwritten (``skipped_manual``); days inside a locked payroll period are skipped
   (``skipped_locked``). Re-importing the same data changes nothing.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import re
import secrets
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AttendanceDevice,
    AttendanceEntry,
    AttendancePunch,
    AttendanceRegularizationRequest,
    AttendanceRoster,
    AttendanceShift,
    Employee,
    PayrollPeriod,
)
from app.modules.hr_attendance.device_adapters import ParseResult

API_KEY_TAG = "p7d"
NIGHT_SHIFT_CARRY_HOURS = 4
ENTRY_SOURCE_DEVICE = "DEVICE"
PUNCH_SOURCE_IMPORT = "IMPORT"
PUNCH_SOURCE_PUSH = "PUSH"
MAX_REPORTED_ITEMS = 100
_INSERT_CHUNK = 1000


# --- API keys -----------------------------------------------------------------------------------


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    """Return (plaintext key shown once, public prefix, sha256 hash to store)."""
    prefix = secrets.token_hex(5)
    raw_key = f"{API_KEY_TAG}_{prefix}_{secrets.token_urlsafe(32)}"
    return raw_key, prefix, hash_api_key(raw_key)


def api_key_prefix(raw_key: str) -> str | None:
    parts = (raw_key or "").strip().split("_", 2)
    if len(parts) != 3 or parts[0] != API_KEY_TAG or len(parts[1]) != 10 or not parts[2]:
        return None
    return parts[1]


async def authenticate_device(db: AsyncSession, raw_key: str | None) -> AttendanceDevice | None:
    """Active device for this key, else None (unknown, wrong or inactive key look the same)."""
    key = (raw_key or "").strip()
    prefix = api_key_prefix(key)
    device = None
    if prefix is not None:
        device = (
            await db.execute(select(AttendanceDevice).where(AttendanceDevice.api_key_prefix == prefix))
        ).scalar_one_or_none()
    expected = device.api_key_hash if device is not None else hash_api_key(secrets.token_hex(16))
    key_ok = hmac.compare_digest(hash_api_key(key), expected)
    if device is None or not key_ok or not device.is_active:
        return None
    return device


def normalize_serial(value: str | None) -> str | None:
    return (value or "").strip().upper() or None


def normalize_allowed_ips(value: str | None) -> str | None:
    """``"203.0.113.7, 198.51.100.0/24"`` -> canonical comma list; raises ValueError on a bad entry."""
    entries = [e for e in re.split(r"[\s,;]+", value or "") if e]
    networks: list[str] = []
    for entry in entries:
        try:
            net = ipaddress.ip_network(entry, strict=False)
        except ValueError:
            raise ValueError(f"'{entry[:45]}' is not an IP address or range (example: 203.0.113.7 or 203.0.113.0/24)") from None
        if str(net) not in networks:
            networks.append(str(net))
    joined = ",".join(networks)
    if len(joined) > 512:
        raise ValueError("Too many allowed IP entries (max 512 characters)")
    return joined or None


def ip_is_allowed(allowed: str | None, client_ip: str) -> bool:
    try:
        ip = ipaddress.ip_address((client_ip or "").strip())
    except ValueError:
        return False
    for entry in (allowed or "").split(","):
        try:
            if entry and ip in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            continue
    return False


def iclock_ready(device: AttendanceDevice) -> bool:
    """/iclock push is on for a device only when it is active and has a serial AND an IP allow-list."""
    return bool(device.is_active and device.serial_number and device.push_allowed_ips)


# --- Import summary -----------------------------------------------------------------------------


@dataclass
class PunchImportSummary:
    received: int = 0
    inserted: int = 0
    duplicates: int = 0
    unmatched_codes: list[str] = field(default_factory=list)
    unmatched_punches: int = 0
    invalid_lines: list[dict[str, Any]] = field(default_factory=list)
    invalid_count: int = 0
    entries_created: int = 0
    entries_updated: int = 0
    entries_unchanged: int = 0
    skipped_manual: int = 0
    skipped_locked: int = 0

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


# --- Matching employees -------------------------------------------------------------------------


def _match_one(code: str, exact: dict[str, int], by_lower: dict[str, set[int]]) -> int | None:
    if code in exact:
        return exact[code]
    candidates = by_lower.get(code.lower(), set())
    return next(iter(candidates)) if len(candidates) == 1 else None


async def match_employee_codes(db: AsyncSession, tenant_id: int, codes: set[str]) -> dict[str, int]:
    """{device user code: employee id} for the codes that match exactly one employee of the tenant.

    The employee's ``attendance_device_pin`` wins when it is filled in; otherwise the device code
    is compared with the employee code (exact first, then ignoring upper / lower case).
    """
    if not codes:
        return {}
    lowered = {c.strip().lower() for c in codes}
    pin_col = func.lower(func.trim(Employee.attendance_device_pin))
    code_col = func.lower(func.trim(Employee.employee_code))
    rows = (
        await db.execute(
            select(Employee.id, Employee.employee_code, Employee.attendance_device_pin).where(
                Employee.tenant_id == tenant_id,
                or_(code_col.in_(lowered), pin_col.in_(lowered)),
            )
        )
    ).all()
    pin_exact: dict[str, int] = {}
    pin_lower: dict[str, set[int]] = defaultdict(set)
    code_exact: dict[str, int] = {}
    code_lower: dict[str, set[int]] = defaultdict(set)
    for emp_id, emp_code, emp_pin in rows:
        pin = (emp_pin or "").strip()
        if pin:
            pin_exact[pin] = emp_id
            pin_lower[pin.lower()].add(emp_id)
        clean = (emp_code or "").strip()
        code_exact[clean] = emp_id
        code_lower[clean.lower()].add(emp_id)
    matched: dict[str, int] = {}
    for code in codes:
        emp_id = _match_one(code, pin_exact, pin_lower)
        if emp_id is None:
            emp_id = _match_one(code, code_exact, code_lower)
        if emp_id is not None:
            matched[code] = emp_id
    return matched


# --- Building an attendance entry from punches --------------------------------------------------


def _minutes(delta: timedelta) -> int:
    return max(int(delta.total_seconds() // 60), 0)


def _shift_window(work_date: date, shift: AttendanceShift) -> tuple[datetime, datetime]:
    start = datetime.combine(work_date, shift.start_time)
    end = datetime.combine(work_date, shift.end_time)
    if shift.is_night_shift or end <= start:
        end += timedelta(days=1)
    return start, end


def _night_carry_limit(shift: AttendanceShift) -> time:
    end = datetime.combine(date(2000, 1, 1), shift.end_time) + timedelta(hours=NIGHT_SHIFT_CARRY_HOURS)
    return end.time() if end.date() == date(2000, 1, 1) else time(23, 59, 59)


def pair_in_out(
    times: list[datetime], directions: dict[datetime, str] | None
) -> tuple[datetime | None, datetime | None]:
    """(in, out) for one work day. The earliest punch is IN and the latest is OUT. Fingerprint / face
    terminals also report a direction per punch: a day with a single punch that the terminal marked
    OUT is recorded as an OUT time (IN missing) instead of an IN time, so it shows in the missing-punch
    queue the right way round."""
    times = sorted(times)
    if len(times) == 1:
        only = times[0]
        if directions and (directions.get(only) or "").upper() == "OUT":
            return None, only
        return only, None
    return times[0], times[-1]


def build_entry_values(
    work_date: date,
    punch_times: list[datetime],
    shift: AttendanceShift | None,
    directions: dict[datetime, str] | None = None,
) -> dict[str, Any]:
    """Entry fields (in/out, status, late / early-out / overtime minutes) for one day's punches."""
    first, last = pair_in_out(punch_times, directions)
    values: dict[str, Any] = {
        "in_time": first.time() if first is not None else None,
        "out_time": last.time() if last is not None else None,
        "status": "PRESENT",
        "late_minutes": 0,
        "early_out_minutes": 0,
        "overtime_minutes": 0,
    }
    if shift is None:
        return values
    start, end = _shift_window(work_date, shift)
    if first is not None and first > start + timedelta(minutes=shift.grace_in_minutes or 0):
        values["status"] = "LATE"
        values["late_minutes"] = _minutes(first - start)
    if last is not None:
        if last < end:
            values["early_out_minutes"] = _minutes(end - last)
        elif last > end:
            values["overtime_minutes"] = _minutes(last - end)
    return values


_COMPARED_FIELDS = ("in_time", "out_time", "status", "late_minutes", "early_out_minutes", "overtime_minutes")


async def _rebuild_entries(
    db: AsyncSession,
    *,
    tenant_id: int,
    device: AttendanceDevice,
    batch: dict[int, set[datetime]],
    summary: PunchImportSummary,
    user_id: int | None,
) -> None:
    all_dates = [dt.date() for times in batch.values() for dt in times]
    low = min(all_dates) - timedelta(days=1)
    high = max(all_dates) + timedelta(days=1)
    employee_ids = sorted(batch)

    shifts = {
        s.id: s
        for s in (await db.execute(select(AttendanceShift).where(AttendanceShift.tenant_id == tenant_id))).scalars()
    }
    default_shift = shifts.get(device.default_shift_id) if device.default_shift_id else None
    rosters = {
        (r.employee_id, r.roster_date): r
        for r in (
            await db.execute(
                select(AttendanceRoster).where(
                    AttendanceRoster.tenant_id == tenant_id,
                    AttendanceRoster.employee_id.in_(employee_ids),
                    AttendanceRoster.roster_date >= low - timedelta(days=1),
                    AttendanceRoster.roster_date <= high,
                )
            )
        ).scalars()
    }
    locked_periods = (
        await db.execute(
            select(PayrollPeriod.start_date, PayrollPeriod.end_date).where(
                PayrollPeriod.tenant_id == tenant_id,
                PayrollPeriod.is_locked.is_(True),
                PayrollPeriod.start_date <= high,
                PayrollPeriod.end_date >= low,
            )
        )
    ).all()
    stored: dict[int, list[datetime]] = defaultdict(list)
    directions: dict[int, dict[datetime, str]] = defaultdict(dict)
    for emp_id, punched_at, direction in (
        await db.execute(
            select(AttendancePunch.employee_id, AttendancePunch.punched_at, AttendancePunch.direction).where(
                AttendancePunch.tenant_id == tenant_id,
                AttendancePunch.employee_id.in_(employee_ids),
                AttendancePunch.punched_at >= datetime.combine(low, time.min),
                AttendancePunch.punched_at < datetime.combine(high + timedelta(days=1), time.min),
            )
        )
    ).all():
        stored[emp_id].append(punched_at)
        # Several readers can record the same instant; an explicit OUT wins over IN for that instant.
        if directions[emp_id].get(punched_at) != "OUT":
            directions[emp_id][punched_at] = (direction or "").upper()

    def shift_for(emp_id: int, day: date) -> AttendanceShift | None:
        roster = rosters.get((emp_id, day))
        if roster is not None:
            return None if roster.is_week_off else shifts.get(roster.shift_id)
        return default_shift

    def work_date_of(emp_id: int, punched_at: datetime) -> date:
        previous = punched_at.date() - timedelta(days=1)
        prev_shift = shift_for(emp_id, previous)
        if prev_shift is not None and prev_shift.is_night_shift and punched_at.time() <= _night_carry_limit(prev_shift):
            return previous
        return punched_at.date()

    def is_locked(day: date) -> bool:
        return any(start <= day <= end for start, end in locked_periods)

    targets: dict[int, set[date]] = {
        emp_id: {work_date_of(emp_id, dt) for dt in times} for emp_id, times in batch.items()
    }
    target_dates = {d for days in targets.values() for d in days}
    existing = {
        (e.employee_id, e.attendance_date): e
        for e in (
            await db.execute(
                select(AttendanceEntry).where(
                    AttendanceEntry.tenant_id == tenant_id,
                    AttendanceEntry.employee_id.in_(employee_ids),
                    AttendanceEntry.attendance_date.in_(target_dates),
                )
            )
        ).scalars()
    }
    regularized: set[int] = set()
    if existing:
        regularized = set(
            (
                await db.execute(
                    select(AttendanceRegularizationRequest.attendance_entry_id).where(
                        AttendanceRegularizationRequest.tenant_id == tenant_id,
                        AttendanceRegularizationRequest.attendance_entry_id.in_([e.id for e in existing.values()]),
                        AttendanceRegularizationRequest.status == "APPROVED",
                    )
                )
            ).scalars()
        )

    for emp_id in employee_ids:
        by_day: dict[date, list[datetime]] = defaultdict(list)
        for punched_at in stored.get(emp_id, []):
            by_day[work_date_of(emp_id, punched_at)].append(punched_at)
        for day in sorted(targets[emp_id]):
            if is_locked(day):
                summary.skipped_locked += 1
                continue
            if not by_day.get(day):
                continue
            values = build_entry_values(day, by_day[day], shift_for(emp_id, day), directions.get(emp_id))
            entry = existing.get((emp_id, day))
            if entry is None:
                created_id = (
                    await db.execute(
                        pg_insert(AttendanceEntry)
                        .values(
                            tenant_id=tenant_id,
                            employee_id=emp_id,
                            attendance_date=day,
                            source=ENTRY_SOURCE_DEVICE,
                            remarks=f"From attendance device {device.code}",
                            created_by=user_id,
                            created_at=datetime.utcnow(),
                            updated_at=datetime.utcnow(),
                            **values,
                        )
                        .on_conflict_do_nothing(constraint="uq_hr_attendance_entries_employee_date")
                        .returning(AttendanceEntry.id)
                    )
                ).scalar_one_or_none()
                if created_id is None:
                    summary.skipped_manual += 1
                else:
                    summary.entries_created += 1
                continue
            if (entry.source or "").upper() != ENTRY_SOURCE_DEVICE or entry.id in regularized:
                summary.skipped_manual += 1
                continue
            if all(getattr(entry, k) == values[k] for k in _COMPARED_FIELDS):
                summary.entries_unchanged += 1
                continue
            for key, value in values.items():
                setattr(entry, key, value)
            summary.entries_updated += 1


async def process_punches(
    db: AsyncSession,
    *,
    tenant_id: int,
    device: AttendanceDevice,
    parsed: ParseResult,
    source: str,
    user_id: int | None = None,
) -> PunchImportSummary:
    """Store new punches and rebuild the affected attendance entries. Caller commits."""
    summary = PunchImportSummary(
        received=len(parsed.punches) + len(parsed.invalid_lines),
        invalid_lines=parsed.invalid_lines[:MAX_REPORTED_ITEMS],
        invalid_count=len(parsed.invalid_lines),
    )
    if source == PUNCH_SOURCE_PUSH:
        device.last_seen_at = datetime.utcnow()
    if not parsed.punches:
        return summary

    code_map = await match_employee_codes(db, tenant_id, {p.user_code for p in parsed.punches})
    unmatched: set[str] = set()
    rows: dict[tuple[int, datetime], dict[str, Any]] = {}
    matched_count = 0
    for punch in parsed.punches:
        emp_id = code_map.get(punch.user_code)
        if emp_id is None:
            unmatched.add(punch.user_code)
            summary.unmatched_punches += 1
            continue
        matched_count += 1
        rows.setdefault(
            (emp_id, punch.punched_at),
            {
                "tenant_id": tenant_id,
                "device_id": device.id,
                "employee_id": emp_id,
                "device_user_code": punch.user_code,
                "punched_at": punch.punched_at,
                "direction": punch.direction,
                "source": source,
                "created_at": datetime.utcnow(),
            },
        )
    summary.unmatched_codes = sorted(unmatched)[:MAX_REPORTED_ITEMS]
    if not rows:
        return summary

    employee_ids = sorted({emp_id for emp_id, _ in rows})
    # Two imports for the same people wait for each other, so each sees the other's punches.
    await db.execute(select(Employee.id).where(Employee.id.in_(employee_ids)).order_by(Employee.id).with_for_update())

    values = list(rows.values())
    inserted = 0
    for start in range(0, len(values), _INSERT_CHUNK):
        stmt = (
            pg_insert(AttendancePunch)
            .values(values[start : start + _INSERT_CHUNK])
            .on_conflict_do_nothing(constraint="uq_hr_attendance_punches_device_employee_time")
            .returning(AttendancePunch.id)
        )
        inserted += len((await db.execute(stmt)).all())
    summary.inserted = inserted
    summary.duplicates = matched_count - inserted

    batch: dict[int, set[datetime]] = defaultdict(set)
    for emp_id, punched_at in rows:
        batch[emp_id].add(punched_at)
    await _rebuild_entries(db, tenant_id=tenant_id, device=device, batch=batch, summary=summary, user_id=user_id)
    return summary
