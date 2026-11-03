"""Neighbor expansion: reconstruct evidence around fused hits."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.chunk import Chunk
from app.models.document import Document
from app.services.retrieval.types import ChunkHit


async def expand_neighbors(
    session: AsyncSession,
    hits: list[ChunkHit],
    *,
    window: int | None = None,
) -> list[ChunkHit]:
    """Attach same-document neighbors (chunk_index ± window), then dedupe in order."""
    if not hits:
        return []
    window = settings.NEIGHBOR_WINDOW if window is None else window
    if window <= 0:
        return hits

    needed: dict[uuid.UUID, set[int]] = {}
    for hit in hits:
        index = hit.metadata.get("chunk_index")
        if not isinstance(index, int):
            # Fall back to DB lookup by id for index.
            continue
        bucket = needed.setdefault(hit.document_id, set())
        for offset in range(-window, window + 1):
            neighbor = index + offset
            if neighbor >= 0:
                bucket.add(neighbor)

    # Resolve missing chunk_index values from the DB.
    missing_ids = [hit.chunk_id for hit in hits if not isinstance(hit.metadata.get("chunk_index"), int)]
    index_by_id: dict[uuid.UUID, int] = {}
    if missing_ids:
        rows = (
            await session.execute(select(Chunk.id, Chunk.chunk_index).where(Chunk.id.in_(missing_ids)))
        ).all()
        index_by_id = {row[0]: row[1] for row in rows}
        for hit in hits:
            if isinstance(hit.metadata.get("chunk_index"), int):
                continue
            resolved = index_by_id.get(hit.chunk_id)
            if resolved is None:
                continue
            hit.metadata["chunk_index"] = resolved
            bucket = needed.setdefault(hit.document_id, set())
            for offset in range(-window, window + 1):
                neighbor = resolved + offset
                if neighbor >= 0:
                    bucket.add(neighbor)

    if not needed:
        return hits

    expanded: list[ChunkHit] = []
    seen: set[uuid.UUID] = set()

    # Prefer original hit order; inject neighbors immediately after each seed.
    for hit in hits:
        seed_index = hit.metadata.get("chunk_index")
        if not isinstance(seed_index, int):
            if hit.chunk_id not in seen:
                expanded.append(hit)
                seen.add(hit.chunk_id)
            continue

        indexes = [
            seed_index + offset
            for offset in range(-window, window + 1)
            if seed_index + offset >= 0
        ]
        neighbors = await _load_chunks(session, hit.document_id, indexes)
        by_index = {item.metadata.get("chunk_index"): item for item in neighbors}
        # Always keep the seed's score; neighbors inherit a slightly lower score.
        for index in indexes:
            item = by_index.get(index)
            if item is None or item.chunk_id in seen:
                continue
            if item.chunk_id == hit.chunk_id:
                item.score = hit.score
                item.dense_score = hit.dense_score
                item.sparse_score = hit.sparse_score
                item.dense_rank = hit.dense_rank
                item.sparse_rank = hit.sparse_rank
            else:
                item.score = max(hit.score * 0.85, 0.0)
            expanded.append(item)
            seen.add(item.chunk_id)

    return expanded


async def _load_chunks(
    session: AsyncSession,
    document_id: uuid.UUID,
    indexes: list[int],
) -> list[ChunkHit]:
    if not indexes:
        return []
    stmt = (
        select(Chunk, Document.filename)
        .join(Document, Chunk.document_id == Document.id)
        .where(Chunk.document_id == document_id)
        .where(Chunk.chunk_index.in_(indexes))
        .order_by(Chunk.chunk_index)
    )
    rows = (await session.execute(stmt)).all()
    hits: list[ChunkHit] = []
    for chunk, filename in rows:
        meta = dict(chunk.metadata_ or {})
        meta["chunk_index"] = chunk.chunk_index
        hits.append(
            ChunkHit(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                filename=filename,
                content=chunk.content,
                score=0.0,
                metadata=meta,
            )
        )
    return hits
