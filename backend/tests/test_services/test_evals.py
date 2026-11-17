import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.evals.runner import load_golden_cases, run_evals
from app.services.retrieval.types import ChunkHit


def test_golden_cases_load():
    cases = load_golden_cases()
    assert len(cases) >= 4
    ids = {case["id"] for case in cases}
    assert "leave-policy" in ids
    assert "unknown-salary" in ids
    assert "error-code" in ids


@pytest.mark.asyncio
async def test_run_evals_scores_answerable_and_refusal():
    workspace_id = uuid.uuid4()

    def fake_hits(question: str):
        if "salary" in question.lower():
            return []
        filename = "sample-runbook.md" if "ERR-4402" in question else "sample-hr-policy.md"
        return [
            ChunkHit(
                chunk_id=uuid.uuid4(),
                document_id=uuid.uuid4(),
                filename=filename,
                content="stub",
                score=0.05,
                metadata={},
            )
        ]

    async def fake_retrieve(session, question, workspace_id, top_k=5):
        return fake_hits(question)

    async def fake_answer(session, *, workspace_id, question, history=None):
        if "salary" in question.lower():
            return {
                "answer": "I couldn't find this in the uploaded documents.",
                "refused": True,
                "citations": [],
                "hits": [],
                "rewritten_query": question,
            }
        if "ERR-4402" in question:
            answer = "ERR-4402 means the account is suspended."
        elif "parental" in question.lower():
            answer = "Eligible employees receive 12 weeks of paid parental leave."
        else:
            answer = "After 2 years employees get 15 vacation days."
        return {
            "answer": answer,
            "refused": False,
            "citations": [],
            "hits": fake_hits(question),
            "rewritten_query": question,
        }

    with (
        patch("app.evals.runner.hybrid_retrieve", side_effect=fake_retrieve),
        patch("app.evals.runner.answer_once", side_effect=fake_answer),
    ):
        report = await run_evals(AsyncMock(), workspace_id)

    assert report["total"] == 4
    assert report["hit_rate"] == 1.0
    assert report["answer_rate"] == 1.0
    assert report["refusal_rate"] == 1.0
