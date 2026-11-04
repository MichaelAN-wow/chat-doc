import json
import logging
import re
import time
import uuid
from collections.abc import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.conversation import Message, MessageRole
from app.services.llm_client import REFUSAL_TEXT, SYSTEM_PROMPT, complete_llm, stream_llm_response
from app.services.query_rewrite import prepare_retrieval_query
from app.services.retrieval import ChunkHit, hybrid_retrieve

logger = logging.getLogger(__name__)

_CITE_RE = re.compile(r"[\[［【〔]\s*(\d+)(?:\s*[†‡*][^\]]*?)?\s*[\]］】〕]")
_WEAK_ANSWER_RE = re.compile(
    r"(do not contain|doesn't contain|does not contain|do not include|doesn't include|"
    r"no information about|couldn't find|could not find|can't summarize|cannot summarize|"
    r"not (?:mentioned|discussed|included)|"
    r"passages (?:detail|only|are about|you provided).*(?:but|do not|only))",
    re.IGNORECASE,
)
_STOPWORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "my",
    "me",
    "i",
    "you",
    "your",
    "about",
    "tell",
    "what",
    "which",
    "who",
    "is",
    "are",
    "was",
    "were",
    "do",
    "does",
    "did",
    "please",
    "with",
    "from",
    "this",
    "that",
}


def _question_terms(question: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", (question or "").lower())
        if len(token) > 2 and token not in _STOPWORDS
    }


def _evidence_overlap(question: str, hits: list[ChunkHit]) -> float:
    """Fraction of question terms that appear in retrieved evidence (0–1)."""
    terms = _question_terms(question)
    if not terms or not hits:
        return 0.0
    blob = " ".join(hit.content for hit in hits).lower()
    hit_count = sum(1 for term in terms if term in blob)
    return hit_count / len(terms)


