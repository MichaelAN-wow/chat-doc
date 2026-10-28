import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db, get_redis

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check(
    db: AsyncSession = Depends(get_db),
):
    status = {
        "status": "ok",
        "db": False,
        "redis": False,
        "embedding_model": settings.EMBEDDING_MODEL,
        "llm_provider": settings.LLM_PROVIDER,
        "llm_model": settings.LLM_MODEL,
        "nvidia_key_set": bool(settings.NVIDIA_API_KEY),
    }

    try:
        await db.execute(text("SELECT 1"))
        status["db"] = True
    except Exception:
        logger.warning("Database health check failed")
        status["status"] = "degraded"

    try:
        redis = await get_redis()
        await redis.ping()
        status["redis"] = True
    except Exception:
        logger.warning("Redis health check failed")
        status["status"] = "degraded"

    return status
