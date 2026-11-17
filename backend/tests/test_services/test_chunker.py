import uuid

from app.services.chunker import chunk_pages, contextualize_chunk
from app.services.ingestion import PageContent
from app.services.retrieval.fuse import rrf_fuse
from app.services.retrieval.types import ChunkHit


def test_single_page_short_text():
    pages = [PageContent(page_number=1, text="Hello world")]
    chunks = chunk_pages(pages, chunk_size=512, chunk_overlap=64)
    assert len(chunks) == 1
    assert chunks[0].content == "Hello world"
    assert chunks[0].chunk_index == 0
    assert chunks[0].metadata["page"] == 1


def test_long_text_produces_multiple_chunks():
    text = "word " * 200
    pages = [PageContent(page_number=1, text=text)]
    chunks = chunk_pages(pages, chunk_size=100, chunk_overlap=20)
    assert len(chunks) > 1
    for i, chunk in enumerate(chunks):
        assert chunk.chunk_index == i


def test_multiple_pages():
    pages = [
        PageContent(page_number=1, text="First page content."),
        PageContent(page_number=2, text="Second page content."),
    ]
    chunks = chunk_pages(pages, chunk_size=512, chunk_overlap=0)
    assert len(chunks) >= 1
    assert chunks[0].metadata["page"] == 1


def test_empty_text():
    pages = [PageContent(page_number=1, text="")]
    chunks = chunk_pages(pages, chunk_size=512, chunk_overlap=64)
    assert len(chunks) == 0


def test_section_heading_metadata():
    pages = [
        PageContent(
            page_number=1,
            text="# Vacation Days\nEmployees get leave.\n\n# Parental Leave\nPaid leave is available.",
        )
    ]
    chunks = chunk_pages(pages, chunk_size=200, chunk_overlap=20)
    assert chunks
    assert any(chunk.metadata.get("section") and "Vacation" in chunk.metadata["section"] for chunk in chunks)


def test_resume_keeps_company_with_dates():
    pages = [
        PageContent(
            page_number=1,
            text=(
                "Experience\n"
                "Flatiron Health\n"
                "Senior Software Engineer\n"
                "May 2023 - Present (3 years)\n"
                "New York, United States\n"
                "Worked on oncology-focused healthcare platforms.\n"
                "Walmart Global Tech\n"
                "Senior Full Stack Developer\n"
                "April 2020 - April 2023 (3 years)\n"
                "Worked on Walmart's large-scale e-commerce platform.\n"
            ),
        )
    ]
    chunks = chunk_pages(pages, chunk_size=800, chunk_overlap=40)
    joined = "\n---\n".join(chunk.content for chunk in chunks)
    assert "Flatiron Health" in joined
    flatiron = next(chunk for chunk in chunks if "Flatiron Health" in chunk.content)
    assert "May 2023 - Present" in flatiron.content
    assert "oncology-focused" in flatiron.content
    walmart = next(chunk for chunk in chunks if "Walmart Global Tech" in chunk.content)
    assert "April 2020 - April 2023" in walmart.content
    assert "Flatiron Health" not in walmart.content
    # Company names must not become empty orphan passages.
    assert not any(chunk.content.strip() == "Flatiron Health" for chunk in chunks)
    assert flatiron.metadata.get("section") == "Experience"


def test_contextualize_chunk_adds_document_section():
    text = contextualize_chunk(
        "Worked on oncology platforms.",
        filename="Profile.pdf",
        section="Experience",
        page=1,
    )
    assert "Document: Profile.pdf" in text
    assert "Section: Experience" in text
    assert "Evidence:" in text
    assert "oncology platforms" in text


def test_rrf_fuse_merges_lists():
    a = uuid.uuid4()
    b = uuid.uuid4()
    dense = [
        ChunkHit(a, uuid.uuid4(), "a.md", "alpha", 0.9, {}, dense_rank=1),
        ChunkHit(b, uuid.uuid4(), "b.md", "beta", 0.8, {}, dense_rank=2),
    ]
    sparse = [
        ChunkHit(b, uuid.uuid4(), "b.md", "beta", 0.7, {}, sparse_rank=1),
        ChunkHit(a, uuid.uuid4(), "a.md", "alpha", 0.2, {}, sparse_rank=2),
    ]
    fused = rrf_fuse(dense, sparse, rrf_k=60, top_n=2)
    assert len(fused) == 2
