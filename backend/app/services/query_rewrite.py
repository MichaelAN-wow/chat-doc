"""Retrieval query preparation: resolve follow-ups and expand for search.

This replaces brittle per-intent keyword maps. One LLM call turns any user
question into a search string that hybrid retrieval can match to passages.
The original question is still used for answer generation.
"""

import logging
import re

from app.config import settings
from app.services.llm_client import complete_llm

logger = logging.getLogger(__name__)

REWRITE_PROMPT = """Rewrite the latest user question into a standalone search query.
Use prior chat turns only to resolve pronouns and references.
Preserve entities, error codes, and product names exactly.
Do not expand into a new question or add facts.
Return only the rewritten query text, nothing else.

Chat history:
{history}

Latest question:
{question}
"""

EXPAND_PROMPT = """You prepare a search query for a document Q&A system (hybrid keyword + vector search).

Given the user question and optional chat history, return ONE search query that will retrieve the most relevant passages from an uploaded document.

Rules:
- Resolve pronouns and vague references using chat history when present.
- Add useful synonyms and section-oriented terms that help find the right part of the document
  (examples: education → education university degree school bachelor master;
  skills → skills technologies tools languages;
  who am I / profile → summary experience education background overview;
  current job → current employer present role title dates).
- Keep names, product terms, and error codes exactly.
- Do not answer the question. Do not invent document facts.
- Prefer a short keyword-rich query over a full sentence.
- Return only the search query text, nothing else.

Chat history:
{history}

User question:
{question}
"""

_FOLLOWUP_RE = re.compile(
    r"\b(it|its|this|that|those|these|they|them|he|she|his|her|their|"
    r"the same|above|previous|former|latter)\b"
    r"|^(and|what about|how about|also|same for|for them|for that)\b"
    r"|\b(the (policy|document|section|error|one|rule|limit))\b",
    re.IGNORECASE,
)
_TOKEN_RE = re.compile(r"\b[A-Z]{2,}[-_]?\d+[A-Z0-9_-]*\b")


def needs_rewrite(question: str, history: list[dict[str, str]]) -> bool:
    """True when chat history is needed to make the question standalone."""
    if not history:
        return False
    text = question.strip()
    if not text:
        return False
    words = text.split()
    if _FOLLOWUP_RE.search(text):
        return True
    return len(words) <= 6


def _preserve_critical_tokens(original: str, rewritten: str) -> str:
    for token in _TOKEN_RE.findall(original):
        if token.lower() not in rewritten.lower():
            return original
    return rewritten


def _clean_llm_query(raw: str | None, original: str) -> str:
    cleaned = (raw or "").replace("\x00", " ").strip().strip('"').strip()
    if not cleaned:
        return original
    # Models sometimes return multiple lines; keep the first non-empty.
    first = next((line.strip() for line in cleaned.splitlines() if line.strip()), original)
    first = " ".join(first.split())  # collapse whitespace / stray control chars
    return _preserve_critical_tokens(original, first)


async def rewrite_query(question: str, history: list[dict[str, str]]) -> str:
    """Resolve follow-ups into a standalone question (legacy helper + tests)."""
    original = question.strip()
    if not settings.REWRITE_ENABLED or not history or not needs_rewrite(original, history):
        return original

    history_text = "\n".join(f"{item['role']}: {item['content']}" for item in history[-6:])
    try:
        rewritten = await complete_llm(
            [
                {
                    "role": "user",
                    "content": REWRITE_PROMPT.format(history=history_text, question=original),
                }
            ],
            temperature=0.0,
        )
    except Exception:
        logger.exception("Query rewrite failed; using original question")
        return original

    return _clean_llm_query(rewritten, original)


async def prepare_retrieval_query(
    question: str,
    history: list[dict[str, str]] | None = None,
) -> str:
    """Build a search query for hybrid retrieval for any user question.

    Always expands when REWRITE_ENABLED (no per-topic keyword tables).
    Falls back to the original question if the LLM call fails.
    """
    original = (question or "").strip()
    if not original:
        return original
    if not settings.REWRITE_ENABLED:
        return original

    history = history or []
    history_text = (
        "\n".join(f"{item['role']}: {item['content']}" for item in history[-6:])
        if history
        else "(none)"
    )
    try:
        expanded = await complete_llm(
            [
                {
                    "role": "user",
                    "content": EXPAND_PROMPT.format(history=history_text, question=original),
                }
            ],
            temperature=0.0,
        )
    except Exception:
        logger.exception("Retrieval query expand failed; using original question")
        # Follow-up resolution without expand is still useful.
        return await rewrite_query(original, history)

    return _clean_llm_query(expanded, original)
