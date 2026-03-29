from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class AnalysisResult:
    metric_type: str
    facts: list[dict[str, Any]] = field(default_factory=list)
    computed_metrics: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    commentary: str | None = None
    chart_config: dict[str, Any] | None = None


class BaseAnalysisPipeline(ABC):
    def __init__(self, db: AsyncSession, tenant_id: int):
        self.db = db
        self.tenant_id = tenant_id

    @abstractmethod
    async def validate_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def fetch_data(self, parameters: dict[str, Any]) -> pd.DataFrame:
        raise NotImplementedError

    @abstractmethod
    async def compute(self, df: pd.DataFrame, parameters: dict[str, Any]) -> AnalysisResult:
        raise NotImplementedError
