"""Unit tests for Phase 20 JSON rule evaluator (no DB)."""

from app.modules.erp_ai_phases.rule_evaluator import evaluate_condition


def test_evaluate_eq_match():
    r = evaluate_condition({"path": "status", "op": "eq", "value": "x"}, {"status": "x"})
    assert r["matched"] is True


def test_evaluate_eq_no_match():
    r = evaluate_condition({"path": "status", "op": "eq", "value": "x"}, {"status": "y"})
    assert r["matched"] is False


def test_evaluate_nested_path():
    r = evaluate_condition({"path": "a.b", "op": "eq", "value": 1}, {"a": {"b": 1}})
    assert r["matched"] is True


def test_no_condition_always_match():
    r = evaluate_condition(None, {"x": 1})
    assert r["matched"] is True
