import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import async_session, get_db
from app.middleware.rate_limiter import check_rate_limit
from app.models.conversation import Conversation, Message
from app.models.document import Document, DocumentStatus
from app.models.workspace import Workspace
from app.schemas.chat import (
    ChatRequest,
    ConversationCreate,
    ConversationResponse,
    MessageResponse,
)
from app.services.chat_service import stream_chat

router = APIRouter(tags=["chat"])


@router.post(
    "/workspaces/{workspace_id}/conversations",
    response_model=ConversationResponse,
    status_code=201,
)
async def create_conversation(
    workspace_id: uuid.UUID,
    body: ConversationCreate,
    db: AsyncSession = Depends(get_db),
):
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    conversation = Conversation(workspace_id=workspace_id, title=body.title)
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.get(
    "/workspaces/{workspace_id}/conversations",
    response_model=list[ConversationResponse],
)
async def list_conversations(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.workspace_id == workspace_id)
        .order_by(Conversation.updated_at.desc())
    )
    return result.scalars().all()


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageResponse],
)
async def get_messages(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    return result.scalars().all()


@router.post("/conversations/{conversation_id}/chat")
async def chat(
    conversation_id: uuid.UUID,
    body: ChatRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request)

    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if body.document_id:
        document = await db.get(Document, body.document_id)
        if not document or document.workspace_id != conversation.workspace_id:
            raise HTTPException(status_code=404, detail="Document not found")
        if document.status != DocumentStatus.READY:
            raise HTTPException(status_code=409, detail="The document is not ready yet.")

    workspace_id = conversation.workspace_id
    message = body.message
    document_id = body.document_id
    top_k = body.top_k
    if body.model and body.model.top_k is not None:
        top_k = body.model.top_k
    model_override = body.model.model_dump(exclude_none=True) if body.model else None

    async def event_stream():
        async with async_session() as session:
            async for event in stream_chat(
                session=session,
                conversation_id=conversation_id,
                user_message=message,
                workspace_id=workspace_id,
                top_k=top_k,
                document_id=document_id,
                model_override=model_override,
            ):
                yield event

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conversation)
    await db.commit()
