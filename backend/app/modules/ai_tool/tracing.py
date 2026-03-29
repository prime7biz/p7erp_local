"""Request-level span collection for AI observability (Phase-2)."""

from __future__ import annotations

from time import perf_counter
from typing import Any


class RequestTracer:
    """Collect named spans with start/end ms relative to trace start."""

    def __init__(self) -> None:
        self._t0 = perf_counter()
        self.spans: list[dict[str, Any]] = []

    def now_ms(self) -> int:
        return int((perf_counter() - self._t0) * 1000)

    def span_end(
        self,
        name: str,
        start_ms: int,
        *,
        status: str = "ok",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.spans.append(
            {
                "name": name,
                "start_ms": start_ms,
                "end_ms": self.now_ms(),
                "status": status,
                "metadata": metadata or {},
            }
        )

    def to_json(self) -> list[dict[str, Any]]:
        return list(self.spans)
