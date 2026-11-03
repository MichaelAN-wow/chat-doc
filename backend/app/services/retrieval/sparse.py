import re
import uuid

from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.chunk import Chunk
from app.models.document import Document, DocumentStatus
from app.services.retrieval.types import ChunkHit

# Expanded rewrite bags are synonym-rich; AND-ing every term (websearch default)
# drops valid passages that only contain a subset (e.g. Education without "background").
_TERM_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{1,}")


def sparse_tsquery_text(query: str) -> str:
    """Build a websearch string that ORs terms so partial vocabulary still matches."""
    terms = _TERM_RE.findall(query or "")
    if not terms:
        return (query or "").strip() or "the"
    return " OR ".join(terms)


async def sparse_search(
    session: AsyncSession,
    query: str,
    workspace_id: uuid.UUID,
    top_k: int | None = None,
    document_id: uuid.UUID | None = None,
) -> list[ChunkHit]:
    top_k = top_k or settings.SPARSE_TOP_K
    ts_query = func.websearch_to_tsquery("english", sparse_tsquery_text(query))
    content_tsv = literal_column("chunks.content_tsv")
    rank = func.ts_rank_cd(content_tsv, ts_query).label("score")

    stmt = (
        select(Chunk, Document.filename, rank)
        .join(Document, Chunk.document_id == Document.id)
        .where(Document.workspace_id == workspace_id)
        .where(Document.status == DocumentStatus.READY)
        .where(content_tsv.op("@@")(ts_query))
    )
    if document_id is not None:
        stmt = stmt.where(Chunk.document_id == document_id)
    stmt = stmt.order_by(rank.desc()).limit(top_k)
    rows = (await session.execute(stmt)).all()

    hits: list[ChunkHit] = []
    for position, (chunk, filename, score) in enumerate(rows, start=1):
        meta = dict(chunk.metadata_ or {})
        meta["chunk_index"] = chunk.chunk_index
        hits.append(
            ChunkHit(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                filename=filename,
                content=chunk.content,
                score=float(score or 0.0),
                metadata=meta,
                sparse_rank=position,
                sparse_score=float(score or 0.0),
            )
        )
    return hits
