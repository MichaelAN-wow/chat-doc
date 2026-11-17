import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.services.retrieval.fuse import fuse_ranked_lists, rrf_fuse
from app.services.retrieval.hybrid import _diversify_by_section, hybrid_retrieve
from app.services.retrieval.sparse import sparse_tsquery_text
from app.services.retrieval.types import ChunkHit


def _hit(chunk_id=None, *, dense_rank=None, sparse_rank=None, score=0.5, name="doc.md"):
    return ChunkHit(
        chunk_id=chunk_id or uuid.uuid4(),
        document_id=uuid.uuid4(),
        filename=name,
        content="body",
        score=score,
        metadata={"page": 1},
        dense_rank=dense_rank,
        sparse_rank=sparse_rank,
        dense_score=score if dense_rank else None,
        sparse_score=score if sparse_rank else None,
    )


def test_sparse_tsquery_ors_expanded_terms():
    text = sparse_tsquery_text("education university degree bachelor background")
    assert " OR " in text
    assert text.split(" OR ")[0].lower().startswith("education")


def test_diversify_by_section_keeps_minority_evidence():
    experience = [
        _hit(score=0.9 - i * 0.01, name="p.pdf") for i in range(6)
    ]
    for hit in experience:
        hit.metadata = {"section": "Experience", "chunk_index": 0}
    education = _hit(score=0.5, name="p.pdf")
    education.metadata = {"section": "Education", "chunk_index": 12}
    hits = experience + [education]
    selected = _diversify_by_section(hits, top_k=4)
    sections = {str((h.metadata or {}).get("section")) for h in selected}
    assert "Education" in sections
    assert "Experience" in sections


def test_rrf_boosts_items_present_in_both_lists():
    shared = uuid.uuid4()
    only_dense = uuid.uuid4()
    only_sparse = uuid.uuid4()

    dense = [
        _hit(shared, dense_rank=1, score=0.9),
        _hit(only_dense, dense_rank=2, score=0.8),
    ]
    sparse = [
        _hit(shared, sparse_rank=1, score=0.7),
        _hit(only_sparse, sparse_rank=2, score=0.6),
    ]

    fused = rrf_fuse(dense, sparse, rrf_k=60, top_n=3)
    assert fused[0].chunk_id == shared
    assert {h.chunk_id for h in fused} == {shared, only_dense, only_sparse}


def test_rrf_respects_top_n():
    dense = [_hit(dense_rank=i, score=1.0 - i * 0.01) for i in range(1, 6)]
    sparse = [_hit(sparse_rank=i, score=1.0 - i * 0.02) for i in range(1, 6)]
    fused = rrf_fuse(dense, sparse, rrf_k=60, top_n=2)
    assert len(fused) == 2


@pytest.mark.asyncio
async def test_hybrid_retrieve_fuses_and_trims():
    workspace_id = uuid.uuid4()
    a = uuid.uuid4()
    b = uuid.uuid4()

    dense = [_hit(a, dense_rank=1, score=0.9), _hit(b, dense_rank=2, score=0.2)]
    sparse = [_hit(a, sparse_rank=1, score=0.8)]

    with (
        patch("app.services.retrieval.hybrid.EmbeddingService") as emb_cls,
        patch(
            "app.services.retrieval.hybrid.dense_search",
            new_callable=AsyncMock,
            return_value=dense,
        ),
        patch(
            "app.services.retrieval.hybrid.sparse_search",
            new_callable=AsyncMock,
            return_value=sparse,
        ),
        patch(
            "app.services.retrieval.hybrid.expand_neighbors",
            new_callable=AsyncMock,
            side_effect=lambda session, hits, **kwargs: hits,
        ),
    ):
        emb_cls.get_instance.return_value.embed_query.return_value = [0.1] * 8
        hits = await hybrid_retrieve(
            session=AsyncMock(),
            query="vacation days",
            workspace_id=workspace_id,
            top_k=1,
        )

    assert len(hits) == 1
    assert hits[0].chunk_id == a


@pytest.mark.asyncio
async def test_hybrid_retrieve_empty_when_both_empty():
    with (
        patch("app.services.retrieval.hybrid.EmbeddingService") as emb_cls,
        patch(
            "app.services.retrieval.hybrid.dense_search",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.services.retrieval.hybrid.sparse_search",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.services.retrieval.hybrid.expand_neighbors",
            new_callable=AsyncMock,
            side_effect=lambda session, hits, **kwargs: hits,
        ),
    ):
        emb_cls.get_instance.return_value.embed_query.return_value = [0.1] * 8
        hits = await hybrid_retrieve(AsyncMock(), "q", uuid.uuid4(), top_k=5)

    assert hits == []


def test_fuse_ranked_lists_merges_query_results():
    shared = uuid.uuid4()
    only_a = uuid.uuid4()
    only_b = uuid.uuid4()
    list_a = [_hit(shared, dense_rank=1, score=0.9), _hit(only_a, dense_rank=2, score=0.4)]
    list_b = [_hit(only_b, dense_rank=1, score=0.8), _hit(shared, dense_rank=2, score=0.7)]
    fused = fuse_ranked_lists([list_a, list_b], rrf_k=60, top_n=3)
    assert fused[0].chunk_id == shared
    assert {h.chunk_id for h in fused} == {shared, only_a, only_b}


@pytest.mark.asyncio
async def test_hybrid_retrieve_dual_query(monkeypatch):
    monkeypatch.setattr("app.services.retrieval.hybrid.settings.DUAL_QUERY_RETRIEVE", True)
    workspace_id = uuid.uuid4()
    a = uuid.uuid4()
    b = uuid.uuid4()

    async def fake_dense(session, emb, ws, **kwargs):
        return [_hit(a, dense_rank=1, score=0.9)]

    async def fake_sparse(session, query, ws, **kwargs):
        if "contractors" in query:
            return [_hit(b, sparse_rank=1, score=0.8)]
        return [_hit(a, sparse_rank=1, score=0.7)]

    with (
        patch("app.services.retrieval.hybrid.EmbeddingService") as emb_cls,
        patch("app.services.retrieval.hybrid.dense_search", side_effect=fake_dense),
        patch("app.services.retrieval.hybrid.sparse_search", side_effect=fake_sparse),
        patch(
            "app.services.retrieval.hybrid.expand_neighbors",
            new_callable=AsyncMock,
            side_effect=lambda session, hits, **kwargs: hits,
        ),
    ):
        emb_cls.get_instance.return_value.embed_query.return_value = [0.1] * 8
        hits = await hybrid_retrieve(
            session=AsyncMock(),
            query="and for contractors?",
            workspace_id=workspace_id,
            alt_query="vacation policy for contractors",
            top_k=5,
        )

    assert {h.chunk_id for h in hits} >= {a, b}
