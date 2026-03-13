from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.modules.ai_tool import audit, repository
from app.modules.ai_tool.authz import has_tool_permission
from app.modules.ai_tool.retrieval.adapters import SqlKeywordRetrievalAdapter
from app.modules.ai_tool.retrieval.ingestion import IngestionDocument, SimpleTextChunkingAdapter
from app.modules.ai_tool.schemas import (
    AiKnowledgeDocumentResponse,
    AiKnowledgeQueryResponse,
    AiKnowledgeSourceReference,
)


@dataclass(slots=True)
class SeedDocument:
    code: str
    title: str
    doc_type: str
    source_area: str
    body: str
    visibility: str = "public"
    permission_key: str | None = None


SEED_GLOBAL_DOCUMENTS: list[SeedDocument] = [
    SeedDocument(
        code="SOP-ORDER-LIFECYCLE",
        title="SOP: Sales Order Lifecycle",
        doc_type="sop",
        source_area="orders",
        body=(
            "Order lifecycle SOP: Validate buyer profile, confirm price, lock delivery date, and issue internal order code. "
            "Any amendment must be recorded with reason, approver, and timestamp. Late risk must be escalated in daily standup."
        ),
    ),
    SeedDocument(
        code="MANUAL-INVENTORY-CONTROL",
        title="Manual: Inventory Control and Reorder",
        doc_type="manual",
        source_area="inventory",
        body=(
            "Inventory manual: classify A/B/C items, maintain minimum and reorder levels, review stockout risk weekly. "
            "For shortages, procurement must raise purchase request with lead time and safety stock assumptions."
        ),
    ),
    SeedDocument(
        code="POLICY-COMPLIANCE-AUDIT",
        title="Policy: Compliance and Audit Trail",
        doc_type="policy",
        source_area="compliance",
        body=(
            "Compliance policy: all approvals require identity, timestamp, and reason. AI suggestions are advisory only. "
            "No automated posting without explicit user confirmation and role permission."
        ),
    ),
    SeedDocument(
        code="BUYER-REQ-QA-PACK",
        title="Buyer Requirement: QA and Packing Checklist",
        doc_type="buyer_requirement",
        source_area="quality",
        body=(
            "Buyer requirement summary: maintain inline quality checks, final AQL verification, carton labeling standards, "
            "and shipment document completeness before gate pass."
        ),
    ),
    SeedDocument(
        code="ERP-HELP-AI-MODULE",
        title="ERP Help: AI Tool Usage Guide",
        doc_type="erp_help",
        source_area="help",
        body=(
            "AI Tool help: use summaries for operational snapshot, reports for structured KPI outputs, forecasts for projections, "
            "and knowledge queries for SOP/manual/policy answers with citations."
        ),
    ),
    SeedDocument(
        code="POLICY-FINANCE-CONTROLS",
        title="Policy: Finance Posting Controls",
        doc_type="policy",
        source_area="finance",
        body=(
            "Finance control policy: posting, reversals, and payment releases require maker-checker approval. "
            "AI outputs are advisory and cannot directly post vouchers or payments."
        ),
        visibility="restricted",
        permission_key="ai.tools.finance.read",
    ),
]


def _doc_to_schema(row) -> AiKnowledgeDocumentResponse:
    return AiKnowledgeDocumentResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        document_code=row.document_code,
        title=row.title,
        doc_type=row.doc_type,
        source_area=row.source_area,
        owner_scope=row.owner_scope,
        visibility=row.visibility,
        permission_key=row.permission_key,
        version_tag=row.version_tag,
        metadata_json=row.metadata_json or {},
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def ensure_seed_knowledge_documents(db: AsyncSession) -> None:
    chunker = SimpleTextChunkingAdapter()
    for seed in SEED_GLOBAL_DOCUMENTS:
        existing = await repository.get_knowledge_document_by_code(db, tenant_id=None, document_code=seed.code)
        if existing:
            continue
        doc = IngestionDocument(
            tenant_id=None,
            document_code=seed.code,
            title=seed.title,
            doc_type=seed.doc_type,
            source_area=seed.source_area,
            owner_scope="global",
            visibility=seed.visibility,
            permission_key=seed.permission_key,
            version_tag="v1",
            metadata_json={"seeded": True},
            body=seed.body,
        )
        await chunker.ingest(db, doc)


async def list_knowledge_documents(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    limit: int = 100,
) -> list[AiKnowledgeDocumentResponse]:
    if not await has_tool_permission(db, user, "ai.tools.knowledge.read"):
        # fallback to normal ai.read gate for existing roles
        if not await has_tool_permission(db, user, "ai.read"):
            return []
    await ensure_seed_knowledge_documents(db)
    rows = await repository.list_accessible_knowledge_documents(db, tenant_id=tenant_id, limit=limit)
    allowed: list[AiKnowledgeDocumentResponse] = []
    for row in rows:
        if row.permission_key:
            ok = await has_tool_permission(db, user, row.permission_key)
            if not ok:
                continue
        allowed.append(_doc_to_schema(row))
    return allowed


async def query_knowledge(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    query: str,
    top_k: int,
    request_id: str | None,
    session_id: int | None,
    message_id: int | None,
) -> AiKnowledgeQueryResponse:
    if not await has_tool_permission(db, user, "ai.tools.knowledge.read"):
        if not await has_tool_permission(db, user, "ai.read"):
            return AiKnowledgeQueryResponse(
                answer="You are not allowed to access document knowledge sources.",
                used_sources=[],
                retrieved_from_knowledge=True,
                disclaimer="Access denied for knowledge retrieval.",
            )

    await ensure_seed_knowledge_documents(db)
    await audit.log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        session_id=session_id,
        message_id=message_id,
        action="RETRIEVAL_QUERY",
        request_id=request_id,
        resource="ai.knowledge",
        details=query[:500],
        details_json={"top_k": top_k},
    )

    adapter = SqlKeywordRetrievalAdapter(db=db, tenant_id=tenant_id, user=user)
    hits = await adapter.search(query, top_k=top_k)
    sources = [
        AiKnowledgeSourceReference(
            document_code=h.document_code,
            document_title=h.title,
            doc_type=h.doc_type,
            source_area=h.source_area,
            heading=h.heading,
            snippet=h.snippet,
            score=h.score,
            metadata=h.metadata,
        )
        for h in hits
    ]
    if not sources:
        answer = "I could not find a reliable match in the approved knowledge documents. Please refine the question."
    else:
        bullets = "\n".join(f"- {s.document_title}: {s.snippet}" for s in sources[:3])
        answer = (
            "Based on approved knowledge documents, here are the most relevant points:\n"
            f"{bullets}\n"
            "These are document-based references, not live ERP transactional calculations."
        )
    await audit.log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        session_id=session_id,
        message_id=message_id,
        action="RETRIEVAL_RESULT",
        request_id=request_id,
        resource="ai.knowledge",
        details=f"Retrieved {len(sources)} source(s)",
        details_json={"source_codes": [s.document_code for s in sources]},
    )
    return AiKnowledgeQueryResponse(
        answer=answer,
        used_sources=sources,
        retrieved_from_knowledge=True,
        disclaimer="Knowledge answers depend on indexed documents and may be outdated if source docs are not refreshed.",
    )


def build_knowledge_tool_payload(result: AiKnowledgeQueryResponse) -> dict[str, Any]:
    return {
        "retrieved_from_knowledge": result.retrieved_from_knowledge,
        "disclaimer": result.disclaimer,
        "sources": [x.model_dump() for x in result.used_sources],
    }
