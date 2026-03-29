from __future__ import annotations

from typing import Any

import pandas as pd

from app.modules.ai_tool.analysis.base import AnalysisResult, BaseAnalysisPipeline
from app.modules.ai_tool.analysis.output_formatter import build_chart_config
from app.modules.ai_tool.analysis.safe_query import tenant_scoped_query


class InventoryVarianceAnalysisPipeline(BaseAnalysisPipeline):
    """Stock movement IN vs OUT totals (simple variance-style view)."""

    async def validate_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        return dict(parameters or {})

    async def fetch_data(self, parameters: dict[str, Any]) -> pd.DataFrame:
        sql = """
        SELECT movement_type,
               SUM(CAST(NULLIF(TRIM(quantity), '') AS NUMERIC))::float AS total_qty
        FROM stock_movements
        WHERE tenant_id = :tenant_id
        GROUP BY movement_type
        """
        return await tenant_scoped_query(self.db, tenant_id=self.tenant_id, query_template=sql, params={})

    async def compute(self, df: pd.DataFrame, parameters: dict[str, Any]) -> AnalysisResult:
        if df.empty:
            return AnalysisResult(
                metric_type="inventory_variance",
                warnings=["No stock movements recorded."],
                commentary="No movement history to compare.",
            )
        df2 = df.fillna(0)
        facts: list[dict[str, Any]] = []
        for _, row in df2.iterrows():
            facts.append(
                {
                    "label": f"total_qty_{str(row['movement_type']).lower()}",
                    "value": float(row["total_qty"] or 0),
                    "unit": "qty",
                }
            )
        rows = df2.to_dict(orient="records")
        chart = build_chart_config(
            chart_type="bar",
            title="Stock movements by type (aggregated qty)",
            x_field="movement_type",
            y_field="total_qty",
            y_label="Quantity",
            rows=rows,
        )
        return AnalysisResult(
            metric_type="inventory_variance",
            facts=facts,
            computed_metrics=rows,
            commentary="Aggregated movement quantities; pair with cycle counts for true variance.",
            chart_config=chart,
        )
