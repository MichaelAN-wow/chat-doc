import logging
import uuid

from sqlalchemy import create_engine, update
from sqlalchemy.orm import Session

from app.config import settings
from app.models.chunk import Chunk
from app.models.document import Document, DocumentStatus
from app.services.chunker import chunk_pages, contextualize_chunk
from app.services.embedding import EmbeddingService
from app.services.ingestion import extract_text
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

_sync_url = settings.DATABASE_URL
if _sync_url.startswith("postgresql+asyncpg"):
    _sync_url = _sync_url.replace("postgresql+asyncpg", "postgresql+psycopg2", 1)

sync_engine = create_engine(_sync_url)

BATCH_SIZE = 100


@celery_app.task(bind=True, max_retries=3)
def process_document(self, document_id: str) -> dict:
    doc_id = uuid.UUID(document_id)
    logger.info("Processing document: %s", doc_id)

    with Session(sync_engine) as session:
        try:
            session.execute(
                update(Document)
                .where(Document.id == doc_id)
                .values(status=DocumentStatus.PROCESSING)
            )
            session.commit()

            doc = session.get(Document, doc_id)
            if not doc:
                logger.error("Document not found: %s", doc_id)
                return {"error": "Document not found"}

            pages = extract_text(doc.file_path, doc.file_type)
            if not pages:
                raise ValueError("No text could be extracted from the document")

            chunks = chunk_pages(pages)
            if not chunks:
                raise ValueError("No chunks generated from the document")

            # Contextual retrieval: section/document context travels with the evidence.
            for chunk in chunks:
                page = (chunk.metadata or {}).get("page")
                section = (chunk.metadata or {}).get("section")
                chunk.content = contextualize_chunk(
                    chunk.content,
                    filename=doc.filename,
                    section=section if isinstance(section, str) else None,
                    page=page if isinstance(page, int) else None,
                )

            embedding_service = EmbeddingService.get_instance()
            texts = [c.content for c in chunks]

            all_embeddings = []
            for i in range(0, len(texts), BATCH_SIZE):
                batch = texts[i : i + BATCH_SIZE]
                batch_embeddings = embedding_service.embed_texts(batch)
                all_embeddings.extend(batch_embeddings)

            session.query(Chunk).filter(Chunk.document_id == doc_id).delete()

            for i in range(0, len(chunks), BATCH_SIZE):
                batch_chunks = chunks[i : i + BATCH_SIZE]
                batch_embeds = all_embeddings[i : i + BATCH_SIZE]
                chunk_objects = [
                    Chunk(
                        document_id=doc_id,
                        content=c.content,
                        chunk_index=c.chunk_index,
                        start_char=c.start_char,
                        end_char=c.end_char,
                        metadata_=c.metadata,
                        embedding=e,
                    )
                    for c, e in zip(batch_chunks, batch_embeds)
                ]
                session.add_all(chunk_objects)

            session.execute(
                update(Document)
                .where(Document.id == doc_id)
                .values(status=DocumentStatus.READY, chunk_count=len(chunks))
            )
            session.commit()

            logger.info("Document %s processed: %d chunks created", doc_id, len(chunks))
            return {"document_id": str(doc_id), "chunk_count": len(chunks)}

        except Exception as exc:
            session.rollback()
            session.execute(
                update(Document)
                .where(Document.id == doc_id)
                .values(status=DocumentStatus.ERROR, error_message=str(exc))
            )
            session.commit()
            logger.exception("Error processing document %s", doc_id)
            raise self.retry(exc=exc, countdown=60)


@celery_app.task
def reindex_document(document_id: str) -> dict:
    return process_document(document_id)
