"""Evaluate JSON conditions for Phase 20 proposals (no side effects)."""

from __future__ import annotations

from typing import Any


def _get_path(data: dict | None, path: str) -> Any:
    if not data or not path:
        return None
    cur: Any = data
    for part in path.split("."):
        part = part.strip()
        if not part:
            continue
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def evaluate_condition(condition: dict | None, payload: dict | None) -> dict[str, Any]:
    """Return matched flag + reason_codes. Missing rule row handled by caller."""
    if not condition:
        return {
            "matched": True,
            "confidence": 0.5,
            "reason_codes": ["NO_CONDITION_ALWAYS_MATCH"],
        }

    path = str(condition.get("path") or "").strip()
    op = str(condition.get("op") or "eq").strip().lower()
    expected = condition.get("value")
    actual = _get_path(payload or {}, path)

    matched = False
    if op == "eq":
        matched = actual == expected
    elif op == "neq":
        matched = actual != expected
    elif op == "in":
        matched = actual in (expected if isinstance(expected, (list, tuple, set)) else [])
    elif op == "gte":
        try:
            matched = float(actual) >= float(expected)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            matched = False
    elif op == "lte":
        try:
            matched = float(actual) <= float(expected)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            matched = False
    else:
        return {
            "matched": False,
            "confidence": 0.4,
            "reason_codes": ["UNKNOWN_OP", op],
        }

    return {
        "matched": matched,
        "confidence": 0.85 if path else 0.5,
        "reason_codes": ["CONDITION_EVAL_OK", op],
        "path": path or None,
        "actual": actual,
        "expected": expected,
    }
