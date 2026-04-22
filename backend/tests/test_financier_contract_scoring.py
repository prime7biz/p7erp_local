"""Unit tests for contract command risk helpers (no DB)."""

from app.external_access.financier_portal.contract_command import risk_scoring
from app.external_access.financier_portal.contract_command import what_if as cc_what


def test_composite_risk_weights():
    r = risk_scoring.composite_risk(
        otd_avg=80.0,
        maturity_score=70.0,
        cashability_score=60.0,
        tenant_health=50.0,
    )
    assert r["composite_score"] == 70.0


def test_what_if_increases_composite_with_positive_etd():
    base = {
        "risk": {
            "composite_score": 60.0,
            "components": {
                "otd_avg": 60.0,
                "maturity_safety": 60.0,
                "cashability": 60.0,
                "tenant_health": 60.0,
            },
        },
        "rollup": {"avg_otd_score": 60.0},
        "maturity": {"maturity_safety_score": 60.0},
        "cash_ladder": {"cashability_score": 60.0},
    }
    adj = cc_what.apply_what_if(base, etd_shift_days=10, rm_accel_pct=20.0)
    assert float(adj["adjusted_risk"]["composite_score"]) > 60.0
