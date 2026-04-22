"""Server-side what-if: adjust composite score heuristically (no DB writes)."""

from __future__ import annotations

from typing import Any

from app.external_access.financier_portal.contract_command import risk_scoring


def apply_what_if(
    base_detail: dict[str, Any],
    *,
    etd_shift_days: int = 0,
    rm_accel_pct: float = 0.0,
) -> dict[str, Any]:
    """Positive etd_shift_days = more time (improves OTD). rm_accel_pct 0-100 improves RM completion proxy."""
    risk = dict(base_detail.get("risk") or {})
    rollup = dict(base_detail.get("rollup") or {})
    mat = dict(base_detail.get("maturity") or {})
    cash = dict(base_detail.get("cash_ladder") or {})

    otd = float(rollup.get("avg_otd_score") or 70)
    otd += min(15.0, etd_shift_days * 0.8)
    otd += min(10.0, rm_accel_pct * 0.1)
    otd = max(0.0, min(100.0, otd))

    m = float(mat.get("maturity_safety_score") or 75)
    m += min(5.0, etd_shift_days * 0.2)

    c = float(cash.get("cashability_score") or 70)
    c += min(8.0, rm_accel_pct * 0.08)

    comps = risk.get("components") or {}
    th = float(comps.get("tenant_health") or 60)
    comp = risk_scoring.composite_risk(
        otd_avg=otd,
        maturity_score=m,
        cashability_score=c,
        tenant_health=th,
    )
    return {
        "etd_shift_days": etd_shift_days,
        "rm_accel_pct": rm_accel_pct,
        "adjusted_risk": comp,
        "assumptions": [
            "Heuristic only; no persistence.",
            "OTD sensitivity: +0.8 pts per day ETD slack.",
            "RM acceleration improves OTD and cashability slightly.",
        ],
    }
