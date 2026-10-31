import logging
import os
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.document import Document, DocumentStatus

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".markdown", ".docx"}


def get_file_type(filename: str, content_type: str | None) -> str:
    ext = Path(filename).suffix.lower()
    if ext in ALLOWED_EXTENSIONS:
        return ext.lstrip(".")
    if content_type and content_type in ALLOWED_TYPES:
        return ALLOWED_TYPES[content_type]
    raise ValueError(f"Unsupported file type: {ext} ({content_type})")


async def save_upload(
    session: AsyncSession,
    file: UploadFile,
    workspace_id: uuid.UUID,
) -> Document:
    file_type = get_file_type(file.filename, file.content_type)

    workspace_dir = Path(settings.UPLOAD_DIR) / str(workspace_id)
    workspace_dir.mkdir(parents=True, exist_ok=True)

    doc_id = uuid.uuid4()
    file_ext = Path(file.filename).suffix
    file_path = workspace_dir / f"{doc_id}{file_ext}"

    content = await file.read()
    if not content:
        raise ValueError("That file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("File is larger than 20 MB")
    file_path.write_bytes(content)

    document = Document(
        id=doc_id,
        workspace_id=workspace_id,
        filename=file.filename,
        file_path=str(file_path),
        file_type=file_type,
        file_size=len(content),
        status=DocumentStatus.PENDING,
    )
    session.add(document)
    await session.commit()
    await session.refresh(document)

    logger.info("Saved document %s (%s, %d bytes)", document.id, file_type, len(content))
    return document


async def delete_document(session: AsyncSession, document: Document) -> None:
    try:
        if os.path.exists(document.file_path):
            os.remove(document.file_path)
    except OSError:
        logger.warning("Failed to delete file: %s", document.file_path)

    await session.delete(document)
    await session.commit()
