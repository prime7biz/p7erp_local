from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(slots=True)
class RetrievalHit:
    document_code: str
    title: str
    doc_type: str
    source_area: str
    snippet: str
    heading: str | None
    score: float
    metadata: dict


class BaseRetrievalAdapter(ABC):
    """Phase-5 interface for tenant-aware knowledge retrieval."""

    @abstractmethod
    async def search(self, query: str, *, top_k: int = 5) -> list[RetrievalHit]:
        raise NotImplementedError