async def stream_chat(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_message: str,
    workspace_id: uuid.UUID,
    top_k: int | None = None,
    document_id: uuid.UUID | None = None,
    model_override: dict | None = None,
) -> AsyncGenerator[str, None]:
    started = time.perf_counter()
    top_k = top_k or settings.FINAL_TOP_K
    llm_override = {
        key: value
        for key, value in (model_override or {}).items()
        if key in {"provider", "model", "base_url"} and value
    }
    temperature = float((model_override or {}).get("temperature") or 0.2)
    max_tokens = (model_override or {}).get("max_tokens")

    user_msg = Message(
        id=uuid.uuid4(),
        conversation_id=conversation_id,
        role=MessageRole.USER,
        content=user_message,
        meta=_user_meta(user_message),
    )
    session.add(user_msg)
    await session.commit()

    history = await _get_history(session, conversation_id, limit=10)
    # LLM expands any question into a search query — no per-topic keyword tables.
    retrieve_q = await prepare_retrieval_query(user_message, history)
    alt_query = user_message.strip() if retrieve_q.strip() != user_message.strip() else None

    hits = await hybrid_retrieve(
        session,
        retrieve_q,
        workspace_id,
        top_k=top_k,
        alt_query=alt_query,
        document_id=document_id,
    )

    # If overlap with the question is weak, widen once with a larger pool.
    overlap = _evidence_overlap(user_message, hits)
    if hits and overlap < 0.35:
        wider = max(top_k, 12)
        meta_retry_hits = await hybrid_retrieve(
            session,
            retrieve_q,
            workspace_id,
            top_k=wider,
            alt_query=alt_query or user_message.strip(),
            document_id=document_id,
        )
        if _evidence_overlap(user_message, meta_retry_hits) > overlap:
            hits = meta_retry_hits
            top_k = wider
            overlap = _evidence_overlap(user_message, hits)

    refused = _should_refuse(hits, user_message)
    all_citations = _build_citations(hits) if hits and not refused else []
    retrieve_q = retrieve_q.replace("\x00", " ").strip()
    meta = {
        "rewritten_query": retrieve_q,
        "retrieval_query": retrieve_q,
        "retrieval_scores": [round(hit.score, 6) for hit in hits],
        "dense_scores": [
            round(hit.dense_score, 6) if hit.dense_score is not None else None for hit in hits
        ],
        "evidence_overlap": round(overlap, 3),
        "refused": refused,
        "hit_count": len(hits),
        "llm_provider": llm_override.get("provider") or settings.LLM_PROVIDER,
        "llm_model": llm_override.get("model") or settings.LLM_MODEL,
    }

    if refused:
        yield f"event: chunk\ndata: {json.dumps({'content': REFUSAL_TEXT, 'type': 'text'})}\n\n"
        yield f"event: citations\ndata: {json.dumps({'citations': []})}\n\n"
        assistant_msg = Message(
            id=uuid.uuid4(),
            conversation_id=conversation_id,
            role=MessageRole.ASSISTANT,
            content=REFUSAL_TEXT,
            citations=[],
            meta={**meta, "latency_ms": int((time.perf_counter() - started) * 1000)},
        )
        session.add(assistant_msg)
        await session.commit()
        yield (
            f"event: done\ndata: {json.dumps({'message_id': str(assistant_msg.id), 'refused': True})}\n\n"
        )
        return

    context = _build_context(hits)
    llm_messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "system",
            "content": (
                "Conversation turns below may resolve pronouns. "
                "Unverified assistant replies are labeled; prefer the Context passages.\n"
                f"Context:\n{context}"
            ),
        },
        *history,
        {"role": "user", "content": user_message},
    ]

    yield (
        "event: meta\n"
        f"data: {json.dumps({'provider': meta['llm_provider'], 'model': meta['llm_model']})}\n\n"
    )

    full_response = ""
    async for token in stream_llm_response(
        llm_messages,
        temperature=temperature,
        max_tokens=max_tokens,
        override=llm_override or None,
    ):
        full_response += token
        yield f"event: chunk\ndata: {json.dumps({'content': token, 'type': 'text'})}\n\n"

    # Model said "not in passages" but evidence actually overlaps the question → one retry.
    if _WEAK_ANSWER_RE.search(full_response) and overlap >= 0.35 and hits:
        meta["retried_after_weak_answer"] = True
        full_response = ""
        retry_messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": f"Context:\n{context}"},
            {
                "role": "user",
                "content": (
                    "The passages above are from the uploaded document and appear related to the question. "
                    f"Answer this using only those passages: {user_message}. "
                    "If a detail is missing, say exactly which detail is missing. "
                    "Do not claim the document has no relevant passages when they are present above."
                ),
            },
        ]
        async for token in stream_llm_response(
            retry_messages,
            temperature=temperature,
            max_tokens=max_tokens,
            override=llm_override or None,
        ):
            full_response += token
            yield f"event: chunk\ndata: {json.dumps({'content': token, 'type': 'text'})}\n\n"

    if _looks_like_refusal(full_response) and hits and not _WEAK_ANSWER_RE.search(full_response):
        # Hard canned refusal while we have hits — retry once (legacy Nemotron behavior).
        meta["retried_after_refusal"] = True
        full_response = ""
        retry_messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": f"Context:\n{context}"},
            {
                "role": "user",
                "content": (
                    "The passages above are the uploaded document. "
                    f"Answer this from them: {user_message}. "
                    "Do not say the document is missing."
                ),
            },
        ]
        async for token in stream_llm_response(
            retry_messages,
            temperature=temperature,
            max_tokens=max_tokens,
            override=llm_override or None,
        ):
            full_response += token
            yield f"event: chunk\ndata: {json.dumps({'content': token, 'type': 'text'})}\n\n"

    if _looks_like_refusal(full_response):
        citations = []
        meta["refused"] = True
    else:
        citations = _citations_used_in_answer(full_response, all_citations)
        meta["refused"] = False

    yield f"event: citations\ndata: {json.dumps({'citations': citations})}\n\n"

    assistant_msg = Message(
        id=uuid.uuid4(),
        conversation_id=conversation_id,
        role=MessageRole.ASSISTANT,
        content=full_response,
        citations=citations,
        meta={
            **meta,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "evidence_trusted": False,
        },
    )
    session.add(assistant_msg)
    await session.commit()

    yield (
        f"event: done\ndata: {json.dumps({'message_id': str(assistant_msg.id), 'refused': meta['refused']})}\n\n"
    )


