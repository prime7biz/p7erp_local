"""Composite contract risk from OTD, maturity, cashability, tenant health."""

from __future__ import annotations

from typing import Any


def composite_risk(
    *,
    otd_avg: float | None,
    maturity_score: float | None,
    cashability_score: float | None,
    tenant_health: float | None,
) -> dict[str, Any]:
    o = otd_avg if otd_avg is not None else 70.0
    m = maturity_score if maturity_score is not None else 75.0
    c = cashability_score if cashability_score is not None else 70.0
    h = tenant_health if tenant_health is not None else 60.0
    comp = 0.4 * o + 0.3 * m + 0.2 * c + 0.1 * h
    return {
        "composite_score": round(comp, 1),
        "weights": {"otd": 0.4, "maturity": 0.3, "cashability": 0.2, "tenant_health": 0.1},
        "components": {
            "otd_avg": otd_avg,
            "maturity_safety": maturity_score,
            "cashability": cashability_score,
            "tenant_health": tenant_health,
        },
    }
