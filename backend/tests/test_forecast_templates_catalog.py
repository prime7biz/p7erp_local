"""Forecast template catalog (static mapping from backend FORECAST_TEMPLATES)."""

from __future__ import annotations

from app.modules.ai_tool.forecasting import list_forecast_templates


def test_list_forecast_templates_has_six_entries() -> None:
    rows = list_forecast_templates()
    assert len(rows) == 6
    codes = {r["forecast_code"] for r in rows}
    assert "cash_flow_projection" in codes
    assert "capacity_shortfall_projection" in codes
    for r in rows:
        assert "example_prompt" in r
        assert "default_horizon_days" in r
        assert isinstance(r["source_modules"], list)
