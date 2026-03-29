from __future__ import annotations

from typing import Any

import pandas as pd

from app.modules.ai_tool.analysis.base import AnalysisResult, BaseAnalysisPipeline
from app.modules.ai_tool.analysis.output_formatter import build_chart_config
from app.modules.ai_tool.analysis.safe_query import tenant_scoped_query


class CostingAnalysisPipeline(BaseAnalysisPipeline):
    async def validate_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        return dict(parameters or {})

    async def fetch_data(self, parameters: dict[str, Any]) -> pd.DataFrame:
        sql = """
        SELECT status, COUNT(*)::int AS quotation_count
        FROM quotations
        WHERE tenant_id = :tenant_id
        GROUP BY status
        ORDER BY quotation_count DESC
        """
        return await tenant_scoped_query(self.db, tenant_id=self.tenant_id, query_template=sql, params={})

    async def compute(self, df: pd.DataFrame, parameters: dict[str, Any]) -> AnalysisResult:
        if df.empty:
            return AnalysisResult(
                metric_type="costing",
                warnings=["No quotations in scope."],
                commentary="Add quotation data for costing breakdown analysis.",
            )
        total = int(df["quotation_count"].sum())
        rows = df.to_dict(orient="records")
        return AnalysisResult(
            metric_type="costing",
            facts=[{"label": "total_quotations", "value": total, "unit": "count"}],
            computed_metrics=rows,
            commentary="Quotation status pipeline; extend with quotation_cost_summary for CM detail.",
            chart_config=build_chart_config(
                chart_type="bar",
                title="Quotations by status",
                x_field="status",
                y_field="quotation_count",
                y_label="Count",
                rows=rows,
            ),
        )
