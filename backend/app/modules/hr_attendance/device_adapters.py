"""Turn attendance-device data into a list of punches (who, when, in/out).

Supported formats (one adapter class each):
- CSV:      ``employee_code,punched_at[,direction]`` — header row optional, extra columns ignored.
- JSON:     ``[{"employee_code": "E001", "punched_at": "2026-11-05 08:01", "direction": "IN"}, ...]``
            or ``{"punches": [...]}``.
- ZKTeco:   ATTLOG text lines ``PIN<TAB>YYYY-MM-DD HH:MM:SS<TAB>status<TAB>verify...`` (USB export
            ``attlog.dat`` or the device's push/ADMS upload).

Timestamps: ``YYYY-MM-DD HH:MM``, ``YYYY-MM-DD HH:MM:SS`` or ISO ``YYYY-MM-DDTHH:MM[:SS]``. A
timestamp with a timezone (``Z`` / ``+06:00``) is converted to the company timezone; without one it
is taken as company local time (device clocks run on local time).

A bad line never stops the import: it is reported in ``invalid_lines`` and the rest is used.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass, field
from datetime import datetime, tzinfo
from typing import Any

MAX_PUNCHES_PER_REQUEST = 5000
MAX_CODE_LENGTH = 64

DIRECTION_IN = "IN"
DIRECTION_OUT = "OUT"
DIRECTION_UNKNOWN = "UNKNOWN"

_DIRECTION_WORDS = {
    "in": DIRECTION_IN,
    "i": DIRECTION_IN,
    "checkin": DIRECTION_IN,
    "check-in": DIRECTION_IN,
    "check in": DIRECTION_IN,
    "out": DIRECTION_OUT,
    "o": DIRECTION_OUT,
    "checkout": DIRECTION_OUT,
    "check-out": DIRECTION_OUT,
    "check out": DIRECTION_OUT,
}
# ZKTeco punch state: 0 check-in, 1 check-out, 2 break-out, 3 break-in, 4 OT-in, 5 OT-out.
_ZK_STATUS = {"0": DIRECTION_IN, "1": DIRECTION_OUT, "2": DIRECTION_OUT, "3": DIRECTION_IN, "4": DIRECTION_IN, "5": DIRECTION_OUT}

_CODE_HEADERS = {"employee_code", "code", "emp_code", "employee", "pin", "user_id", "userid", "user_code", "enroll_no"}
_TIME_HEADERS = {"punched_at", "punch_time", "timestamp", "time", "datetime", "date_time", "checktime"}
_DIRECTION_HEADERS = {"direction", "type", "in_out", "inout", "status", "state"}

_TIME_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M")


@dataclass
class RawPunch:
    line_no: int
    user_code: str
    punched_at: datetime  # naive, company local time
    direction: str = DIRECTION_UNKNOWN


@dataclass
class ParseResult:
    punches: list[RawPunch] = field(default_factory=list)
    invalid_lines: list[dict[str, Any]] = field(default_factory=list)

    def reject(self, line_no: int, error: str) -> None:
        self.invalid_lines.append({"line": line_no, "error": error})


class TooManyPunchesError(ValueError):
    pass


def parse_timestamp(value: Any, tz: tzinfo | None = None) -> datetime:
    """Parse a device timestamp into a naive local datetime (raises ValueError when unreadable)."""
    text = str(value or "").strip()
    if not text:
        raise ValueError("missing time")
    for fmt in _TIME_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"unreadable time '{text[:40]}' (use YYYY-MM-DD HH:MM:SS)") from None
    if parsed.tzinfo is not None:
        if tz is not None:
            parsed = parsed.astimezone(tz)
        parsed = parsed.replace(tzinfo=None)
    return parsed.replace(microsecond=0)


def parse_direction(value: Any) -> str:
    key = str(value or "").strip().lower()
    if key in _ZK_STATUS:
        return _ZK_STATUS[key]
    return _DIRECTION_WORDS.get(key, DIRECTION_UNKNOWN)


def _clean_code(value: Any) -> str:
    return str(value or "").strip()


class PunchAdapter:
    """Base class: ``parse(payload)`` returns punches and the lines that could not be read."""

    name = "BASE"

    def __init__(self, tz: tzinfo | None = None) -> None:
        self.tz = tz

    def parse(self, payload: Any) -> ParseResult:
        raise NotImplementedError

    def _add(self, result: ParseResult, line_no: int, code: Any, when: Any, direction: Any = None) -> None:
        user_code = _clean_code(code)
        if not user_code:
            result.reject(line_no, "missing employee code")
            return
        if len(user_code) > MAX_CODE_LENGTH:
            result.reject(line_no, "employee code is too long")
            return
        try:
            punched_at = parse_timestamp(when, self.tz)
        except ValueError as exc:
            result.reject(line_no, str(exc))
            return
        if len(result.punches) >= MAX_PUNCHES_PER_REQUEST:
            raise TooManyPunchesError(
                f"Too many punches in one request (max {MAX_PUNCHES_PER_REQUEST}); split the file and import again"
            )
        result.punches.append(RawPunch(line_no, user_code, punched_at, parse_direction(direction)))


class CsvPunchAdapter(PunchAdapter):
    name = "CSV"

    def parse(self, payload: Any) -> ParseResult:
        result = ParseResult()
        rows = list(csv.reader(io.StringIO(str(payload or "").lstrip("\ufeff"))))
        code_i, time_i, dir_i = 0, 1, 2
        start = 0
        if rows:
            header = [c.strip().lower() for c in rows[0]]
            if any(h in _CODE_HEADERS | _TIME_HEADERS for h in header):
                start = 1
                code_i = next((i for i, h in enumerate(header) if h in _CODE_HEADERS), 0)
                time_i = next((i for i, h in enumerate(header) if h in _TIME_HEADERS), 1)
                dir_i = next((i for i, h in enumerate(header) if h in _DIRECTION_HEADERS), -1)
        for index, row in enumerate(rows[start:], start=start + 1):
            if not any(c.strip() for c in row):
                continue
            if len(row) <= max(code_i, time_i):
                result.reject(index, "expected at least employee_code and punched_at")
                continue
            direction = row[dir_i] if 0 <= dir_i < len(row) else None
            self._add(result, index, row[code_i], row[time_i], direction)
        return result


class JsonPunchAdapter(PunchAdapter):
    name = "JSON"

    def parse(self, payload: Any) -> ParseResult:
        result = ParseResult()
        data = payload
        if isinstance(payload, (str, bytes)):
            try:
                data = json.loads(payload)
            except ValueError:
                result.reject(1, "not valid JSON")
                return result
        if isinstance(data, dict):
            data = data.get("punches")
        if not isinstance(data, list):
            result.reject(1, 'expected a list of punches or {"punches": [...]}')
            return result
        for index, item in enumerate(data, start=1):
            if not isinstance(item, dict):
                result.reject(index, "each punch must be an object")
                continue
            code = next((item.get(k) for k in ("employee_code", "user_code", "pin", "code") if item.get(k) is not None), None)
            when = next((item.get(k) for k in ("punched_at", "timestamp", "time") if item.get(k) is not None), None)
            self._add(result, index, code, when, item.get("direction"))
        return result


class ZkAttlogAdapter(PunchAdapter):
    name = "ZKTECO"

    def parse(self, payload: Any) -> ParseResult:
        result = ParseResult()
        for index, raw_line in enumerate(str(payload or "").lstrip("\ufeff").splitlines(), start=1):
            line = raw_line.strip()
            if not line:
                continue
            parts = [p.strip() for p in line.split("\t")]
            if len(parts) < 2:
                # Some exports use spaces: "PIN YYYY-MM-DD HH:MM:SS status ..."
                words = line.split()
                if len(words) < 3:
                    result.reject(index, "expected PIN<TAB>YYYY-MM-DD HH:MM:SS")
                    continue
                parts = [words[0], f"{words[1]} {words[2]}", *words[3:]]
            status = parts[2] if len(parts) > 2 else None
            self._add(result, index, parts[0], parts[1], status)
        return result


FORMAT_ADAPTERS: dict[str, type[PunchAdapter]] = {
    "csv": CsvPunchAdapter,
    "json": JsonPunchAdapter,
    "zkteco": ZkAttlogAdapter,
}


def detect_format(*, filename: str | None, content_type: str | None, text: str) -> str:
    """Guess csv / json / zkteco from the file name, content type, then the first line."""
    name = (filename or "").lower()
    ctype = (content_type or "").lower()
    if name.endswith(".json") or "json" in ctype:
        return "json"
    if name.endswith(".csv"):
        return "csv"
    if name.endswith((".dat", ".txt")):
        return "zkteco"
    stripped = text.lstrip("\ufeff").lstrip()
    if stripped.startswith(("[", "{")):
        return "json"
    first_line = stripped.splitlines()[0] if stripped else ""
    if "\t" in first_line:
        return "zkteco"
    return "csv"


def parse_punches(fmt: str, payload: Any, tz: tzinfo | None = None) -> ParseResult:
    adapter_cls = FORMAT_ADAPTERS.get((fmt or "").strip().lower())
    if adapter_cls is None:
        raise ValueError(f"Unknown format '{fmt}'. Use one of: {', '.join(FORMAT_ADAPTERS)}")
    return adapter_cls(tz).parse(payload)
