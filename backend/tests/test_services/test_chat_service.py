import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat_service import (
    _build_citations,
    _build_context,
    _looks_like_refusal,
    _should_refuse,
    answer_once,
    stream_chat,
)
from app.services.llm_client import REFUSAL_TEXT
from app.services.retrieval.types import ChunkHit


def _hit(
    score: float = 0.05,
    *,
    dense_score: float | None = 0.5,
    sparse_score: float | None = None,
    filename: str = "policy.md",
) -> ChunkHit:
    return ChunkHit(
        chunk_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        filename=filename,
        content="After 2 years employees get 15 vacation days.",
        score=score,
        metadata={"page": 2, "section": "Vacation Days"},
        dense_score=dense_score,
        sparse_score=sparse_score,
    )


def test_should_refuse_when_no_hits():
    assert _should_refuse([]) is True


def test_retrieved_passages_are_answered_even_when_similarity_is_modest(monkeypatch):
    from app.services import chat_service

    monkeypatch.setattr(chat_service.settings, "DENSE_MIN_SCORE", 0.35)
    assert _should_refuse([_hit(dense_score=0.20)]) is False
    assert _should_refuse([_hit(dense_score=0.50)]) is False


def test_should_allow_keyword_sparse_hit(monkeypatch):
    from app.services import chat_service

    monkeypatch.setattr(chat_service.settings, "DENSE_MIN_SCORE", 0.35)
    hit = _hit(dense_score=0.1, sparse_score=0.8)
    assert _should_refuse([hit], query="What does ERR-4402 mean?") is False


def test_should_allow_summary_even_with_weak_dense(monkeypatch):
    from app.services import chat_service

    monkeypatch.setattr(chat_service.settings, "DENSE_MIN_SCORE", 0.35)
    assert _should_refuse([_hit(dense_score=0.12)], query="summarize the document") is False
    assert _should_refuse([], query="summarize the document") is True


def test_looks_like_refusal():
    assert _looks_like_refusal(REFUSAL_TEXT) is True
    assert _looks_like_refusal("Employees get 15 vacation days.") is False


def test_build_context_includes_source_and_section():
    context = _build_context([_hit()])
    assert "[1]" in context
    assert "policy.md" in context
    assert "Vacation Days" in context
    assert "15 vacation days" in context


def test_build_citations_fields():
    citations = _build_citations([_hit(score=0.1234567, dense_score=0.55)])
    assert len(citations) == 1
    assert citations[0]["index"] == 1
    assert citations[0]["filename"] == "policy.md"
    assert citations[0]["page"] == 2
    assert citations[0]["section"] == "Vacation Days"
    assert citations[0]["score"] == 0.123457
    assert citations[0]["dense_score"] == 0.55


def test_citations_used_keeps_original_index():
    from app.services.chat_service import _citations_used_in_answer

    citations = _build_citations(
        [_hit(filename="a.md"), _hit(filename="b.md"), _hit(filename="c.md")]
    )
    used = _citations_used_in_answer("Only the second passage matters [2].", citations)
    assert len(used) == 1
    assert used[0]["index"] == 2
    assert used[0]["filename"] == "b.md"


@pytest.mark.asyncio
async def test_answer_once_refuses_on_weak_retrieval():
    with (
        patch(
            "app.services.chat_service.prepare_retrieval_query",
            new_callable=AsyncMock,
            return_value="salary compensation",
        ),
        patch(
            "app.services.chat_service.hybrid_retrieve",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        result = await answer_once(AsyncMock(), workspace_id=uuid.uuid4(), question="salary?")

    assert result["refused"] is True
    assert result["answer"] == REFUSAL_TEXT
    assert result["citations"] == []


@pytest.mark.asyncio
async def test_answer_once_uses_llm_when_hits_strong():
    with (
        patch(
            "app.services.chat_service.prepare_retrieval_query",
            new_callable=AsyncMock,
            return_value="vacation days employees",
        ),
        patch(
            "app.services.chat_service.hybrid_retrieve",
            new_callable=AsyncMock,
            return_value=[_hit(dense_score=0.55)],
        ),
        patch(
            "app.services.chat_service.complete_llm",
            new_callable=AsyncMock,
            return_value="Employees get 15 vacation days. [1]",
        ),
    ):
        result = await answer_once(
            AsyncMock(), workspace_id=uuid.uuid4(), question="How many vacation days?"
        )

    assert result["refused"] is False
    assert "15" in result["answer"]
    assert len(result["citations"]) == 1


@pytest.mark.asyncio
async def test_stream_chat_refusal_events():
    session = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()

    with (
        patch(
            "app.services.chat_service.prepare_retrieval_query",
            new_callable=AsyncMock,
            return_value="q",
        ),
        patch(
            "app.services.chat_service.hybrid_retrieve",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.services.chat_service._get_history",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        events = [
            event
            async for event in stream_chat(
                session,
                conversation_id=uuid.uuid4(),
                user_message="What is Alice salary?",
                workspace_id=uuid.uuid4(),
            )
        ]

    joined = "".join(events)
    assert "event: chunk" in joined
    assert REFUSAL_TEXT in joined
    assert "event: citations" in joined
    assert "event: done" in joined
    assert '"refused": true' in joined


@pytest.mark.asyncio
async def test_stream_chat_streams_tokens_and_citations():
    session = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()

    async def fake_stream(_messages, **_kwargs):
        for token in ["Hello", " world"]:
            yield token

    with (
        patch(
            "app.services.chat_service.prepare_retrieval_query",
            new_callable=AsyncMock,
            return_value="q",
        ),
        patch(
            "app.services.chat_service.hybrid_retrieve",
            new_callable=AsyncMock,
            return_value=[_hit(dense_score=0.55)],
        ),
        patch(
            "app.services.chat_service._get_history",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch("app.services.chat_service.stream_llm_response", side_effect=fake_stream),
    ):
        events = [
            event
            async for event in stream_chat(
                session,
                conversation_id=uuid.uuid4(),
                user_message="How many vacation days?",
                workspace_id=uuid.uuid4(),
                model_override={
                    "provider": "nvidia",
                    "model": "nvidia/nemotron-3.5-bolt-e4b",
                    "temperature": 0.1,
                    "max_tokens": 800,
                },
            )
        ]

    chunk_payloads = []
    for event in events:
        if event.startswith("event: chunk"):
            data_line = event.strip().split("data: ", 1)[1]
            chunk_payloads.append(json.loads(data_line)["content"])

    assert "".join(chunk_payloads) == "Hello world"
    assert any(e.startswith("event: meta") for e in events)
    assert any("nvidia/nemotron-3.5-bolt-e4b" in e for e in events)
    assert any(e.startswith("event: citations") for e in events)
    assert any('"refused": false' in e for e in events)
