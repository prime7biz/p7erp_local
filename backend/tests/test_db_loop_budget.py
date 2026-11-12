"""No new database calls inside loops (possible N+1 queries) without review (RC-07).

`db_loop_baseline.py` lists the functions that still do it. A new entry (or more loops in a listed
function) fails this test: batch the queries with `IN (...)` / a join, or - for a small bounded write
validation - regenerate the baseline and say why in the review.

Run:
    docker compose exec backend pytest tests/test_db_loop_budget.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

from tests.db_loop_baseline import BASELINE

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import db_loop_inventory  # noqa: E402


def test_no_new_db_calls_inside_loops():
    current = db_loop_inventory.scan()
    grown = {k: (BASELINE.get(k, 0), v) for k, v in current.items() if v > BASELINE.get(k, 0)}
    assert not grown, f"New DB calls inside loops (baseline -> now): {grown}"


def test_fixed_hot_paths_stay_batched():
    current = db_loop_inventory.scan()
    for fn in (
        "app/modules/merch/alert_rules.py::rule_wastage_vs_bom",
        "app/modules/merch/alert_rules.py::rule_trim_overconsumption_above",
        "app/modules/merch/alert_rules.py::_consumption_lines",
        "app/modules/inventory/grn_qc_router.py::quality_dashboard",
    ):
        assert fn not in current, fn
