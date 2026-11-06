"""
`assert_soft_permission_allowed` takes `permission_key` as keyword-only. A positional call raises
TypeError at request time (HTTP 500), which once broke MIS reports, TDS, advanced vouchers and
payroll statutory screens. This test scans every call site so it cannot happen again.
"""

import ast
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1] / "app"


def _positional_calls() -> list[str]:
    problems: list[str] = []
    for path in APP_DIR.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
            if name == "assert_soft_permission_allowed" and len(node.args) > 3:
                problems.append(f"{path.relative_to(APP_DIR.parent)}:{node.lineno}")
    return problems


def test_permission_key_is_always_passed_by_keyword() -> None:
    assert _positional_calls() == []
