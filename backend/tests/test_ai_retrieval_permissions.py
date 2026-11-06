"""Vector / BM25 / keyword retrieval only returns chunks the requesting user may read.

Run:
docker compose exec backend pytest -q tests/test_ai_retrieval_permissions.py
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models import User
from app.models.ai_tool import AiEmbeddingChunk
from app.modules.ai_tool import repository
from app.modules.ai_tool.retrieval import adapters, embeddings, index_manager
from app.modules.ai_tool.retrieval.adapters import (
    PgVectorRetrievalAdapter,
    SqlKeywordRetrievalAdapter,
    filter_chunk_rows_for_user,
)
from app.modules.ai_tool.retrieval.bm25_adapter import BM25EmbeddingChunksAdapter
from app.modules.ai_tool.retrieval.source_registry import (
    SOURCE_REGISTRY,
    IngestionSource,
    permission_key_for_module,
)
from tests.merch_fixtures import _create_role_for_tenant, create_merch_tenant_with_user

UNIT_VECTOR = [0.0] * 383 + [1.0]


async def _seed_chunks(db, tenant_id: int) -> None:
    rows = [
        # (source_ref, source_module, permission_key, visibility)
        ("order:1", "merch", None, None),
        ("voucher:1", "finance", None, None),
        ("kdoc:1", "hr", "ai.tools.hr.read", "internal"),
        ("style:9", "merch", None, "restricted"),
    ]
    for ref, module, key, visibility in rows:
        db.add(
            AiEmbeddingChunk(
                tenant_id=tenant_id,
                source_type="test_src",
                source_ref=ref,
                source_module=module,
                chunk_index=0,
                content_text=f"zebrafabric shipment delay note for {ref}",
                embedding=UNIT_VECTOR,
                permission_key=key,
                visibility=visibility,
            )
        )
    await db.flush()


async def _manager_user(db, tenant) -> User:
    slug = uuid.uuid4().hex[:8]
    role = await _create_role_for_tenant(
        db, tenant_id=tenant.id, name="manager", display_name="Manager", permissions={}
    )
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"rtm{slug}",
        email=f"rtm{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


def _refs(hits) -> set[str]:
    return {h.document_code for h in hits}


# --- no user => no results ----------------------------------------------------------


@pytest.mark.asyncio
async def test_vector_and_bm25_return_nothing_without_user():
    db = SimpleNamespace()
    vec = PgVectorRetrievalAdapter(db=db, tenant_id=1, domain="", user=None)  # type: ignore[arg-type]
    bm25 = BM25EmbeddingChunksAdapter(db=db, tenant_id=1, domain="", user=None)  # type: ignore[arg-type]
    assert await vec.search("zebrafabric") == []
    assert await bm25.search("zebrafabric") == []


# --- BM25 / vector filtering on seeded chunks ----------------------------------------


@pytest.mark.asyncio
async def test_bm25_filters_chunks_by_permission(db_session_integration):
    db = db_session_integration
    tenant, reader, _role = await create_merch_tenant_with_user(db, permissions={"ai.read": True})
    await _seed_chunks(db, tenant.id)

    hits = await BM25EmbeddingChunksAdapter(db=db, tenant_id=tenant.id, domain="", user=reader).search(
        "zebrafabric", top_k=10
    )
    assert _refs(hits) == {"order:1"}

    boss = await _manager_user(db, tenant)
    hits = await BM25EmbeddingChunksAdapter(db=db, tenant_id=tenant.id, domain="", user=boss).search(
        "zebrafabric", top_k=10
    )
    assert _refs(hits) == {"order:1", "voucher:1", "kdoc:1", "style:9"}


@pytest.mark.asyncio
async def test_bm25_finance_grant_unlocks_finance_chunks_only(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_merch_tenant_with_user(
        db, permissions={"ai.read": True, "ai.tools.finance.read": True}
    )
    await _seed_chunks(db, tenant.id)

    hits = await BM25EmbeddingChunksAdapter(db=db, tenant_id=tenant.id, domain="", user=user).search(
        "zebrafabric", top_k=10
    )
    assert _refs(hits) == {"order:1", "voucher:1"}


@pytest.mark.asyncio
async def test_vector_filters_chunks_by_permission(db_session_integration, monkeypatch):
    db = db_session_integration
    monkeypatch.setattr(embeddings, "embed_query", lambda _q: UNIT_VECTOR)
    tenant, reader, _role = await create_merch_tenant_with_user(db, permissions={"ai.read": True})
    await _seed_chunks(db, tenant.id)

    hits = await PgVectorRetrievalAdapter(db=db, tenant_id=tenant.id, domain="", user=reader).search(
        "zebrafabric", top_k=10
    )
    assert _refs(hits) == {"order:1"}

    boss = await _manager_user(db, tenant)
    hits = await PgVectorRetrievalAdapter(db=db, tenant_id=tenant.id, domain="", user=boss).search(
        "zebrafabric", top_k=10
    )
    assert _refs(hits) == {"order:1", "voucher:1", "kdoc:1", "style:9"}


# --- filter helper -------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_caches_permission_checks_per_key(monkeypatch):
    checked: list[str] = []

    async def _fake_has(_db, _user, key):
        checked.append(key)
        return key == "ai.tools.orders.read"

    async def _fake_role(_db, _user):
        return "clerk"

    monkeypatch.setattr(adapters, "has_tool_permission", _fake_has)
    monkeypatch.setattr(adapters, "get_role_name", _fake_role)
    rows = [
        {"source_ref": "a", "source_module": "merch", "permission_key": None, "visibility": None},
        {"source_ref": "b", "source_module": "merch", "permission_key": None, "visibility": "public"},
        {"source_ref": "c", "source_module": "finance", "permission_key": None, "visibility": None},
        {"source_ref": "d", "source_module": "merch", "permission_key": None, "visibility": "private"},
    ]
    out = await filter_chunk_rows_for_user(None, SimpleNamespace(id=1), rows)  # type: ignore[arg-type]

    assert [r["source_ref"] for r in out] == ["a", "b"]
    assert checked == ["ai.tools.orders.read", "ai.tools.finance.read"]


def test_module_permission_mapping():
    assert permission_key_for_module("finance") == "ai.tools.finance.read"
    assert permission_key_for_module("hr") == "ai.tools.hr.read"
    assert permission_key_for_module("merch") == "ai.tools.orders.read"
    assert permission_key_for_module("qa") == "ai.tools.production.read"
    assert permission_key_for_module("something_new") == "ai.tools.dashboard.read"


# --- keyword adapter -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_keyword_adapter_without_user_skips_non_public_documents(monkeypatch):
    def _doc(code: str, visibility: str):
        return SimpleNamespace(
            document_code=code,
            title=f"Doc {code}",
            doc_type="sop",
            source_area="knowledge",
            visibility=visibility,
            owner_scope="global",
            permission_key=None,
        )

    chunk = SimpleNamespace(content_text="zebrafabric handling steps", heading=None, chunk_index=0)

    async def _fake_search(*_args, **_kwargs):
        return [(chunk, _doc("PUB", "public")), (chunk, _doc("RES", "restricted"))]

    monkeypatch.setattr(repository, "search_knowledge_chunks_raw", _fake_search)
    hits = await SqlKeywordRetrievalAdapter(db=None, tenant_id=1, user=None).search("zebrafabric")  # type: ignore[arg-type]
    assert _refs(hits) == {"PUB"}


# --- indexing ------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reindex_stores_permission_key_and_visibility(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, _user, _role = await create_merch_tenant_with_user(db, permissions={"ai.read": True})

    async def _fetch(_db, _tenant_id):
        return [
            {"source_ref": "rec:1", "text": "finance record body text", "metadata": {}},
            {
                "source_ref": "rec:2",
                "text": "restricted record body text",
                "metadata": {},
                "permission_key": "ai.tools.custom.read",
                "visibility": "restricted",
            },
        ]

    monkeypatch.setitem(SOURCE_REGISTRY, "perm_test", IngestionSource("perm_test", "finance", "note", _fetch))
    monkeypatch.setattr(index_manager, "embed_texts", lambda texts: [UNIT_VECTOR for _ in texts])

    count = await index_manager.full_reindex_source_type(db, tenant_id=tenant.id, source_type="perm_test")
    assert count == 2
    rows = (
        await db.execute(
            select(AiEmbeddingChunk.source_ref, AiEmbeddingChunk.permission_key, AiEmbeddingChunk.visibility).where(
                AiEmbeddingChunk.tenant_id == tenant.id
            )
        )
    ).all()
    stored = {ref: (key, vis) for ref, key, vis in rows}
    assert stored["rec:1"] == ("ai.tools.finance.read", "internal")
    assert stored["rec:2"] == ("ai.tools.custom.read", "restricted")
