import logging
import re
from dataclasses import dataclass
from pathlib import Path

import fitz  # pymupdf

logger = logging.getLogger(__name__)

_CODE_OR_FENCE = re.compile(
    r"(```[\w.-]*\r?\n[\s\S]*?```|~~~[\w.-]*\r?\n[\s\S]*?~~~|`[^`\n]+`)"
)
_BR_TAG = re.compile(r"<br\s*/?>", re.IGNORECASE)
_HTML_TAG = re.compile(
    r"</?(?:p|div|span|section|article|header|footer|main|nav|aside|strong|b|em|i|u|s|"
    r"ul|ol|li|h[1-6]|font|center|table|thead|tbody|tfoot|tr|td|th|a|img|hr|"
    r"blockquote|pre|code|sup|sub|small|label|button|form|input|textarea|select|"
    r"option|br)(?:\s[^>]*)?/?>",
    re.IGNORECASE,
)


def _sanitize_literal_html(text: str) -> str:
    """Strip leaked HTML tags outside real code; turn <br> into newlines (or · in tables)."""
    if not text or "<" not in text:
        return text

    blocks: list[str] = []

    def _stash(match: re.Match[str]) -> str:
        blocks.append(match.group(0))
        return f"\0CODE{len(blocks) - 1}\0"

    stashed = _CODE_OR_FENCE.sub(_stash, text)
    lines: list[str] = []
    for line in stashed.split("\n"):
        in_table = bool(re.match(r"^\s*\|", line))
        cleaned = _BR_TAG.sub(" · " if in_table else "\n", line)
        cleaned = _HTML_TAG.sub("", cleaned)
        lines.append(cleaned)
    restored = "\n".join(lines)
    return re.sub(
        r"\0CODE(\d+)\0",
        lambda m: blocks[int(m.group(1))],
        restored,
    )


@dataclass
class PageContent:
    page_number: int
    text: str


def extract_text(file_path: str, file_type: str) -> list[PageContent]:
    path = Path(file_path)

    if file_type == "pdf":
        pages = _extract_pdf(path)
    elif file_type in ("md", "markdown"):
        pages = _extract_text_file(path)
    elif file_type == "txt":
        pages = _extract_text_file(path)
    elif file_type == "docx":
        pages = _extract_docx(path)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")
    return [
        PageContent(page_number=page.page_number, text=_sanitize_literal_html(page.text))
        for page in pages
    ]


def _extract_pdf(path: Path) -> list[PageContent]:
    pages = []
    doc = fitz.open(str(path))
    try:
        for i, page in enumerate(doc):
            text = page.get_text().strip()
            if text:
                pages.append(PageContent(page_number=i + 1, text=text))
    finally:
        doc.close()
    logger.info("Extracted %d pages from PDF: %s", len(pages), path.name)
    return pages


def _extract_docx(path: Path) -> list[PageContent]:
    """Extract DOCX paragraphs and tables. Headings become markdown so chunking keeps sections."""
    from docx import Document as DocxDocument

    document = DocxDocument(str(path))
    lines: list[str] = []

    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if not text:
            continue
        style_name = ""
        if paragraph.style is not None and paragraph.style.name:
            style_name = paragraph.style.name
        if style_name.lower().startswith("heading"):
            digits = "".join(char for char in style_name if char.isdigit())
            level = min(int(digits), 6) if digits else 1
            lines.append(f"{'#' * level} {text}")
        else:
            lines.append(text)

    for table in document.tables:
        for row in table.rows:
            cells: list[str] = []
            seen: set[str] = set()
            for cell in row.cells:
                value = cell.text.strip()
                if value and value not in seen:
                    seen.add(value)
                    cells.append(value)
            if cells:
                lines.append(" | ".join(cells))

    text = "\n\n".join(lines).strip()
    if not text:
        return []
    logger.info("Extracted DOCX text from %s (%d chars)", path.name, len(text))
    return [PageContent(page_number=1, text=text)]


def _extract_text_file(path: Path) -> list[PageContent]:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []
    return [PageContent(page_number=1, text=text)]
