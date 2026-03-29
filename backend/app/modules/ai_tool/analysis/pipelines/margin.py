from __future__ import annotations

from typing import Any

import pandas as pd

from app.modules.ai_tool.analysis.base import AnalysisResult, BaseAnalysisPipeline
from app.modules.ai_tool.analysis.output_formatter import build_chart_config
from app.modules.ai_tool.analysis.safe_query import tenant_scoped_query


class MarginAnalysisPipeline(BaseAnalysisPipeline):
    """Order pipeline snapshot as a margin / mix proxy (status-wise counts)."""

    async def validate_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        return dict(parameters or {})

    async def fetch_data(self, parameters: dict[str, Any]) -> pd.DataFrame:
        sql = """
        SELECT status, COUNT(*)::int AS order_count
        FROM orders
        WHERE tenant_id = :tenant_id
        GROUP BY status
        ORDER BY order_count DESC
        """
        return await tenant_scoped_query(self.db, tenant_id=self.tenant_id, query_template=sql, params={})

    async def compute(self, df: pd.DataFrame, parameters: dict[str, Any]) -> AnalysisResult:
        if df.empty:
            return AnalysisResult(
                metric_type="margin",
                warnings=["No order rows found for this tenant."],
                commentary="No orders available for margin-style mix analysis.",
            )
        total = int(df["order_count"].sum())
        facts = [
            {"label": "total_orders_in_scope", "value": total, "unit": "count"},
            {"label": "distinct_statuses", "value": int(len(df)), "unit": "count"},
        ]
        rows = df.to_dict(orient="records")
        chart = build_chart_config(
            chart_type="bar",
            title="Orders by status (pipeline snapshot)",
            x_field="status",
            y_field="order_count",
            y_label="Order count",
            rows=rows,
        )
        return AnalysisResult(
            metric_type="margin",
            facts=facts,
            computed_metrics=rows,
            commentary="Status distribution across sales orders; extend with costing joins for true CM%.",
            chart_config=chart,
        )
