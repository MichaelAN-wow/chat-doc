from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.chat_service import answer_once
from app.services.retrieval import hybrid_retrieve

GOLDEN_PATH = Path(__file__).with_name("golden.yaml")


def load_golden_cases() -> list[dict[str, Any]]:
    return yaml.safe_load(GOLDEN_PATH.read_text(encoding="utf-8"))


async def run_evals(session: AsyncSession, workspace_id) -> dict:
    cases = load_golden_cases()
    results: list[dict] = []
    hit_scores: list[bool] = []
    answer_scores: list[bool] = []
    refusal_scores: list[bool] = []

    for case in cases:
        question = case["question"]
        case_type = case.get("type", "answerable")
        hits = await hybrid_retrieve(session, question, workspace_id, top_k=5)
        expected_doc = case.get("expected_doc")
        hit_at_k = None
        if expected_doc:
            hit_at_k = any(expected_doc.lower() in hit.filename.lower() for hit in hits)
            hit_scores.append(bool(hit_at_k))

        answered = await answer_once(session, workspace_id=workspace_id, question=question)
        answer = answered["answer"]
        refused = bool(answered["refused"])

        if case_type == "unanswerable":
            ok = refused or all(
                phrase.lower() in answer.lower() for phrase in case.get("must_contain", [])
            )
            refusal_scores.append(ok)
            results.append(
                {
                    "id": case["id"],
                    "hit_at_k": hit_at_k,
                    "answer_ok": ok,
                    "refused": refused,
                }
            )
            continue

        ok = all(phrase.lower() in answer.lower() for phrase in case.get("must_contain", []))
        answer_scores.append(ok)
        results.append(
            {
                "id": case["id"],
                "hit_at_k": hit_at_k,
                "answer_ok": ok,
                "refused": refused,
            }
        )

    def _rate(values: list[bool]) -> float | None:
        if not values:
            return None
        return round(sum(1 for value in values if value) / len(values), 3)

    return {
        "total": len(results),
        "hit_rate": _rate(hit_scores),
        "answer_rate": _rate(answer_scores),
        "refusal_rate": _rate(refusal_scores),
        "results": results,
    }
