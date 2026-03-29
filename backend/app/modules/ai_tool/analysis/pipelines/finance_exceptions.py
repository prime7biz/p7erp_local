from __future__ import annotations

from typing import Any

import pandas as pd

from app.modules.ai_tool.analysis.base import AnalysisResult, BaseAnalysisPipeline
from app.modules.ai_tool.analysis.output_formatter import build_chart_config
from app.modules.ai_tool.analysis.safe_query import tenant_scoped_query


class FinanceExceptionsPipeline(BaseAnalysisPipeline):
    async def validate_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        return dict(parameters or {})

    async def fetch_data(self, parameters: dict[str, Any]) -> pd.DataFrame:
        sql = """
        SELECT status, COUNT(*)::int AS voucher_count
        FROM vouchers
        WHERE tenant_id = :tenant_id
        GROUP BY status
        ORDER BY voucher_count DESC
        """
        return await tenant_scoped_query(self.db, tenant_id=self.tenant_id, query_template=sql, params={})

    async def compute(self, df: pd.DataFrame, parameters: dict[str, Any]) -> AnalysisResult:
        if df.empty:
            return AnalysisResult(
                metric_type="finance_exceptions",
                warnings=["No vouchers found."],
                commentary="No finance documents in scope.",
            )
        draft_rows = (
            df[df["status"].astype(str).str.upper() == "DRAFT"] if "status" in df.columns else pd.DataFrame()
        )
        draft_cnt = int(draft_rows["voucher_count"].sum()) if not draft_rows.empty else 0
        rows = df.to_dict(orient="records")
        return AnalysisResult(
            metric_type="finance_exceptions",
            facts=[
                {"label": "draft_vouchers", "value": draft_cnt, "unit": "count"},
                {"label": "status_buckets", "value": len(df), "unit": "count"},
            ],
            computed_metrics=rows,
            commentary="Voucher counts by status; review DRAFT and other non-posted states as exceptions.",
            chart_config=build_chart_config(
                chart_type="bar",
                title="Vouchers by status",
                x_field="status",
                y_field="voucher_count",
                y_label="Count",
                rows=rows,
            ),
        )