async def answer_once(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    question: str,
    history: list[dict[str, str]] | None = None,
) -> dict:
    history = history or []
    retrieve_q = await prepare_retrieval_query(question, history)
    alt_query = question.strip() if retrieve_q.strip() != question.strip() else None
    hits = await hybrid_retrieve(
        session,
        retrieve_q,
        workspace_id,
        top_k=settings.FINAL_TOP_K,
        alt_query=alt_query,
    )
    if _should_refuse(hits, question):
        return {
            "answer": REFUSAL_TEXT,
            "citations": [],
            "hits": hits,
            "rewritten_query": retrieve_q,
            "refused": True,
        }

    context = _build_context(hits)
    answer = await complete_llm(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "system",
                "content": (
                    "Conversation turns below may resolve pronouns. "
                    "Prefer the Context passages over prior assistant text.\n"
                    f"Context:\n{context}"
                ),
            },
            *history,
            {"role": "user", "content": question},
        ]
    )
    refused = _looks_like_refusal(answer)
    citations = [] if refused else _citations_used_in_answer(answer, _build_citations(hits))
    return {
        "answer": answer,
        "citations": citations,
        "hits": hits,
        "rewritten_query": retrieve_q,
        "refused": refused,
    }


def _should_refuse(hits: list[ChunkHit], query: str = "") -> bool:
    del query
    return not hits


def _looks_like_refusal(text: str) -> bool:
    return "couldn't find this in the uploaded documents" in text.lower()


def _build_context(chunks: list[ChunkHit]) -> str:
    if not chunks:
        return ""
    parts = []
    for i, chunk in enumerate(chunks):
        page = chunk.metadata.get("page", "?")
        section = chunk.metadata.get("section")
        section_bit = f", Section {section}" if section else ""
        parts.append(
            f"[{i + 1}] (Source: {chunk.filename}, Page {page}{section_bit})\n{chunk.content}"
        )
    return "\n\n".join(parts)


def _build_citations(chunks: list[ChunkHit]) -> list[dict]:
    return [
        {
            # 1-based index matching Context labels [1], [2], … — must stay stable
            # after filtering so the UI can map inline markers to the same source.
            "index": i + 1,
            "chunk_id": str(chunk.chunk_id),
            "document_id": str(chunk.document_id),
            "filename": chunk.filename,
            "snippet": chunk.content[:200],
            "page": chunk.metadata.get("page"),
            "section": chunk.metadata.get("section"),
            "score": round(chunk.score, 6),
            "dense_score": (
                round(chunk.dense_score, 6) if chunk.dense_score is not None else None
            ),
        }
        for i, chunk in enumerate(chunks)
    ]


def _citations_used_in_answer(answer: str, citations: list[dict]) -> list[dict]:
    """Keep citation records that the model actually referenced with [n].

    Preserves each citation's original ``index`` (Context number). Do not renumber
    by list position — the frontend matches inline [n] markers to that index.
    """
    if not citations:
        return []
    by_index = {
        int(item["index"]): item
        for item in citations
        if isinstance(item.get("index"), int)
    }
    if not by_index:
        by_index = {i + 1: item for i, item in enumerate(citations)}
    indexes = {int(match) for match in _CITE_RE.findall(answer or "")}
    if not indexes:
        return citations
    used = [by_index[index] for index in sorted(indexes) if index in by_index]
    return used or citations


def _user_meta(content: str) -> dict | None:
    lowered = content.lower()
    if "not" in lowered and ("flatiron" in lowered or "walmart" in lowered or "current" in lowered):
        return {"type": "user_correction", "status": "confirmed_in_conversation"}
    return None


async def _get_history(
    session: AsyncSession, conversation_id: uuid.UUID, limit: int = 10
) -> list[dict]:
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    messages = list(reversed(result.scalars().all()))

    if messages and messages[-1].role == MessageRole.USER:
        messages = messages[:-1]

    messages = [msg for msg in messages if not _looks_like_refusal(msg.content)]

    history: list[dict] = []
    for msg in messages:
        if msg.role == MessageRole.ASSISTANT:
            history.append(
                {
                    "role": "assistant",
                    "content": (
                        "[Unverified prior assistant reply — not document evidence]\n"
                        f"{msg.content}"
                    ),
                }
            )
        else:
            prefix = ""
            if isinstance(msg.meta, dict) and msg.meta.get("type") == "user_correction":
                prefix = "[User correction]\n"
            history.append({"role": "user", "content": f"{prefix}{msg.content}"})
    return history
