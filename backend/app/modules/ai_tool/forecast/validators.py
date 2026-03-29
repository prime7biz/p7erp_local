"""Lightweight validation for forecast inputs (CPU-side)."""

from __future__ import annotations

from typing import Any


def validate_history_series(values: list[float], *, min_points: int = 3) -> tuple[bool, str | None]:
    clean = [float(x) for x in values if x is not None]
    if len(clean) < min_points:
        return False, f"Need at least {min_points} historical points for a reliable forecast."
    return True, None


def summarize_payload_quality(payload: dict[str, Any]) -> dict[str, Any]:
    pts = payload.get("forecast_points") or []
    return {
        "point_count": len(pts),
        "has_assumptions": bool(payload.get("assumptions")),
        "confidence_score": payload.get("confidence_score"),
    }
