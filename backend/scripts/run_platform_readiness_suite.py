"""
Run platform automated readiness suite (engineering evidence).

Executes pytest modules that map to FINANCE/TRADE/HR/INVENTORY critical paths.

Run:
  docker compose exec backend python scripts/run_platform_readiness_suite.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

TESTS = [
    "tests/test_finance_uat_critical_integration.py",
    "tests/test_hr_go_live_integration.py",
    "tests/test_trade_case_go_live_integration.py",
    "tests/test_inventory_go_live_integration.py",
    "tests/test_platform_readiness_integration.py",
    "tests/test_plan_enforcer_integration.py",
]


def main() -> int:
    backend = Path(__file__).resolve().parent.parent
    cmd = ["pytest", "-q", "--tb=short", *TESTS]
    print("Running:", " ".join(cmd))
    result = subprocess.run(cmd, cwd=str(backend))
    return int(result.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
