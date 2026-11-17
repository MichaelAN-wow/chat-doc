import tempfile
from pathlib import Path

import pytest

from app.services.ingestion import extract_text


def test_extract_text_file():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("Hello, this is test content.")
        f.flush()
        pages = extract_text(f.name, "txt")

    assert len(pages) == 1
    assert pages[0].text == "Hello, this is test content."
    assert pages[0].page_number == 1


def test_extract_markdown_file():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
        f.write("# Heading\n\nSome markdown content.")
        f.flush()
        pages = extract_text(f.name, "md")

    assert len(pages) == 1
    assert "# Heading" in pages[0].text


def test_extract_empty_file():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("")
        f.flush()
        pages = extract_text(f.name, "txt")

    assert len(pages) == 0


def test_extract_docx_heading_and_table():
    from docx import Document

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "notes.docx"
        document = Document()
        document.add_heading("Refund policy", level=1)
        document.add_paragraph("Customers may request a refund within 30 days.")
        table = document.add_table(rows=1, cols=2)
        table.rows[0].cells[0].text = "Hours"
        table.rows[0].cells[1].text = "9 to 5"
        document.save(path)
        pages = extract_text(str(path), "docx")

    assert len(pages) == 1
    assert pages[0].page_number == 1
    assert "# Refund policy" in pages[0].text
    assert "30 days" in pages[0].text
    assert "Hours | 9 to 5" in pages[0].text


def test_unsupported_type():
    with pytest.raises(ValueError, match="Unsupported file type"):
        extract_text("/tmp/test.xyz", "xyz")


def test_extract_strips_literal_html_outside_code():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False, encoding="utf-8") as f:
        f.write("Duty A<br>Duty B\n\nKeep `<br>` and:\n```html\n<br>\n```\n")
        f.flush()
        pages = extract_text(f.name, "md")

    assert len(pages) == 1
    assert "<br>" not in pages[0].text.replace("`<br>`", "").replace("```html\n<br>\n```", "")
    assert "Duty A\nDuty B" in pages[0].text
    assert "`<br>`" in pages[0].text
    assert "```html\n<br>\n```" in pages[0].text
