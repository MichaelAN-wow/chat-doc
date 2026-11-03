import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.chunk import Chunk
from app.models.document import Document, DocumentStatus
from app.services.retrieval.types import ChunkHit


async def dense_search(
    session: AsyncSession,
    query_embedding: list[float],
    workspace_id: uuid.UUID,
    top_k: int | None = None,
    threshold: float = 0.0,
    document_id: uuid.UUID | None = None,
) -> list[ChunkHit]:
    top_k = top_k or settings.DENSE_TOP_K
    distance = Chunk.embedding.cosine_distance(query_embedding)
    score_expr = (1 - distance).label("score")

    stmt = (
        select(Chunk, Document.filename, score_expr)
        .join(Document, Chunk.document_id == Document.id)
        .where(Document.workspace_id == workspace_id)
        .where(Document.status == DocumentStatus.READY)
    )
    if document_id is not None:
        stmt = stmt.where(Chunk.document_id == document_id)
    stmt = stmt.order_by(distance).limit(top_k)
    rows = (await session.execute(stmt)).all()

    hits: list[ChunkHit] = []
    for rank, (chunk, filename, score) in enumerate(rows, start=1):
        value = float(score)
        if value < threshold:
            continue
        meta = dict(chunk.metadata_ or {})
        meta["chunk_index"] = chunk.chunk_index
        hits.append(
            ChunkHit(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                filename=filename,
                content=chunk.content,
                score=value,
                metadata=meta,
                dense_rank=rank,
                dense_score=value,
            )
        )
    return hits
