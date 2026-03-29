from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai_tool import repository


@dataclass(slots=True)
class IngestionDocument:
    document_code: str
    title: str
    doc_type: str
    source_area: str
    owner_scope: str
    visibility: str
    permission_key: str | None
    version_tag: str | None
    metadata_json: dict
    body: str
    tenant_id: int | None = None


class BaseDocumentIngestionAdapter(ABC):
    @abstractmethod
    def chunk(self, body: str) -> list[dict]:
        raise NotImplementedError

    async def ingest(self, db: AsyncSession, doc: IngestionDocument) -> int:
        row = await repository.get_knowledge_document_by_code(db, tenant_id=doc.tenant_id, document_code=doc.document_code)
        if not row:
            row = await repository.create_knowledge_document(
                db,
                tenant_id=doc.tenant_id,
                document_code=doc.document_code,
                title=doc.title,
                doc_type=doc.doc_type,
                source_area=doc.source_area,
                owner_scope=doc.owner_scope,
                visibility=doc.visibility,
                permission_key=doc.permission_key,
                version_tag=doc.version_tag,
                metadata_json=doc.metadata_json,
            )
        chunks = self.chunk(doc.body)
        await repository.replace_knowledge_chunks(db, document=row, tenant_id=doc.tenant_id, chunks=chunks)
        return row.id


class SimpleTextChunkingAdapter(BaseDocumentIngestionAdapter):
    def chunk(self, body: str) -> list[dict]:
        normalized = " ".join(body.split())
        if not normalized:
            return []
        size = 500
        chunks: list[dict] = []
        cursor = 0
        while cursor < len(normalized):
            part = normalized[cursor : cursor + size]
            chunks.append(
                {
                    "heading": None,
                    "content_text": part,
                    "metadata_json": {},
                    "token_count": max(1, len(part) // 4),
                }
            )
            cursor += size
        return chunks


class EmbeddingChunkingAdapter(BaseDocumentIngestionAdapter):
    """Overlap-aware chunks for vector embedding (CPU)."""

    CHUNK_SIZE = 400
    CHUNK_OVERLAP = 80

    def chunk(self, body: str) -> list[dict]:
        chunks: list[dict] = []
        current_heading: str | None = None
        paragraphs: list[tuple[str | None, str]] = []
        for block in body.split("\n\n"):
            stripped = block.strip()
            if not stripped:
                continue
            if stripped.startswith("#") and len(stripped) < 200:
                current_heading = stripped.lstrip("#").strip()
                continue
            paragraphs.append((current_heading, stripped))
        blob = "\n\n".join(p[1] for p in paragraphs) if paragraphs else ""
        normalized = " ".join(blob.split())
        if not normalized:
            return []
        cursor = 0
        while cursor < len(normalized):
            end = min(cursor + self.CHUNK_SIZE, len(normalized))
            part = normalized[cursor:end]
            dot = part.rfind(". ")
            if dot > self.CHUNK_SIZE // 2 and end < len(normalized):
                part = part[: dot + 1]
                end = cursor + len(part)
            part = part.strip()
            if part:
                chunks.append(
                    {
                        "heading": paragraphs[0][0] if paragraphs else None,
                        "content_text": part,
                        "metadata_json": {},
                        "token_count": max(1, len(part) // 4),
                    }
                )
            if end >= len(normalized):
                break
            cursor = max(cursor + 1, end - self.CHUNK_OVERLAP)
        return chunks
