import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    filename: str
    file_type: str
    file_size: int
    status: str
    error_message: str | None
    chunk_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentStatusResponse(BaseModel):
    id: uuid.UUID
    status: str
    chunk_count: int
    error_message: str | None

    model_config = {"from_attributes": True}


class PassageResponse(BaseModel):
    id: str
    text: str


class DocumentPageResponse(BaseModel):
    page: int
    passages: list[PassageResponse]


class DocumentTextResponse(BaseModel):
    documentId: str
    fileName: str
    mimeType: str
    pages: list[DocumentPageResponse]


class SuggestionsResponse(BaseModel):
    questions: list[str]
