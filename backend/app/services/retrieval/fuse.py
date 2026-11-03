from app.config import settings
from app.services.retrieval.types import ChunkHit


def _merge_hit(existing: ChunkHit, incoming: ChunkHit) -> ChunkHit:
    if incoming.dense_rank is not None:
        existing.dense_rank = incoming.dense_rank
    if incoming.sparse_rank is not None:
        existing.sparse_rank = incoming.sparse_rank
    if incoming.dense_score is not None and (
        existing.dense_score is None or incoming.dense_score > existing.dense_score
    ):
        existing.dense_score = incoming.dense_score
    if incoming.sparse_score is not None and (
        existing.sparse_score is None or incoming.sparse_score > existing.sparse_score
    ):
        existing.sparse_score = incoming.sparse_score
    return existing


def rrf_fuse(
    dense_hits: list[ChunkHit],
    sparse_hits: list[ChunkHit],
    *,
    rrf_k: int | None = None,
    top_n: int | None = None,
) -> list[ChunkHit]:
    rrf_k = rrf_k or settings.RRF_K
    top_n = top_n or settings.FINAL_TOP_K

    scores: dict = {}
    by_id: dict = {}

    for hit in dense_hits:
        by_id[hit.chunk_id] = hit
        rank = hit.dense_rank or 0
        scores[hit.chunk_id] = scores.get(hit.chunk_id, 0.0) + 1.0 / (rrf_k + rank)

    for hit in sparse_hits:
        existing = by_id.get(hit.chunk_id)
        if existing is None:
            by_id[hit.chunk_id] = hit
        else:
            _merge_hit(existing, hit)
        rank = hit.sparse_rank or 0
        scores[hit.chunk_id] = scores.get(hit.chunk_id, 0.0) + 1.0 / (rrf_k + rank)

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    fused: list[ChunkHit] = []
    for chunk_id, fused_score in ranked[:top_n]:
        hit = by_id[chunk_id]
        hit.score = fused_score
        fused.append(hit)
    return fused


def fuse_ranked_lists(
    lists: list[list[ChunkHit]],
    *,
    rrf_k: int | None = None,
    top_n: int | None = None,
) -> list[ChunkHit]:
    rrf_k = rrf_k or settings.RRF_K
    top_n = top_n or settings.FINAL_TOP_K
    if not lists:
        return []
    if len(lists) == 1:
        return lists[0][:top_n]

    scores: dict = {}
    by_id: dict = {}
    for ranked in lists:
        for rank, hit in enumerate(ranked, start=1):
            existing = by_id.get(hit.chunk_id)
            if existing is None:
                by_id[hit.chunk_id] = hit
            else:
                _merge_hit(existing, hit)
            scores[hit.chunk_id] = scores.get(hit.chunk_id, 0.0) + 1.0 / (rrf_k + rank)

    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    fused: list[ChunkHit] = []
    for chunk_id, fused_score in ordered[:top_n]:
        hit = by_id[chunk_id]
        hit.score = fused_score
        fused.append(hit)
    return fused
