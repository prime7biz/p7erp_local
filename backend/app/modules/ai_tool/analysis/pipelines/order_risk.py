from __future__ import annotations

from typing import Any

import pandas as pd

from app.modules.ai_tool.analysis.base import AnalysisResult, BaseAnalysisPipeline
from app.modules.ai_tool.analysis.safe_query import tenant_scoped_query


class OrderRiskAnalysisPipeline(BaseAnalysisPipeline):
    async def validate_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        return dict(parameters or {})

    async def fetch_data(self, parameters: dict[str, Any]) -> pd.DataFrame:
        sql = """
        SELECT COUNT(*)::int AS at_risk_orders
        FROM orders
        WHERE tenant_id = :tenant_id
          AND delivery_date IS NOT NULL
          AND delivery_date < CURRENT_DATE
          AND UPPER(status) NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED', 'DELIVERED')
        """
        return await tenant_scoped_query(self.db, tenant_id=self.tenant_id, query_template=sql, params={})

    async def compute(self, df: pd.DataFrame, parameters: dict[str, Any]) -> AnalysisResult:
        val = int(df.iloc[0]["at_risk_orders"]) if not df.empty else 0
        return AnalysisResult(
            metric_type="order_risk",
            facts=[{"label": "orders_past_delivery_and_open", "value": val, "unit": "count"}],
            computed_metrics=[{"at_risk_orders": val}],
            commentary="Orders with delivery date in the past and non-terminal status.",
            chart_config=None,
        )
