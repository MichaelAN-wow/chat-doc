import uuid
from types import SimpleNamespace

from app.services.document_view import pages_from_chunks, suggest_questions


def _chunk(text: str, page: int, section: str | None = None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        content=text,
        metadata_={"page": page, "section": section},
    )


def test_pages_from_chunks_groups_passages_by_page():
    first = _chunk("Intro text", 1, "Intro")
    second = _chunk("Refund text", 2, "Refunds")
    pages = pages_from_chunks([first, second])

    assert [page["page"] for page in pages] == [1, 2]
    assert pages[0]["passages"][0]["id"] == str(first.id)
    assert pages[1]["passages"][0]["text"] == "Refund text"


def test_suggest_questions_uses_sections_then_fills_three():
    chunks = [
        _chunk("Overview of the harbor.", 1, "Overview"),
        _chunk("Refunds are available for 30 days.", 2, "Refund policy"),
    ]
    questions = suggest_questions("harbor-brief.md", chunks)

    assert len(questions) == 3
    assert questions[0] == "Summarize harbor brief."
    assert 'What does "Overview" say?' in questions
    assert 'What does "Refund policy" say?' in questions