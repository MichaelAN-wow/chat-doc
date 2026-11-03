import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.workspace import Workspace
from app.schemas.search import SearchRequest, SearchResponse, SearchResult
from app.services.query_rewrite import prepare_retrieval_query
from app.services.retrieval import hybrid_retrieve

router = APIRouter(tags=["search"])


@router.post(
    "/workspaces/{workspace_id}/search",
    response_model=SearchResponse,
)
async def hybrid_search(
    workspace_id: uuid.UUID,
    body: SearchRequest,
    db: AsyncSession = Depends(get_db),
):
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    retrieve_q = await prepare_retrieval_query(body.query, [])
    alt_query = body.query.strip() if retrieve_q.strip() != body.query.strip() else None
    chunks = await hybrid_retrieve(
        session=db,
        query=retrieve_q,
        workspace_id=workspace_id,
        top_k=body.top_k,
        alt_query=alt_query,
    )

    results = [
        SearchResult(
            chunk_id=c.chunk_id,
            document_id=c.document_id,
            filename=c.filename,
            content=c.content,
            score=c.score,
            metadata={
                **(c.metadata or {}),
                "dense_rank": c.dense_rank,
                "sparse_rank": c.sparse_rank,
                "retrieval_query": retrieve_q,
            },
        )
        for c in chunks
    ]

    return SearchResponse(results=results)
