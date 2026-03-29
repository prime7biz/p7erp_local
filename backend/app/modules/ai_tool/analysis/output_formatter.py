from __future__ import annotations

from typing import Any

from app.modules.ai_tool.analysis.base import AnalysisResult


def analysis_result_to_dict(result: AnalysisResult, *, data_freshness: str = "real-time") -> dict[str, Any]:
    return {
        "metric_type": result.metric_type,
        "facts": result.facts,
        "computed_metrics": result.computed_metrics,
        "warnings": result.warnings,
        "commentary": result.commentary,
        "chart_config": result.chart_config,
        "data_freshness": data_freshness,
    }


def build_chart_config(
    *,
    chart_type: str,
    title: str,
    x_field: str,
    y_field: str,
    y_label: str,
    rows: list[dict],
) -> dict[str, Any]:
    return {
        "type": chart_type,
        "title": title,
        "x_axis": {"field": x_field, "label": x_field.replace("_", " ").title()},
        "y_axis": {"field": y_field, "label": y_label},
        "series": [{"field": y_field, "label": y_label, "color": "#0d9488"}],
        "data": rows,
    }
