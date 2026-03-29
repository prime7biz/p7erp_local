from __future__ import annotations

from typing import Any

import pandas as pd

from app.modules.ai_tool.analysis.base import AnalysisResult, BaseAnalysisPipeline
from app.modules.ai_tool.analysis.output_formatter import build_chart_config
from app.modules.ai_tool.analysis.safe_query import tenant_scoped_query


class TnaDelayAnalysisPipeline(BaseAnalysisPipeline):
    async def validate_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        return dict(parameters or {})

    async def fetch_data(self, parameters: dict[str, Any]) -> pd.DataFrame:
        sql = """
        SELECT phase, COUNT(*)::int AS overdue_count
        FROM order_followup_actions
        WHERE tenant_id = :tenant_id
          AND planned_date IS NOT NULL
          AND planned_date < CURRENT_DATE
          AND LOWER(status) NOT IN ('done', 'completed', 'cancelled', 'closed')
        GROUP BY phase
        ORDER BY overdue_count DESC
        """
        return await tenant_scoped_query(self.db, tenant_id=self.tenant_id, query_template=sql, params={})

    async def compute(self, df: pd.DataFrame, parameters: dict[str, Any]) -> AnalysisResult:
        if df.empty:
            return AnalysisResult(
                metric_type="tna_delay",
                facts=[{"label": "overdue_tna_actions", "value": 0, "unit": "count"}],
                computed_metrics=[],
                commentary="No overdue TNA actions detected.",
            )
        total = int(df["overdue_count"].sum())
        rows = df.to_dict(orient="records")
        return AnalysisResult(
            metric_type="tna_delay",
            facts=[{"label": "overdue_tna_actions", "value": total, "unit": "count"}],
            computed_metrics=rows,
            commentary="Follow-up actions past planned date and not completed.",
            chart_config=build_chart_config(
                chart_type="bar",
                title="Overdue TNA actions by phase",
                x_field="phase",
                y_field="overdue_count",
                y_label="Count",
                rows=rows,
            ),
        )
