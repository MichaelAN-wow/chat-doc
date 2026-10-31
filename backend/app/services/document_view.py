from pathlib import Path

from app.models.chunk import Chunk

MIME_BY_TYPE = {
    "pdf": "application/pdf",
    "txt": "text/plain",
    "md": "text/markdown",
    "markdown": "text/markdown",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def mime_for(file_type: str) -> str:
    return MIME_BY_TYPE.get(file_type, "application/octet-stream")


def pages_from_chunks(chunks: list[Chunk]) -> list[dict]:
    grouped: dict[int, list[dict]] = {}
    order: list[int] = []
    for chunk in chunks:
        meta = chunk.metadata_ or {}
        raw_page = meta.get("page") or 1
        try:
            page = int(raw_page)
        except (TypeError, ValueError):
            page = 1
        if page < 1:
            page = 1
        if page not in grouped:
            grouped[page] = []
            order.append(page)
        grouped[page].append({"id": str(chunk.id), "text": chunk.content})
    return [{"page": page, "passages": grouped[page]} for page in order]


def suggest_questions(filename: str, chunks: list[Chunk]) -> list[str]:
    title = Path(filename).stem.replace("-", " ").replace("_", " ").strip() or "this document"
    questions = [f"Summarize {title}."]
    seen: set[str] = set()

    for chunk in chunks:
        section = (chunk.metadata_ or {}).get("section")
        if not isinstance(section, str):
            continue
        label = section.strip().lstrip("#").strip()
        if not label or label.lower() in seen:
            continue
        seen.add(label.lower())
        questions.append(f'What does "{label}" say?')
        if len(questions) == 3:
            return questions

    for chunk in chunks:
        line = chunk.content.strip().splitlines()[0].strip()
        if len(line) < 12 or line.lower() in seen:
            continue
        seen.add(line.lower())
        short = line if len(line) <= 80 else f"{line[:77].rstrip()}..."
        questions.append(f'Explain "{short}".')
        if len(questions) == 3:
            return questions

    fillers = [
        f"What are the key points in {title}?",
        f"Which requirements does {title} mention?",
        f"What should I remember from {title}?",
    ]
    for filler in fillers:
        if len(questions) == 3:
            break
        if filler not in questions:
            questions.append(filler)
    return questions[:3]
