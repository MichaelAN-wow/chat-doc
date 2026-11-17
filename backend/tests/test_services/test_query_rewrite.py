from unittest.mock import AsyncMock, patch

import pytest

from app.services import query_rewrite


@pytest.mark.asyncio
async def test_rewrite_disabled_returns_original(monkeypatch):
    monkeypatch.setattr(query_rewrite.settings, "REWRITE_ENABLED", False)
    out = await query_rewrite.rewrite_query(
        "and contractors?",
        [{"role": "user", "content": "leave"}],
    )
    assert out == "and contractors?"


@pytest.mark.asyncio
async def test_rewrite_without_history_returns_original(monkeypatch):
    monkeypatch.setattr(query_rewrite.settings, "REWRITE_ENABLED", True)
    out = await query_rewrite.rewrite_query("vacation policy", [])
    assert out == "vacation policy"


@pytest.mark.asyncio
async def test_standalone_followup_rewrite_skips_llm(monkeypatch):
    monkeypatch.setattr(query_rewrite.settings, "REWRITE_ENABLED", True)
    with patch(
        "app.services.query_rewrite.complete_llm",
        new_callable=AsyncMock,
    ) as mocked:
        out = await query_rewrite.rewrite_query(
            "How many vacation days do employees get after two years of service?",
            [
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "hi"},
            ],
        )

    assert out.startswith("How many vacation days")
    mocked.assert_not_awaited()


@pytest.mark.asyncio
async def test_prepare_retrieval_query_expands_without_history(monkeypatch):
    monkeypatch.setattr(query_rewrite.settings, "REWRITE_ENABLED", True)
    with patch(
        "app.services.query_rewrite.complete_llm",
        new_callable=AsyncMock,
        return_value="education university degree bachelor master school background",
    ) as mocked:
        out = await query_rewrite.prepare_retrieval_query(
            "tell me about my education background",
            [],
        )

    assert "education" in out.lower()
    assert "university" in out.lower() or "degree" in out.lower()
    mocked.assert_awaited_once()


@pytest.mark.asyncio
async def test_prepare_retrieval_query_disabled_returns_original(monkeypatch):
    monkeypatch.setattr(query_rewrite.settings, "REWRITE_ENABLED", False)
    out = await query_rewrite.prepare_retrieval_query("education background", [])
    assert out == "education background"


@pytest.mark.asyncio
async def test_rewrite_calls_llm_and_strips_quotes(monkeypatch):
    monkeypatch.setattr(query_rewrite.settings, "REWRITE_ENABLED", True)
    with patch(
        "app.services.query_rewrite.complete_llm",
        new_callable=AsyncMock,
        return_value='"vacation policy for contractors"',
    ) as mocked:
        out = await query_rewrite.rewrite_query(
            "and for contractors?",
            [
                {"role": "user", "content": "What is vacation policy?"},
                {"role": "assistant", "content": "15 days"},
            ],
        )

    assert out == "vacation policy for contractors"
    mocked.assert_awaited_once()


@pytest.mark.asyncio
async def test_rewrite_fallback_on_llm_error(monkeypatch):
    monkeypatch.setattr(query_rewrite.settings, "REWRITE_ENABLED", True)
    with patch(
        "app.services.query_rewrite.complete_llm",
        new_callable=AsyncMock,
        side_effect=RuntimeError("boom"),
    ):
        out = await query_rewrite.rewrite_query(
            "what about that?",
            [{"role": "user", "content": "vacation policy"}],
        )
    assert out == "what about that?"


@pytest.mark.asyncio
async def test_rewrite_keeps_error_code_tokens(monkeypatch):
    monkeypatch.setattr(query_rewrite.settings, "REWRITE_ENABLED", True)
    with patch(
        "app.services.query_rewrite.complete_llm",
        new_callable=AsyncMock,
        return_value="what does this error mean",
    ):
        out = await query_rewrite.rewrite_query(
            "what about ERR-4402?",
            [{"role": "user", "content": "runbook"}],
        )
    assert out == "what about ERR-4402?"


def test_needs_rewrite_for_pronoun_followup():
    assert query_rewrite.needs_rewrite(
        "what about that?",
        [{"role": "user", "content": "leave policy"}],
    )
    assert not query_rewrite.needs_rewrite(
        "How many vacation days do employees get after two years?",
        [{"role": "user", "content": "hello"}],
    )
