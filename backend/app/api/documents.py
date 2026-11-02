import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.chunk import Chunk
from app.models.document import Document, DocumentStatus
from app.models.workspace import Workspace
from app.schemas.documents import (
    DocumentResponse,
    DocumentStatusResponse,
    DocumentTextResponse,
    SuggestionsResponse,
)
from app.services.document_service import delete_document, save_upload
from app.services.document_view import mime_for, pages_from_chunks, suggest_questions
from app.tasks.document_tasks import process_document, reindex_document

router = APIRouter(tags=["documents"])


@router.post(
    "/workspaces/{workspace_id}/documents",
    response_model=DocumentResponse,
    status_code=201,
)
async def upload_document(
    workspace_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
):
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    try:
        document = await save_upload(db, file, workspace_id)
    except ValueError as e:
        message = str(e)
        if "20 MB" in message:
            status_code = 413
        elif message.startswith("Unsupported"):
            status_code = 415
        else:
            status_code = 400
        raise HTTPException(status_code=status_code, detail=message)

    process_document.delay(str(document.id))

    return document


@router.get(
    "/workspaces/{workspace_id}/documents",
    response_model=list[DocumentResponse],
)
async def list_documents(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document)
        .where(Document.workspace_id == workspace_id)
        .order_by(Document.created_at.desc())
    )
    return result.scalars().all()


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


async def _require_document(document_id: uuid.UUID, db: AsyncSession) -> Document:
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


async def _ready_chunks(document: Document, db: AsyncSession) -> list[Chunk]:
    if document.status != DocumentStatus.READY:
        raise HTTPException(status_code=409, detail="The document is not ready yet.")
    result = await db.execute(
        select(Chunk).where(Chunk.document_id == document.id).order_by(Chunk.chunk_index)
    )
    return list(result.scalars().all())


@router.get("/documents/{document_id}/file")
async def get_document_file(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    document = await _require_document(document_id, db)
    if not document.file_path:
        raise HTTPException(status_code=404, detail="Document file not found")
    return FileResponse(
        document.file_path,
        media_type=mime_for(document.file_type),
        filename=document.filename,
        content_disposition_type="inline",
    )


@router.get("/documents/{document_id}/text", response_model=DocumentTextResponse)
async def get_document_text(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    document = await _require_document(document_id, db)
    chunks = await _ready_chunks(document, db)
    return {
        "documentId": str(document.id),
        "fileName": document.filename,
        "mimeType": mime_for(document.file_type),
        "pages": pages_from_chunks(chunks),
    }


@router.get("/documents/{document_id}/suggestions", response_model=SuggestionsResponse)
async def get_document_suggestions(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    document = await _require_document(document_id, db)
    chunks = await _ready_chunks(document, db)
    return {"questions": suggest_questions(document.filename, chunks)}


@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.delete("/documents/{document_id}", status_code=204)
async def remove_document(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    await delete_document(db, document)


@router.post("/documents/{document_id}/reindex", status_code=202)
async def trigger_reindex(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    document.status = DocumentStatus.PENDING
    document.chunk_count = 0
    document.error_message = None
    await db.commit()

    reindex_document.delay(str(document_id))

    return {"message": "Reindexing started", "document_id": str(document_id)}
