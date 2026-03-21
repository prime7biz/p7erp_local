"""Lightweight checks for FIFO helper formatting (no DB)."""

from app.services.fifo_inventory import _q


def test_q_parses_numeric_strings():
    assert _q("10.5") == 10.5
    assert _q("") == 0.0
    assert _q(None) == 0.0
    assert _q("bad") == 0.0
