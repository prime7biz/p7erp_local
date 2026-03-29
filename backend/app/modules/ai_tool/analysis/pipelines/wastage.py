from __future__ import annotations

from typing import Any

import pandas as pd

from app.modules.ai_tool.analysis.base import AnalysisResult, BaseAnalysisPipeline
from app.modules.ai_tool.analysis.output_formatter import build_chart_config
from app.modules.ai_tool.analysis.safe_query import tenant_scoped_query


class WastageAnalysisPipeline(BaseAnalysisPipeline):
    async def validate_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        return dict(parameters or {})

    async def fetch_data(self, parameters: dict[str, Any]) -> pd.DataFrame:
        sql = """
        SELECT process_stage, COUNT(*)::int AS event_count,
               SUM(CAST(NULLIF(TRIM(quantity), '') AS NUMERIC))::float AS total_qty
        FROM wastage_transactions
        WHERE tenant_id = :tenant_id
        GROUP BY process_stage
        ORDER BY event_count DESC
        """
        return await tenant_scoped_query(self.db, tenant_id=self.tenant_id, query_template=sql, params={})

    async def compute(self, df: pd.DataFrame, parameters: dict[str, Any]) -> AnalysisResult:
        if df.empty:
            return AnalysisResult(
                metric_type="wastage",
                warnings=["No wastage transactions."],
                commentary="No wastage events recorded for this tenant.",
            )
        rows = df.to_dict(orient="records")
        return AnalysisResult(
            metric_type="wastage",
            facts=[
                {"label": "total_events", "value": int(df["event_count"].sum()), "unit": "count"},
            ],
            computed_metrics=rows,
            commentary="Wastage events by process stage.",
            chart_config=build_chart_config(
                chart_type="bar",
                title="Wastage events by process stage",
                x_field="process_stage",
                y_field="event_count",
                y_label="Events",
                rows=rows,
            ),
        )
