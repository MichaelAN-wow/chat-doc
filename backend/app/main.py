import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.middleware.logging import RequestLoggingMiddleware


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-5s %(name)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )


configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm MiniLM in the backend process so the first chat isn't a cold load.
    from app.services.embedding import EmbeddingService

    EmbeddingService.get_instance()
    logger.info("Embedding model warmed at startup")
    yield


app = FastAPI(
    title="Knowledge Assistant",
    description="Internal document Q&A API with hybrid RAG",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RequestLoggingMiddleware)

app.include_router(api_router)
