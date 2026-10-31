import logging
import re
from dataclasses import dataclass

from app.config import settings

logger = logging.getLogger(__name__)

# Real section boundaries only — not every title-case company/person line.
MARKDOWN_HEADING_RE = re.compile(r"^#{1,6}\s+\S+")
SECTION_NAMES = {
    "summary",
    "overview",
    "experience",
    "professional experience",
    "work experience",
    "employment",
    "education",
    "skills",
    "top skills",
    "contact",
    "projects",
    "certifications",
    "awards",
    "interests",
    "profile",
    "about",
    "introduction",
    "background",
    "objective",
    "references",
    "appendix",
    "table of contents",
    "contents",
    "abstract",
    "conclusion",
    "policy",
    "policies",
    "guidelines",
    "requirements",
    "scope",
    "definitions",
}
ALL_CAPS_SECTION_RE = re.compile(r"^[A-Z0-9][A-Z0-9 /&-]{2,60}$")
SHORT_LABEL_RE = re.compile(r"^[A-Z][A-Za-z0-9 .,&'’/-]{1,80}$")
DATE_HINT_RE = re.compile(
    r"\b(?:19|20)\d{2}\b.*\b(?:19|20)\d{2}|Present|January|February|March|April|May|June|"
    r"July|August|September|October|November|December",
    re.IGNORECASE,
)


@dataclass
class TextChunk:
    content: str
    chunk_index: int
    start_char: int
    end_char: int
    metadata: dict


def chunk_pages(
    pages: list,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[TextChunk]:
    """Split pages into passages while keeping labels with their following body."""
    chunk_size = chunk_size or settings.CHUNK_SIZE
    chunk_overlap = chunk_overlap or settings.CHUNK_OVERLAP

    sections: list[tuple[str | None, int, str]] = []
    current_section: str | None = None
    section_page = 1
    buffer: list[str] = []
    current_page = 1

    def flush() -> None:
        nonlocal buffer
        text = "\n".join(buffer).strip()
        if text:
            sections.append((current_section, section_page, text))
        buffer = []

    for page in pages:
        current_page = page.page_number
        for line in page.text.splitlines():
            stripped = line.strip()
            if not stripped:
                buffer.append("")
                continue
            if _is_section_heading(stripped) and buffer:
                flush()
                current_section = _heading_label(stripped)
                section_page = current_page
                buffer = [stripped]
            elif _is_block_label(stripped) and _buffer_has_body(buffer):
                # New entity/role block inside the same section (e.g. next employer).
                flush()
                section_page = current_page
                buffer = [stripped]
            else:
                if _is_section_heading(stripped):
                    current_section = _heading_label(stripped)
                    section_page = current_page
                elif not buffer:
                    section_page = current_page
                buffer.append(stripped)
    flush()

    chunks: list[TextChunk] = []
    cursor = 0
    for section, page, text in sections:
        for piece in _split_with_context(text, chunk_size, chunk_overlap):
            start = cursor
            end = cursor + len(piece)
            chunks.append(
                TextChunk(
                    content=piece,
                    chunk_index=len(chunks),
                    start_char=start,
                    end_char=end,
                    metadata={"page": page, "section": section},
                )
            )
            cursor = end

    logger.info("Created %d chunks from %d pages", len(chunks), len(pages))
    return chunks


def contextualize_chunk(
    content: str,
    *,
    filename: str,
    section: str | None = None,
    page: int | None = None,
) -> str:
    """Prefix a passage with document/section context for indexing and prompting."""
    lines = [f"Document: {filename}"]
    if section:
        lines.append(f"Section: {section}")
    if page is not None:
        lines.append(f"Page: {page}")
    lines.append("")
    lines.append("Evidence:")
    lines.append(content.strip())
    return "\n".join(lines)


def _heading_label(line: str) -> str:
    return line.lstrip("# ").strip()


def _is_block_label(line: str) -> bool:
    """Short title-like line that can start a new record inside a section."""
    if _is_section_heading(line):
        return False
    if line.startswith(("-", "•", "*")):
        return False
    if line.endswith("."):
        return False
    if len(line) > 80:
        return False
    if DATE_HINT_RE.search(line) and len(line) > 40:
        return False
    return bool(SHORT_LABEL_RE.match(line))


def _buffer_has_body(buffer: list[str]) -> bool:
    """True when the open buffer already contains prose/bullets for a prior block."""
    body_lines = 0
    for line in buffer:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith(("-", "•", "*")) or len(stripped) > 90 or stripped.endswith("."):
            body_lines += 1
        if body_lines >= 1:
            return True
    return False


def _is_section_heading(line: str) -> bool:
    """True only for document section titles, not entity labels like company names."""
    if MARKDOWN_HEADING_RE.match(line):
        return True
    label = _heading_label(line).lower()
    if label in SECTION_NAMES:
        return True
    # ALL-CAPS short banners (EXPERIENCE, EDUCATION) — not mixed-case names.
    if ALL_CAPS_SECTION_RE.match(line) and line == line.upper() and not line.endswith("."):
        words = line.split()
        if 1 <= len(words) <= 6:
            return True
    return False


def _lead_context(text: str, max_lines: int = 6, max_chars: int = 280) -> str:
    """Keep opening short labels (company, title, dates) with every split piece."""
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return ""
    lead: list[str] = []
    size = 0
    for line in lines[:max_lines]:
        stripped = line.strip()
        # Bullet bodies are not role headers.
        if stripped.startswith(("-", "•", "*")):
            break
        # Stop once body prose starts (long line or sentence-like).
        if lead and (len(stripped) > 90 or stripped.endswith(".")):
            break
        if lead and not SHORT_LABEL_RE.match(stripped) and len(stripped) > 60:
            break
        next_size = size + len(stripped) + 1
        if lead and next_size > max_chars:
            break
        lead.append(stripped)
        size = next_size
        if len(lead) >= 4 and len(stripped) > 70:
            break
    if len(lead) <= 1 and len(lines[0]) > 120:
        return ""
    return "\n".join(lead)


def _split_with_context(text: str, chunk_size: int, overlap: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    lead = _lead_context(text)
    parts = _split_with_overlap(text, chunk_size, overlap)
    if not lead or len(parts) <= 1:
        return parts

    enriched: list[str] = []
    for index, piece in enumerate(parts):
        if index == 0 or piece.lstrip().startswith(lead):
            enriched.append(piece)
            continue
        enriched.append(f"{lead}\n{piece}")
    return enriched


def _split_with_overlap(text: str, chunk_size: int, overlap: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    parts: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            window = text[start:end]
            split_at = max(window.rfind("\n\n"), window.rfind(". "), window.rfind("\n"))
            if split_at > chunk_size // 3:
                end = start + split_at + 1
        piece = text[start:end].strip()
        if piece:
            parts.append(piece)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return parts
