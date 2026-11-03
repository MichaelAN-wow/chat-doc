import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.embedding import EmbeddingService
from app.services.retrieval.dense import dense_search
from app.services.retrieval.expand import expand_neighbors
from app.services.retrieval.fuse import fuse_ranked_lists, rrf_fuse
from app.services.retrieval.sparse import sparse_search
from app.services.retrieval.types import ChunkHit


def _dedupe_queries(*queries: str) -> list[str]:
    unique: list[str] = []
    for query in queries:
        text = (query or "").strip()
        if text and text not in unique:
            unique.append(text)
    return unique


def _trim_fused(fused: list[ChunkHit], top_k: int) -> list[ChunkHit]:
    if not fused:
        return []
    best = fused[0].score
    min_score = max(settings.RETRIEVAL_THRESHOLD * best, 1.0 / (settings.RRF_K + 50))
    filtered = [hit for hit in fused if hit.score >= min_score]
    return filtered[:top_k]


def _diversify_by_section(hits: list[ChunkHit], top_k: int) -> list[ChunkHit]:
    """Keep score order, but surface one hit per section before refilling.

    Neighbor expansion can flood the list with one majority section (e.g. Experience).
    Taking the best chunk from each section first keeps minority evidence like Education.
    """
    if len(hits) <= top_k:
        return hits
    first_pass: list[ChunkHit] = []
    rest: list[ChunkHit] = []
    seen_sections: set[str] = set()
    for hit in hits:
        section = str((hit.metadata or {}).get("section") or "")
        key = section or str(hit.chunk_id)
        if key not in seen_sections:
            first_pass.append(hit)
            seen_sections.add(key)
        else:
            rest.append(hit)
    return (first_pass + rest)[:top_k]


async def _retrieve_fused(
    session: AsyncSession,
    query: str,
    workspace_id: uuid.UUID,
    *,
    pool: int,
    document_id: uuid.UUID | None = None,
) -> list[ChunkHit]:
    embedding_service = EmbeddingService.get_instance()
    query_embedding = await asyncio.to_thread(embedding_service.embed_query, query)
    dense_hits = await dense_search(
        session, query_embedding, workspace_id, document_id=document_id
    )
    sparse_hits = await sparse_search(session, query, workspace_id, document_id=document_id)
    return rrf_fuse(dense_hits, sparse_hits, top_n=pool)


async def hybrid_retrieve(
    session: AsyncSession,
    query: str,
    workspace_id: uuid.UUID,
    *,
    top_k: int | None = None,
    alt_query: str | None = None,
    document_id: uuid.UUID | None = None,
) -> list[ChunkHit]:
    top_k = top_k or settings.FINAL_TOP_K
    pool = max(top_k, settings.CANDIDATE_POOL, settings.FINAL_TOP_K)

    queries = _dedupe_queries(query)
    if settings.DUAL_QUERY_RETRIEVE and alt_query:
        queries = _dedupe_queries(query, alt_query)

    if len(queries) == 1:
        fused = await _retrieve_fused(
            session, queries[0], workspace_id, pool=pool, document_id=document_id
        )
    else:
        lists = await asyncio.gather(
            *[
                _retrieve_fused(session, q, workspace_id, pool=pool, document_id=document_id)
                for q in queries
            ]
        )
        fused = fuse_ranked_lists(list(lists), top_n=pool)

    # Keep a wide candidate set, reconstruct neighbors, then trim for the prompt.
    candidates = _trim_fused(fused, pool)
    expanded = await expand_neighbors(session, candidates)
    return _diversify_by_section(expanded, top_k)
