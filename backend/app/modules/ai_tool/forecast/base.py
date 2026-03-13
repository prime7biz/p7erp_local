from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date


@dataclass(slots=True)
class ForecastInput:
    prompt: str
    horizon_days: int
    from_date: date | None = None
    to_date: date | None = None


@dataclass(slots=True)
class ForecastOutput:
    forecast_points: list[dict]
    assumptions: dict
    confidence_score: float
    limitations: str
    extra: dict


class BaseForecastAdapter(ABC):
    """Phase-4 forecast adapter interface."""

    @abstractmethod
    async def run(self, payload: dict) -> dict:
        raise NotImplementedError
