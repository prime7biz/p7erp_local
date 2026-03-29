"""Register ingestion sources: ERP text rows mapped to semantic chunks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_tool import AiKnowledgeDocument
from app.models.merch import Followup, GarmentStyle, Order

SourceFetchFn = Callable[[AsyncSession, int], Awaitable[list[dict]]]


@dataclass(frozen=True, slots=True)
class IngestionSource:
    source_type: str
    source_module: str
    document_type: str
    fetch_fn: SourceFetchFn


async def _fetch_merch_notes(db: AsyncSession, tenant_id: int) -> list[dict]:
    rows: list[dict] = []
    q = await db.execute(
        select(Order.id, Order.order_code, Order.remarks, Order.delivery_date).where(Order.tenant_id == tenant_id).limit(500)
    )
    for oid, code, remarks, delivery in q.all():
        text = (remarks or "").strip()
        if len(text) < 8:
            continue
        rows.append(
            {
                "source_ref": f"order:{oid}",
                "text": f"Order {code} remarks: {text}",
                "metadata": {"order_id": oid, "document_type": "merch_note"},
                "order_id": oid,
                "style_id": None,
                "date_reference": delivery,
            }
        )
    q2 = await db.execute(
        select(GarmentStyle.id, GarmentStyle.style_code, GarmentStyle.notes).where(GarmentStyle.tenant_id == tenant_id).limit(500)
    )
    for sid, scode, notes in q2.all():
        text = (notes or "").strip()
        if len(text) < 8:
            continue
        rows.append(
            {
                "source_ref": f"style:{sid}",
                "text": f"Style {scode} notes: {text}",
                "metadata": {"style_id": sid, "document_type": "merch_note"},
                "order_id": None,
                "style_id": sid,
                "date_reference": None,
            }
        )
    return rows


async def _fetch_qa_remarks(db: AsyncSession, tenant_id: int) -> list[dict]:
    """QA-style text from order remarks (dedicated QA tables can extend this)."""
    return await _fetch_merch_notes(db, tenant_id)


async def _fetch_shipment_logs(db: AsyncSession, tenant_id: int) -> list[dict]:
    rows: list[dict] = []
    q = await db.execute(
        select(Followup.id, Followup.order_id, Followup.title, Followup.notes, Followup.due_date).where(
            Followup.tenant_id == tenant_id
        ).limit(500)
    )
    for fid, oid, title, notes, due in q.all():
        body = " ".join(x for x in (title, notes or "") if x).strip()
        if len(body) < 8:
            continue
        rows.append(
            {
                "source_ref": f"followup:{fid}",
                "text": body,
                "metadata": {"order_id": oid, "document_type": "shipment_log"},
                "order_id": oid,
                "style_id": None,
                "date_reference": due,
            }
        )
    return rows


async def _fetch_hr_policy_docs(db: AsyncSession, tenant_id: int) -> list[dict]:
    rows: list[dict] = []
    q = await db.execute(
        select(AiKnowledgeDocument).where(
            AiKnowledgeDocument.tenant_id == tenant_id,
            AiKnowledgeDocument.is_active.is_(True),
            AiKnowledgeDocument.doc_type.in_(["hr_policy", "policy", "hr"]),
        )
    )
    for doc in q.scalars().all():
        meta = doc.metadata_json or {}
        body = str(meta.get("body") or meta)[:4000]
        rows.append(
            {
                "source_ref": f"kdoc:{doc.id}",
                "text": f"{doc.title}\n{body}",
                "metadata": {"document_type": "hr_policy", "document_code": doc.document_code},
                "order_id": None,
                "style_id": None,
                "date_reference": None,
            }
        )
    return rows


async def _fetch_sop_docs(db: AsyncSession, tenant_id: int) -> list[dict]:
    rows: list[dict] = []
    q = await db.execute(
        select(AiKnowledgeDocument).where(
            or_(AiKnowledgeDocument.tenant_id == tenant_id, AiKnowledgeDocument.tenant_id.is_(None)),
            AiKnowledgeDocument.is_active.is_(True),
            AiKnowledgeDocument.doc_type.in_(["sop", "manual", "knowledge"]),
        )
    )
    for doc in q.scalars().all():
        meta = doc.metadata_json or {}
        body = str(meta.get("body") or doc.title)[:4000]
        rows.append(
            {
                "source_ref": f"sop:{doc.document_code}",
                "text": f"{doc.title}\n{body}",
                "metadata": {"document_type": "sop", "document_code": doc.document_code},
                "order_id": None,
                "style_id": None,
                "date_reference": None,
            }
        )
    return rows


SOURCE_REGISTRY: dict[str, IngestionSource] = {
    "merch_note": IngestionSource("merch_note", "merch", "note", _fetch_merch_notes),
    "qa_remark": IngestionSource("qa_remark", "qa", "remark", _fetch_qa_remarks),
    "shipment_log": IngestionSource("shipment_log", "logistics", "log", _fetch_shipment_logs),
    "hr_policy": IngestionSource("hr_policy", "hr", "policy", _fetch_hr_policy_docs),
    "sop_text": IngestionSource("sop_text", "knowledge", "sop", _fetch_sop_docs),
}


def register_source(source: IngestionSource) -> None:
    SOURCE_REGISTRY[source.source_type] = source
