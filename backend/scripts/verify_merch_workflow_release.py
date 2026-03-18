"""
Combined merchandising workflow release verification.

Runs:
  1) API smoke verification
  2) DB integrity verification

Run inside backend container:
  python scripts/verify_merch_workflow_release.py
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
API_SCRIPT = BASE_DIR / "verify_merch_workflow_api.py"
DB_SCRIPT = BASE_DIR / "verify_merch_workflow_db.py"
TRANSITIONS_SCRIPT = BASE_DIR / "verify_merch_workflow_transitions_api.py"
RESULT_RE = re.compile(r"^\s*-\s+[A-Z0-9-]+:\s+(Pass|Fail|Skip)\s+\|")


def _run(script_path: Path, label: str) -> tuple[bool, list[str]]:
    print(f"\n=== {label} ===")
    proc = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(BASE_DIR.parent),
        capture_output=True,
        text=True,
    )

    output_lines: list[str] = []
    if proc.stdout:
        output_lines.extend(proc.stdout.splitlines())
    if proc.stderr:
        output_lines.extend(proc.stderr.splitlines())

    for line in output_lines:
        print(line)

    fail_count = 0
    pass_count = 0
    skip_count = 0
    for line in output_lines:
        match = RESULT_RE.match(line)
        if not match:
            continue
        status = match.group(1)
        if status == "Fail":
            fail_count += 1
        elif status == "Pass":
            pass_count += 1
        elif status == "Skip":
            skip_count += 1

    if proc.returncode != 0:
        print(f"[{label}] non-zero exit code: {proc.returncode}")
        fail_count += 1

    ok = fail_count == 0
    summary = [
        f"[{label}] pass={pass_count} fail={fail_count} skip={skip_count} exit_code={proc.returncode}"
    ]
    return ok, summary


def main() -> int:
    print("Merch workflow combined release verification")

    if not API_SCRIPT.exists():
        print(f"Missing script: {API_SCRIPT}")
        return 1
    if not DB_SCRIPT.exists():
        print(f"Missing script: {DB_SCRIPT}")
        return 1
    if not TRANSITIONS_SCRIPT.exists():
        print(f"Missing script: {TRANSITIONS_SCRIPT}")
        return 1

    api_ok, api_summary = _run(API_SCRIPT, "API")
    db_ok, db_summary = _run(DB_SCRIPT, "DB")
    transitions_ok, transitions_summary = _run(TRANSITIONS_SCRIPT, "TRANSITIONS")

    print("\n=== Final Summary ===")
    for line in api_summary + db_summary + transitions_summary:
        print(line)

    overall_ok = api_ok and db_ok and transitions_ok
    print(f"GO-LIVE CHECK: {'PASS' if overall_ok else 'FAIL'}")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
