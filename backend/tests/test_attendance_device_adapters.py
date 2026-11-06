"""Attendance device file / payload parsing (no database).

Run: docker exec <backend> pytest tests/test_attendance_device_adapters.py -q
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

import pytest

from app.modules.hr_attendance.device_adapters import (
    MAX_PUNCHES_PER_REQUEST,
    TooManyPunchesError,
    detect_format,
    parse_punches,
    parse_timestamp,
)
from app.modules.hr_attendance.device_service import (
    api_key_prefix,
    build_entry_values,
    generate_api_key,
    hash_api_key,
)

DHAKA = timezone(timedelta(hours=6))


def test_csv_with_header_extra_columns_and_bad_lines():
    text = (
        "\ufeffName,Employee_Code,Punched_At,Direction\n"
        "Rahim,E001,2026-11-05 08:01,IN\n"
        "Rahim,E001,2026-11-05T17:30:15,out\n"
        "Karim,,2026-11-05 08:00,IN\n"
        "Karim,E002,yesterday,IN\n"
        "\n"
        "Short\n"
    )
    result = parse_punches("csv", text)
    assert [(p.user_code, p.punched_at, p.direction) for p in result.punches] == [
        ("E001", datetime(2026, 11, 5, 8, 1), "IN"),
        ("E001", datetime(2026, 11, 5, 17, 30, 15), "OUT"),
    ]
    assert [x["line"] for x in result.invalid_lines] == [4, 5, 7]
    assert "missing employee code" in result.invalid_lines[0]["error"]


def test_csv_without_header_is_positional():
    result = parse_punches("csv", "E001,2026-11-05 08:01:00\nE002,2026/11/05 09:00\n")
    assert [p.user_code for p in result.punches] == ["E001", "E002"]
    assert result.punches[1].punched_at == datetime(2026, 11, 5, 9, 0)
    assert result.invalid_lines == []


def test_json_list_and_wrapped_object():
    payload = [
        {"employee_code": "E001", "punched_at": "2026-11-05 08:01", "direction": "IN"},
        {"pin": "E002", "timestamp": "2026-11-05T02:00:00Z"},
        {"employee_code": "E003"},
        "oops",
    ]
    result = parse_punches("json", payload, DHAKA)
    assert len(result.punches) == 2
    # A UTC time is converted to the company timezone (UTC+6).
    assert result.punches[1].punched_at == datetime(2026, 11, 5, 8, 0)
    assert [x["line"] for x in result.invalid_lines] == [3, 4]
    wrapped = parse_punches("json", '{"punches": [{"user_code": "E9", "time": "2026-11-05 10:00"}]}')
    assert wrapped.punches[0].user_code == "E9"
    assert parse_punches("json", "not json").invalid_lines[0]["error"] == "not valid JSON"


def test_zkteco_attlog_tabs_spaces_and_status():
    text = (
        "  101\t2026-11-05 07:58:12\t0\t1\t0\t0\n"
        "101\t2026-11-05 17:02:00\t1\t1\t0\t0\n"
        "102 2026-11-05 08:10:00 4 1\n"
        "garbage\n"
    )
    result = parse_punches("zkteco", text)
    assert [(p.user_code, p.direction) for p in result.punches] == [("101", "IN"), ("101", "OUT"), ("102", "IN")]
    assert result.punches[2].punched_at == datetime(2026, 11, 5, 8, 10)
    assert result.invalid_lines == [{"line": 4, "error": "expected PIN<TAB>YYYY-MM-DD HH:MM:SS"}]


def test_row_cap_rejects_huge_requests():
    text = "\n".join(f"E1,2026-11-05 08:{i % 60:02d}" for i in range(MAX_PUNCHES_PER_REQUEST + 1))
    with pytest.raises(TooManyPunchesError):
        parse_punches("csv", text)


def test_unknown_format_and_detection():
    with pytest.raises(ValueError):
        parse_punches("xml", "")
    assert detect_format(filename="attlog.dat", content_type=None, text="") == "zkteco"
    assert detect_format(filename="punches.csv", content_type=None, text="") == "csv"
    assert detect_format(filename=None, content_type="application/json", text="") == "json"
    assert detect_format(filename=None, content_type="text/plain", text="[{}]") == "json"
    assert detect_format(filename=None, content_type="text/plain", text="1\t2026-11-05 08:00:00") == "zkteco"
    assert detect_format(filename=None, content_type="text/plain", text="E1,2026-11-05 08:00") == "csv"


def test_parse_timestamp_errors():
    with pytest.raises(ValueError):
        parse_timestamp("")
    with pytest.raises(ValueError):
        parse_timestamp("05/11/2026 08:00")


def test_api_key_format_and_hash():
    key, prefix, key_hash = generate_api_key()
    assert key.startswith(f"p7d_{prefix}_")
    assert api_key_prefix(key) == prefix
    assert hash_api_key(key) == key_hash and len(key_hash) == 64
    assert prefix not in key_hash
    assert api_key_prefix("wrong") is None
    assert api_key_prefix("p7d_short_x") is None


class _Shift:
    def __init__(self, start: time, end: time, grace: int = 0, night: bool = False):
        self.start_time, self.end_time, self.grace_in_minutes, self.is_night_shift = start, end, grace, night


def test_entry_values_present_late_early_and_overtime():
    day = datetime(2026, 11, 5).date()
    shift = _Shift(time(8, 0), time(17, 0), grace=10)
    on_time = build_entry_values(day, [datetime(2026, 11, 5, 8, 5), datetime(2026, 11, 5, 17, 0)], shift)
    assert on_time["status"] == "PRESENT" and on_time["late_minutes"] == 0
    late = build_entry_values(day, [datetime(2026, 11, 5, 8, 25), datetime(2026, 11, 5, 16, 30)], shift)
    assert late["status"] == "LATE" and late["late_minutes"] == 25 and late["early_out_minutes"] == 30
    overtime = build_entry_values(day, [datetime(2026, 11, 5, 19, 15), datetime(2026, 11, 5, 7, 55)], shift)
    assert overtime["in_time"] == time(7, 55) and overtime["out_time"] == time(19, 15)
    assert overtime["overtime_minutes"] == 135
    single = build_entry_values(day, [datetime(2026, 11, 5, 8, 0)], shift)
    assert single["out_time"] is None and single["early_out_minutes"] == 0
    no_shift = build_entry_values(day, [datetime(2026, 11, 5, 11, 0), datetime(2026, 11, 5, 12, 0)], None)
    assert no_shift["status"] == "PRESENT" and no_shift["late_minutes"] == 0


def test_entry_values_night_shift_ends_next_day():
    day = datetime(2026, 11, 5).date()
    night = _Shift(time(20, 0), time(5, 0), night=True)
    values = build_entry_values(day, [datetime(2026, 11, 5, 19, 58), datetime(2026, 11, 6, 6, 0)], night)
    assert values["status"] == "PRESENT"
    assert values["overtime_minutes"] == 60
    assert values["out_time"] == time(6, 0)
