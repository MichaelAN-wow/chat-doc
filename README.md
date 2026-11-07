# Knowledge Assistant

NewPage assignment: upload internal documents, ask questions, get cited answers via hybrid RAG.

## Architecture

```
Upload → FastAPI → Celery (Redis) → parse → chunk → embed → pgvector + FTS
Ask → rewrite → dense + sparse → RRF → refuse or SSE answer + citations (LiteLLM)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, TypeScript, Tailwind CSS (document viewer, citations, DOCX upload) |
| Backend API | Python FastAPI |
| Database | PostgreSQL 16 + pgvector + FTS |
| Task Queue | Celery + Redis |
| LLM | LiteLLM (NVIDIA Build default; OpenAI / DeepSeek / Ollama optional) |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |

### Components

- Ingestion — PDF (pymupdf), DOCX (python-docx), Markdown, plain text
- Chunking — section-aware split with size/overlap
- Embeddings — 384-d MiniLM vectors
- Hybrid search — pgvector + FTS with RRF
- Chat — rewrite → retrieve → refuse or cited SSE answer
- Evals — `POST /api/v1/workspaces/{id}/evals/run`

## Quick Start

### Prerequisites

- Docker and Docker Compose
- NVIDIA API key (or another configured LLM provider)

### Run (light / recommended)

Default compose is production-like: Next.js `start`, no Windows bind mounts, rewrite/dual-retrieve off.

```bash
cd chat-doc
cp .env.example .env
# set NVIDIA_API_KEY in .env
sudo docker compose -f docker-compose.yml up -d --build
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Dev mode (hot reload — heavier)

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

### Usage

1. Open http://localhost:3000
2. Drop a PDF, DOCX, Markdown, or text file (a Library workspace is created for you)
3. Wait until the document is ready
4. Ask a question and click a citation to jump to that passage

## API Endpoints

Base path: `/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/workspaces` | Create workspace |
| GET | `/workspaces` | List workspaces |
| GET | `/workspaces/{id}` | Get workspace |
| PATCH | `/workspaces/{id}` | Update workspace |
| DELETE | `/workspaces/{id}` | Delete workspace |
| POST | `/workspaces/{id}/documents` | Upload document |
| GET | `/workspaces/{id}/documents` | List documents |
| GET | `/documents/{id}` | Document detail |
| DELETE | `/documents/{id}` | Delete document |
| POST | `/documents/{id}/reindex` | Reindex document |
| GET | `/documents/{id}/status` | Processing status |
| GET | `/documents/{id}/file` | Original file bytes |
| GET | `/documents/{id}/text` | Pages and passages for the viewer |
| GET | `/documents/{id}/suggestions` | Three starter questions |
| POST | `/workspaces/{id}/search` | Hybrid search |
| POST | `/workspaces/{id}/conversations` | Create conversation |
| GET | `/workspaces/{id}/conversations` | List conversations |
| GET | `/conversations/{id}/messages` | Messages |
| POST | `/conversations/{id}/chat` | Chat (SSE). Optional `document_id` limits retrieval to that file; optional `top_k` sets how many passages are cited |
| DELETE | `/conversations/{id}` | Delete conversation |

## Project Structure

```
rag-knowledge-base/
├── docker-compose.yml
├── Makefile
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── tasks/
│   │   └── middleware/
│   ├── alembic/
│   └── tests/
└── frontend/
    └── src/
        ├── app/
        ├── components/
        ├── hooks/
        └── lib/
```

## Configuration

See `.env.example`.

```bash
# Default: NVIDIA Build
LLM_PROVIDER=nvidia
LLM_MODEL=nvidia_nim/nvidia/nemotron-3.5-bolt-e4b
NVIDIA_API_KEY=nvapi-...
NVIDIA_API_BASE=https://integrate.api.nvidia.com/v1

# Optional OpenAI
# LLM_PROVIDER=openai
# LLM_MODEL=openai/gpt-4o-mini
# OPENAI_API_KEY=sk-...

# Optional DeepSeek
# LLM_PROVIDER=deepseek
# LLM_MODEL=deepseek/deepseek-flash
# DEEPSEEK_API_KEY=sk-...

# Optional Ollama
# docker compose --profile ollama up
# LLM_PROVIDER=ollama
# LLM_MODEL=ollama/llama3.2
```

### RAG tuning

```bash
CHUNK_SIZE=800
CHUNK_OVERLAP=120
DENSE_TOP_K=20
SPARSE_TOP_K=20
FINAL_TOP_K=5
RRF_K=60
RETRIEVAL_THRESHOLD=0.18
DENSE_MIN_SCORE=0.35
DUAL_QUERY_RETRIEVE=true
REWRITE_ENABLED=true
```

Retrieval notes:
- Rewrite runs only on follow-ups (pronouns / short refs); LLM failure falls back to the original question
- Refusal gates on cosine `dense_score` (plus keyword/sparse escape for codes like `ERR-4402`)
- When rewrite changes the query, hybrid search runs original ∪ rewritten and fuses results

### Evals

Upload documents into a workspace, then:

```bash
curl -X POST http://localhost:8000/api/v1/workspaces/WORKSPACE_ID/evals/run
```

## Development

```bash
make up
make logs
make test-backend
make test-frontend
make lint
make db-migrate
make backend-shell
```
