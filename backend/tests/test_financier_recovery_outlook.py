"""Financier recovery outlook service unit tests."""

from __future__ import annotations

from app.external_access.financier_portal.recovery_outlook_service import (
    _band_from_coverage,
    _score_from_signals,
)


def test_band_from_coverage_strong():
    assert _band_from_coverage(1.6) == "strong"
    assert _band_from_coverage(1.5) == "strong"


def test_band_from_coverage_adequate():
    assert _band_from_coverage(1.2) == "adequate"
    assert _band_from_coverage(1.0) == "adequate"


def test_band_from_coverage_watch_and_at_risk():
    assert _band_from_coverage(0.85) == "watch"
    assert _band_from_coverage(0.5) == "at_risk"
    assert _band_from_coverage(None) == "watch"


def test_score_from_signals_bounds():
    high = _score_from_signals(coverage=1.8, rm_pct=100, sewing_pct=80, blockers=[], emi_overdue=False)
    low = _score_from_signals(coverage=0.5, rm_pct=10, sewing_pct=5, blockers=["a", "b", "c"], emi_overdue=True)
    assert 0 <= high <= 100
    assert 0 <= low <= 100
    assert high > low
